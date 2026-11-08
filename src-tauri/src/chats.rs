use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::{Db, new_id, now_millis};
use crate::error::{AppError, AppResult};
use crate::workspaces::project;

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

const CHAT_COLUMNS: &str = "id, workspace_id, project_id, provider, command, model, effort, session_id, title, \
    state, created_at, updated_at";

fn chat_from_row(row: &Row<'_>) -> rusqlite::Result<Chat> {
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

pub fn chats(connection: &Connection) -> AppResult<Vec<Chat>> {
    let mut statement = connection.prepare(&format!("SELECT {CHAT_COLUMNS} FROM chats ORDER BY updated_at DESC"))?;
    let all = statement.query_map([], chat_from_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(all)
}

pub fn insert_chat(connection: &Connection, draft: NewChat) -> AppResult<Chat> {
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
    };
    connection.execute(
        &format!("INSERT INTO chats ({CHAT_COLUMNS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"),
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
            created.updated_at
        ],
    )?;
    Ok(created)
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

#[tauri::command]
pub fn list_chats(db: State<'_, Db>) -> AppResult<Vec<Chat>> {
    chats(&db.connection())
}

#[tauri::command]
pub fn create_chat(db: State<'_, Db>, draft: NewChat) -> AppResult<Chat> {
    insert_chat(&db.connection(), draft)
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
        let created = insert_chat(&connection, draft(project_id(&connection))).unwrap();
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
        assert!(insert_chat(&connection, bad).is_err());
    }

    #[test]
    fn stores_a_cleaned_capped_title_and_reports_real_changes_only() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        let created = insert_chat(&connection, draft(project_id(&connection))).unwrap();
        assert!(update_title(&connection, &created.id, "  Nearby\u{0}stores\n sorting  ").unwrap());
        assert_eq!(chat(&connection, &created.id).unwrap().title, "Nearby stores sorting");
        assert!(!update_title(&connection, &created.id, "Nearby stores sorting").unwrap());
        assert!(update_title(&connection, &created.id, " \t ").is_err());
        let long = "a".repeat(MAX_TITLE_LENGTH + 50);
        update_title(&connection, &created.id, &long).unwrap();
        assert_eq!(chat(&connection, &created.id).unwrap().title.chars().count(), MAX_TITLE_LENGTH);
    }

    #[test]
    fn rejects_unknown_commands_at_the_boundary() {
        let parsed: Result<AgentCommand, _> = serde_json::from_str("\"bash\"");
        assert!(parsed.is_err());
    }
}
