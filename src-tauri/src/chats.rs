use std::collections::HashSet;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::branches::ProjectBranches;
use crate::db::{Db, new_id, now_millis};
use crate::error::{AppError, AppResult};
use crate::git;
use crate::prs::{ChatPullRequest, GitHub};
use crate::subprocess::in_background;
use crate::workspaces::project;
use crate::worktrees::{self, WORK_IN_WORKTREES_SETTING, Worktree};

const MAX_TITLE_LENGTH: usize = 200;
const MAX_OPTION_LENGTH: usize = 64;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ChatState {
    Running,
    Permission,
    Question,
    Review,
    Failed,
    Done,
}

impl ChatState {
    pub fn is_turn_active(self) -> bool {
        matches!(self, ChatState::Running | ChatState::Permission | ChatState::Question)
    }

    fn as_str(self) -> &'static str {
        match self {
            ChatState::Running => "running",
            ChatState::Permission => "permission",
            ChatState::Question => "question",
            ChatState::Review => "review",
            ChatState::Failed => "failed",
            ChatState::Done => "done",
        }
    }

    fn parse(text: &str) -> ChatState {
        match text {
            "running" => ChatState::Running,
            "permission" => ChatState::Permission,
            "question" => ChatState::Question,
            "failed" => ChatState::Failed,
            "done" => ChatState::Done,
            _ => ChatState::Review,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Provider {
    #[serde(rename = "Claude Code")]
    Claude,
    Codex,
}

impl Provider {
    fn as_str(self) -> &'static str {
        match self {
            Provider::Claude => "Claude Code",
            Provider::Codex => "Codex",
        }
    }

    fn parse(text: &str) -> Provider {
        if text == "Codex" { Provider::Codex } else { Provider::Claude }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum AgentCommand {
    #[serde(rename = "claude")]
    Claude,
    #[serde(rename = "claude-lyxa")]
    ClaudeLyxa,
    #[serde(rename = "claude-lyxa-team")]
    ClaudeLyxaTeam,
    #[serde(rename = "codex")]
    Codex,
}

impl AgentCommand {
    pub fn as_str(self) -> &'static str {
        match self {
            AgentCommand::Claude => "claude",
            AgentCommand::ClaudeLyxa => "claude-lyxa",
            AgentCommand::ClaudeLyxaTeam => "claude-lyxa-team",
            AgentCommand::Codex => "codex",
        }
    }

    fn parse(text: &str) -> AgentCommand {
        match text {
            "claude-lyxa" => AgentCommand::ClaudeLyxa,
            "claude-lyxa-team" => AgentCommand::ClaudeLyxaTeam,
            "codex" => AgentCommand::Codex,
            _ => AgentCommand::Claude,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Chat {
    pub id: String,
    pub workspace_id: String,
    pub project_id: String,
    pub provider: Provider,
    pub command: AgentCommand,
    pub model: String,
    pub effort: String,
    pub session_id: String,
    pub title: String,
    pub state: ChatState,
    pub created_at: i64,
    pub updated_at: i64,
    pub branch: Option<String>,
    pub worktree_path: Option<String>,
    pub is_worktree_removed: bool,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct ChatCheckout {
    pub branch: Option<String>,
    pub worktree_path: Option<String>,
}

impl From<Worktree> for ChatCheckout {
    fn from(worktree: Worktree) -> Self {
        ChatCheckout {
            branch: Some(worktree.branch),
            worktree_path: Some(worktree.path.to_string_lossy().into_owned()),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ListedChat {
    #[serde(flatten)]
    pub chat: Chat,
    pub pr: Option<ChatPullRequest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewChat {
    pub project_id: String,
    pub provider: Provider,
    pub command: AgentCommand,
    pub model: String,
    pub effort: String,
    pub title: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatOptions {
    pub command: AgentCommand,
    pub model: String,
    pub effort: String,
}

const CHAT_COLUMNS: &str = "id, workspace_id, project_id, provider, command, model, effort, session_id, title, \
    state, created_at, updated_at, branch, worktree_path";

fn chat_from_row(row: &Row<'_>) -> rusqlite::Result<Chat> {
    let worktree_path: Option<String> = row.get(13)?;
    Ok(Chat {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        project_id: row.get(2)?,
        provider: Provider::parse(&row.get::<_, String>(3)?),
        command: AgentCommand::parse(&row.get::<_, String>(4)?),
        model: row.get(5)?,
        effort: row.get(6)?,
        session_id: row.get(7)?,
        title: row.get(8)?,
        state: ChatState::parse(&row.get::<_, String>(9)?),
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        branch: row.get(12)?,
        is_worktree_removed: worktree_path.as_deref().is_some_and(|path| !Path::new(path).is_dir()),
        worktree_path,
    })
}

fn is_option_value(value: &str) -> bool {
    value.len() <= MAX_OPTION_LENGTH
        && value.chars().all(|character| character.is_ascii_alphanumeric() || "-_.[]".contains(character))
}

fn validated(draft: NewChat) -> AppResult<NewChat> {
    let title = draft.title.trim().to_string();
    if title.is_empty() || title.chars().count() > MAX_TITLE_LENGTH {
        return Err(AppError::Invalid(format!("title must be 1 to {MAX_TITLE_LENGTH} characters")));
    }
    if !is_option_value(&draft.model) || !is_option_value(&draft.effort) {
        return Err(AppError::Invalid("model and effort may only hold letters, digits and -_.[]".into()));
    }
    Ok(NewChat { title, ..draft })
}

pub fn chat(connection: &Connection, chat_id: &str) -> AppResult<Chat> {
    connection
        .query_row(&format!("SELECT {CHAT_COLUMNS} FROM chats WHERE id = ?1"), [chat_id], chat_from_row)
        .optional()?
        .ok_or(AppError::NotFound("chat"))
}

pub fn chat_root(connection: &Connection, chat: &Chat) -> AppResult<PathBuf> {
    let Some(worktree) = &chat.worktree_path else {
        return Ok(PathBuf::from(project(connection, &chat.project_id)?.path));
    };
    if chat.is_worktree_removed {
        return Err(AppError::NotFound("this chat's worktree"));
    }
    Ok(PathBuf::from(worktree))
}

pub fn chats(connection: &Connection) -> AppResult<Vec<Chat>> {
    let mut statement = connection.prepare(&format!("SELECT {CHAT_COLUMNS} FROM chats ORDER BY updated_at DESC"))?;
    let all = statement.query_map([], chat_from_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(all)
}

pub fn insert_chat(connection: &Connection, draft: NewChat, checkout: ChatCheckout) -> AppResult<Chat> {
    let draft = validated(draft)?;
    let owner = project(connection, &draft.project_id)?;
    let now = now_millis();
    let created = Chat {
        id: new_id(),
        workspace_id: owner.workspace_id,
        project_id: owner.id,
        provider: draft.provider,
        command: draft.command,
        model: draft.model,
        effort: draft.effort,
        session_id: new_id(),
        title: draft.title,
        state: ChatState::Review,
        created_at: now,
        updated_at: now,
        branch: checkout.branch,
        worktree_path: checkout.worktree_path,
        is_worktree_removed: false,
    };
    connection.execute(
        &format!(
            "INSERT INTO chats ({CHAT_COLUMNS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)"
        ),
        params![
            created.id,
            created.workspace_id,
            created.project_id,
            created.provider.as_str(),
            created.command.as_str(),
            created.model,
            created.effort,
            created.session_id,
            created.title,
            created.state.as_str(),
            created.created_at,
            created.updated_at,
            created.branch,
            created.worktree_path
        ],
    )?;
    Ok(created)
}

pub fn update_options(connection: &Connection, chat_id: &str, options: &ChatOptions) -> AppResult<()> {
    if !is_option_value(&options.model) || !is_option_value(&options.effort) {
        return Err(AppError::Invalid("model and effort may only hold letters, digits and -_.[]".into()));
    }
    if options.command == AgentCommand::Codex {
        return Err(AppError::Invalid("a Claude Code chat cannot switch to codex".into()));
    }
    let changed = connection.execute(
        "UPDATE chats SET command = ?2, model = ?3, effort = ?4 WHERE id = ?1",
        params![chat_id, options.command.as_str(), options.model, options.effort],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound("chat"));
    }
    Ok(())
}

pub fn update_state(connection: &Connection, chat_id: &str, state: ChatState) -> AppResult<()> {
    let changed = connection.execute(
        "UPDATE chats SET state = ?2, updated_at = ?3 WHERE id = ?1",
        params![chat_id, state.as_str(), now_millis()],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound("chat"));
    }
    Ok(())
}

fn cleaned_title(raw: &str) -> Option<String> {
    let joined = raw
        .split(|character: char| character.is_whitespace() || character.is_control())
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let capped: String = joined.chars().take(MAX_TITLE_LENGTH).collect();
    let trimmed = capped.trim_end();
    if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
}

pub fn update_title(connection: &Connection, chat_id: &str, raw_title: &str) -> AppResult<bool> {
    let title = cleaned_title(raw_title).ok_or_else(|| AppError::Invalid("title is empty".into()))?;
    let changed =
        connection.execute("UPDATE chats SET title = ?2 WHERE id = ?1 AND title <> ?2", params![chat_id, title])?;
    Ok(changed > 0)
}

pub fn settle_orphaned_turns(connection: &Connection) -> AppResult<()> {
    connection.execute("UPDATE chats SET state = 'review' WHERE state IN ('running', 'permission', 'question')", [])?;
    Ok(())
}

pub fn update_session_id(connection: &Connection, chat_id: &str, session_id: &str) -> AppResult<()> {
    connection.execute("UPDATE chats SET session_id = ?2 WHERE id = ?1", params![chat_id, session_id])?;
    Ok(())
}

fn with_pull_request(github: &GitHub, chat: Chat) -> ListedChat {
    let pr = chat.branch.as_deref().and_then(|branch| github.chat_pull_request(&chat.project_id, branch));
    ListedChat { chat, pr }
}

#[tauri::command]
pub fn list_chats(app: AppHandle, db: State<'_, Db>, github: State<'_, GitHub>) -> AppResult<Vec<ListedChat>> {
    let all = chats(&db.connection())?;
    let branched: HashSet<String> =
        all.iter().filter(|chat| chat.branch.is_some()).map(|chat| chat.project_id.clone()).collect();
    github.refresh_stale(&app, branched);
    Ok(all.into_iter().map(|chat| with_pull_request(&github, chat)).collect())
}

fn works_in_worktrees(connection: &Connection) -> AppResult<bool> {
    let value: Option<String> = connection
        .query_row("SELECT value FROM settings WHERE key = ?1", [WORK_IN_WORKTREES_SETTING], |row| row.get(0))
        .optional()?;
    Ok(value.as_deref() == Some("true"))
}

fn worktrees_root(app: &AppHandle) -> AppResult<PathBuf> {
    let data_dir = app.path().app_data_dir().map_err(|error| AppError::Agent(error.to_string()))?;
    Ok(worktrees::worktrees_root(&data_dir))
}

async fn checkout_for(app: &AppHandle, root: PathBuf, title: String, in_worktree: bool) -> AppResult<ChatCheckout> {
    if !in_worktree {
        let branch = in_background(move || Ok(git::branch_at(&root))).await?;
        return Ok(ChatCheckout { branch, worktree_path: None });
    }
    let worktrees_root = worktrees_root(app)?;
    let created = in_background(move || worktrees::create(&root, &worktrees_root, &title)).await?;
    Ok(created.into())
}

#[tauri::command]
pub async fn create_chat(app: AppHandle, db: State<'_, Db>, draft: NewChat) -> AppResult<Chat> {
    let draft = validated(draft)?;
    let (root, in_worktree) = {
        let connection = db.connection();
        (PathBuf::from(project(&connection, &draft.project_id)?.path), works_in_worktrees(&connection)?)
    };
    let checkout = checkout_for(&app, root, draft.title.clone(), in_worktree).await?;
    insert_chat(&db.connection(), draft, checkout)
}

#[tauri::command]
pub async fn remove_chat_worktree(
    app: AppHandle,
    db: State<'_, Db>,
    project_branches: State<'_, ProjectBranches>,
    chat_id: String,
) -> AppResult<Chat> {
    git::validated_id(&chat_id, "chat")?;
    let (chat, project_root) = {
        let connection = db.connection();
        let chat = chat(&connection, &chat_id)?;
        let root = PathBuf::from(project(&connection, &chat.project_id)?.path);
        (chat, root)
    };
    let worktree = chat.worktree_path.clone().ok_or_else(|| AppError::Invalid("this chat has no worktree".into()))?;
    if chat.state.is_turn_active() {
        return Err(AppError::Invalid("stop the agent before removing its worktree".into()));
    }
    let worktrees_root = worktrees_root(&app)?;
    in_background(move || worktrees::remove(&project_root, &worktrees_root, Path::new(&worktree))).await?;
    project_branches.forget(&chat.project_id);
    let connection = db.connection();
    update_state(&connection, &chat_id, ChatState::Done)?;
    self::chat(&connection, &chat_id)
}

#[tauri::command]
pub fn set_chat_state(db: State<'_, Db>, chat_id: String, state: ChatState) -> AppResult<Chat> {
    let connection = db.connection();
    update_state(&connection, &chat_id, state)?;
    chat(&connection, &chat_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspaces::{ensure_default_workspace, workspaces};

    fn project_id(connection: &Connection) -> String {
        ensure_default_workspace(connection).unwrap();
        let workspace_id = workspaces(connection).unwrap()[0].id.clone();
        connection
            .execute(
                "INSERT INTO projects (id, workspace_id, path, name) VALUES ('p1', ?1, '/tmp/p1', 'p1')",
                [workspace_id],
            )
            .unwrap();
        "p1".into()
    }

    fn draft(project_id: String) -> NewChat {
        NewChat {
            project_id,
            provider: Provider::Claude,
            command: AgentCommand::ClaudeLyxaTeam,
            model: "default".into(),
            effort: "high".into(),
            title: " Fix the sort ".into(),
        }
    }

    #[test]
    fn creates_a_chat_with_its_own_session_and_round_trips_state() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        let created = insert_chat(&connection, draft(project_id(&connection)), ChatCheckout::default()).unwrap();
        assert_eq!(created.title, "Fix the sort");
        assert!(uuid::Uuid::parse_str(&created.session_id).is_ok());
        update_state(&connection, &created.id, ChatState::Done).unwrap();
        let loaded = chat(&connection, &created.id).unwrap();
        assert_eq!(loaded.state, ChatState::Done);
        assert_eq!(loaded.command, AgentCommand::ClaudeLyxaTeam);
    }

    #[test]
    fn rejects_shell_characters_in_model_and_effort() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        let bad = NewChat { model: "opus; echo pwned".into(), ..draft(project_id(&connection)) };
        assert!(insert_chat(&connection, bad, ChatCheckout::default()).is_err());
    }

    #[test]
    fn stores_a_cleaned_capped_title_and_reports_real_changes_only() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        let created = insert_chat(&connection, draft(project_id(&connection)), ChatCheckout::default()).unwrap();
        assert!(update_title(&connection, &created.id, "  Nearby\u{0}stores\n sorting  ").unwrap());
        assert_eq!(chat(&connection, &created.id).unwrap().title, "Nearby stores sorting");
        assert!(!update_title(&connection, &created.id, "Nearby stores sorting").unwrap());
        assert!(update_title(&connection, &created.id, " \t ").is_err());
        let long = "a".repeat(MAX_TITLE_LENGTH + 50);
        update_title(&connection, &created.id, &long).unwrap();
        assert_eq!(chat(&connection, &created.id).unwrap().title.chars().count(), MAX_TITLE_LENGTH);
    }

    #[test]
    fn changes_the_command_model_and_effort_of_a_chat() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        let created = insert_chat(&connection, draft(project_id(&connection)), ChatCheckout::default()).unwrap();
        let options = ChatOptions { command: AgentCommand::Claude, model: "opus".into(), effort: "max".into() };
        update_options(&connection, &created.id, &options).unwrap();
        let loaded = chat(&connection, &created.id).unwrap();
        let saved = (loaded.command, loaded.model.as_str(), loaded.effort.as_str());
        assert_eq!(saved, (AgentCommand::Claude, "opus", "max"));
        let shell = ChatOptions { model: "opus; rm -rf /".into(), ..options.clone() };
        assert!(update_options(&connection, &created.id, &shell).is_err());
        let codex = ChatOptions { command: AgentCommand::Codex, ..options };
        assert!(update_options(&connection, &created.id, &codex).is_err());
    }

    #[test]
    fn rejects_unknown_commands_at_the_boundary() {
        let parsed: Result<AgentCommand, _> = serde_json::from_str("\"bash\"");
        assert!(parsed.is_err());
    }

    #[test]
    fn stores_and_lists_the_branch_a_chat_runs_on() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        let checkout = ChatCheckout { branch: Some("onyx/fix-the-sort".into()), worktree_path: None };
        let created = insert_chat(&connection, draft(project_id(&connection)), checkout).unwrap();
        assert_eq!(chat(&connection, &created.id).unwrap().branch.as_deref(), Some("onyx/fix-the-sort"));
        let listed = with_pull_request(&GitHub::default(), created);
        let wire = serde_json::to_value(&listed).unwrap();
        assert_eq!(wire["branch"], "onyx/fix-the-sort");
        assert!(wire["pr"].is_null());
    }

    #[test]
    fn rejects_paths_and_modes_supplied_by_the_ui() {
        let base = r#""projectId":"p1","provider":"Claude Code","command":"claude","model":"default","effort":"high""#;
        assert!(serde_json::from_str::<NewChat>(&format!(r#"{{{base},"title":"t"}}"#)).is_ok());
        for extra in [r#""newBranch":true"#, r#""worktreePath":"/etc""#, r#""branch":"x""#] {
            assert!(serde_json::from_str::<NewChat>(&format!(r#"{{{base},"title":"t",{extra}}}"#)).is_err());
        }
    }

    #[test]
    fn runs_a_chat_in_its_worktree_and_reports_it_once_removed() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        let worktree = std::env::temp_dir().join(format!("onyx-hive-chat-root-{}", new_id()));
        std::fs::create_dir_all(&worktree).unwrap();
        let checkout = ChatCheckout {
            branch: Some("onyx/x".into()),
            worktree_path: Some(worktree.to_string_lossy().into_owned()),
        };
        let created = insert_chat(&connection, draft(project_id(&connection)), checkout).unwrap();
        assert_eq!(chat_root(&connection, &created).unwrap(), worktree);
        std::fs::remove_dir(&worktree).unwrap();
        let reloaded = chat(&connection, &created.id).unwrap();
        assert!(reloaded.is_worktree_removed);
        assert!(chat_root(&connection, &reloaded).is_err());
        let local = insert_chat(&connection, draft("p1".into()), ChatCheckout::default()).unwrap();
        assert_eq!(chat_root(&connection, &local).unwrap(), PathBuf::from("/tmp/p1"));
    }

    #[test]
    fn reads_the_worktree_setting_as_off_until_turned_on() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        assert!(!works_in_worktrees(&connection).unwrap());
        crate::settings::store_setting(&connection, WORK_IN_WORKTREES_SETTING, "true").unwrap();
        assert!(works_in_worktrees(&connection).unwrap());
    }
}
