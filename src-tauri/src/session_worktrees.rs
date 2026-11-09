use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use crate::chats;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::git::{self, Diff, Git, READ_LIMITS, validated_id, validated_path};
use crate::subprocess::in_background;
use crate::workspaces::project;

const CLAUDE_WORKTREES_FOLDER: &str = ".claude/worktrees";
const BRANCH_PREFIX: &str = "refs/heads/";
const NOT_A_SESSION_WORKTREE: &str = "this worktree does not belong to the chat";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiffFile {
    pub path: String,
    pub added: u64,
    pub removed: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionWorktree {
    pub path: String,
    pub name: String,
    pub branch: Option<String>,
    pub is_chat_root: bool,
    pub files: Vec<DiffFile>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct ListedWorktree {
    path: PathBuf,
    head: Option<String>,
    branch: Option<String>,
    is_usable: bool,
    is_chat_root: bool,
}

struct SessionRoots {
    chat_root: PathBuf,
    project_root: PathBuf,
}

fn parse_worktrees(listing: &str) -> Vec<ListedWorktree> {
    let mut worktrees: Vec<ListedWorktree> = Vec::new();
    for field in listing.split('\0') {
        let (key, value) = field.split_once(' ').unwrap_or((field, ""));
        if key == "worktree" {
            worktrees.push(ListedWorktree { path: PathBuf::from(value), is_usable: true, ..ListedWorktree::default() });
            continue;
        }
        let Some(current) = worktrees.last_mut() else { continue };
        match key {
            "HEAD" => current.head = Some(value.to_string()),
            "branch" => current.branch = Some(value.trim_start_matches(BRANCH_PREFIX).to_string()),
            "bare" | "prunable" => current.is_usable = false,
            _ => {}
        }
    }
    worktrees
}

fn canonical(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn chat_root_index(worktrees: &[ListedWorktree], chat_root: &Path) -> Option<usize> {
    worktrees
        .iter()
        .enumerate()
        .filter(|(_, worktree)| chat_root.starts_with(canonical(&worktree.path)))
        .max_by_key(|(_, worktree)| worktree.path.components().count())
        .map(|(index, _)| index)
}

fn session_worktrees(listing: &str, roots: &SessionRoots) -> Vec<ListedWorktree> {
    let chat_root = canonical(&roots.chat_root);
    let owners =
        [chat_root.join(CLAUDE_WORKTREES_FOLDER), canonical(&roots.project_root).join(CLAUDE_WORKTREES_FOLDER)];
    let is_owned = |worktree: &ListedWorktree| {
        canonical(&worktree.path).parent().is_some_and(|parent| owners.iter().any(|owner| owner == parent))
    };
    let usable: Vec<ListedWorktree> =
        parse_worktrees(listing).into_iter().filter(|worktree| worktree.is_usable).collect();
    let Some(root_index) = chat_root_index(&usable, &chat_root) else { return Vec::new() };
    let root = ListedWorktree { is_chat_root: true, ..usable[root_index].clone() };
    let others = usable
        .into_iter()
        .enumerate()
        .filter(|(index, worktree)| *index != root_index && is_owned(worktree))
        .map(|(_, worktree)| worktree);
    std::iter::once(root).chain(others).collect()
}

fn listed_worktrees(roots: &SessionRoots) -> AppResult<Vec<ListedWorktree>> {
    let listing = Git::at(&roots.chat_root).output(&["worktree", "list", "--porcelain", "-z"])?;
    Ok(session_worktrees(&listing, roots))
}

fn listed_at(worktrees: &[ListedWorktree], path: &str) -> AppResult<ListedWorktree> {
    worktrees
        .iter()
        .find(|worktree| worktree.path.to_string_lossy() == path)
        .cloned()
        .ok_or_else(|| AppError::Invalid(NOT_A_SESSION_WORKTREE.into()))
}

fn chat_root_head(worktrees: &[ListedWorktree]) -> Option<String> {
    worktrees.first().and_then(|root| root.head.clone())
}

fn fork_point(git: &Git, chat_root_head: &str, head: &str) -> AppResult<Option<String>> {
    let output = git.run(&["merge-base", chat_root_head, head], READ_LIMITS)?;
    Ok(output.is_success.then(|| output.stdout.trim().to_string()))
}

fn diff_base(worktree: &ListedWorktree, chat_root_head: Option<&str>) -> AppResult<String> {
    let git = Git::at(&worktree.path);
    let heads = chat_root_head.zip(worktree.head.as_deref()).filter(|_| !worktree.is_chat_root);
    if let Some((root_head, head)) = heads
        && let Some(base) = fork_point(&git, root_head, head)?
    {
        return Ok(base);
    }
    git::head_base(&git)
}

fn untracked_files(git: &Git) -> AppResult<Vec<String>> {
    let listing = git.output(&["ls-files", "--others", "--exclude-standard", "-z"])?;
    Ok(listing.split('\0').filter(|path| !path.is_empty()).map(String::from).collect())
}

fn changed_files(git: &Git, base: &str) -> AppResult<Vec<DiffFile>> {
    let tracked =
        git::line_counts(git, &[base])?.into_iter().map(|(path, (added, removed))| DiffFile { path, added, removed });
    let untracked = untracked_files(git)?.into_iter().map(|path| DiffFile { path, added: 0, removed: 0 });
    let mut files: Vec<DiffFile> = tracked.chain(untracked).collect();
    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(files)
}

fn with_changes(worktree: ListedWorktree, chat_root_head: Option<&str>) -> AppResult<SessionWorktree> {
    let base = diff_base(&worktree, chat_root_head)?;
    Ok(SessionWorktree {
        name: worktree.path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default(),
        files: changed_files(&Git::at(&worktree.path), &base)?,
        path: worktree.path.to_string_lossy().into_owned(),
        branch: worktree.branch,
        is_chat_root: worktree.is_chat_root,
    })
}

fn worktrees_with_changes(roots: &SessionRoots) -> AppResult<Vec<SessionWorktree>> {
    let worktrees = listed_worktrees(roots)?;
    let root_head = chat_root_head(&worktrees);
    worktrees.into_iter().map(|worktree| with_changes(worktree, root_head.as_deref())).collect()
}

fn worktree_diff(roots: &SessionRoots, worktree_path: &str, file: Option<&str>) -> AppResult<Diff> {
    let worktrees = listed_worktrees(roots)?;
    let worktree = listed_at(&worktrees, worktree_path)?;
    let base = diff_base(&worktree, chat_root_head(&worktrees).as_deref())?;
    git::diff_against(&Git::at(&worktree.path), &base, file)
}

fn session_roots(db: &Db, chat_id: &str) -> AppResult<SessionRoots> {
    validated_id(chat_id, "chat")?;
    let connection = db.connection();
    let chat = chats::chat(&connection, chat_id)?;
    let chat_root = chats::chat_root(&connection, &chat)?;
    let project_root = PathBuf::from(project(&connection, &chat.project_id)?.path);
    Ok(SessionRoots { chat_root, project_root })
}

#[tauri::command]
pub async fn list_session_worktrees(db: State<'_, Db>, chat_id: String) -> AppResult<Vec<SessionWorktree>> {
    let roots = session_roots(&db, &chat_id)?;
    in_background(move || worktrees_with_changes(&roots)).await
}

#[tauri::command]
pub async fn session_worktree_diff(
    db: State<'_, Db>,
    chat_id: String,
    worktree_path: String,
    file: Option<String>,
) -> AppResult<Diff> {
    let roots = session_roots(&db, &chat_id)?;
    let file = file.map(|file| validated_path(&file)).transpose()?;
    in_background(move || worktree_diff(&roots, &worktree_path, file.as_deref())).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::testing::{identified, scratch_repo, write};

    const LISTING: &str = "worktree /code/harbor\0HEAD aaa\0branch refs/heads/main\0\0\
        worktree /code/harbor/.claude/worktrees/fix-sort\0HEAD bbb\0branch refs/heads/fix-sort\0\0\
        worktree /code/harbor/.claude/worktrees/gone\0HEAD ccc\0detached\0prunable gitdir file points nowhere\0\0\
        worktree /code/harbor/.claude/worktrees/deep/nested\0HEAD ddd\0detached\0\0\
        worktree /data/worktrees/harbor/onyx-limits\0HEAD eee\0branch refs/heads/onyx/limits\0\0\
        worktree /data/worktrees/harbor/onyx-limits/.claude/worktrees/agent-1\0HEAD fff\0detached\0\0\
        worktree /code/elsewhere\0HEAD ggg\0branch refs/heads/other\0\0";

    fn roots(chat_root: &str, project_root: &str) -> SessionRoots {
        SessionRoots { chat_root: PathBuf::from(chat_root), project_root: PathBuf::from(project_root) }
    }

    fn paths(worktrees: &[ListedWorktree]) -> Vec<String> {
        worktrees.iter().map(|worktree| worktree.path.to_string_lossy().into_owned()).collect()
    }

    #[test]
    fn keeps_the_chat_root_and_only_the_claude_worktrees_of_the_session() {
        let in_onyx_worktree = session_worktrees(LISTING, &roots("/data/worktrees/harbor/onyx-limits", "/code/harbor"));
        assert_eq!(
            paths(&in_onyx_worktree),
            vec![
                "/data/worktrees/harbor/onyx-limits",
                "/code/harbor/.claude/worktrees/fix-sort",
                "/data/worktrees/harbor/onyx-limits/.claude/worktrees/agent-1",
            ]
        );
        assert!(in_onyx_worktree[0].is_chat_root && !in_onyx_worktree[1].is_chat_root);
        assert_eq!(in_onyx_worktree[0].head.as_deref(), Some("eee"));
        assert_eq!(in_onyx_worktree[1].branch.as_deref(), Some("fix-sort"));
        let in_project = session_worktrees(LISTING, &roots("/code/harbor", "/code/harbor"));
        assert_eq!(paths(&in_project), vec!["/code/harbor", "/code/harbor/.claude/worktrees/fix-sort"]);
        let in_claude_worktree =
            session_worktrees(LISTING, &roots("/code/harbor/.claude/worktrees/fix-sort", "/code/harbor"));
        assert_eq!(paths(&in_claude_worktree), vec!["/code/harbor/.claude/worktrees/fix-sort"]);
    }

    #[test]
    fn rejects_a_path_that_is_not_one_of_the_listed_worktrees() {
        let listed = session_worktrees(LISTING, &roots("/code/harbor", "/code/harbor"));
        assert!(listed_at(&listed, "/code/harbor/.claude/worktrees/fix-sort").is_ok());
        for foreign in
            ["/code/elsewhere", "/code/harbor/.claude/worktrees/deep/nested", "/code/harbor/../elsewhere", ""]
        {
            assert!(
                matches!(listed_at(&listed, foreign), Err(AppError::Invalid(reason)) if reason == NOT_A_SESSION_WORKTREE)
            );
        }
    }

    #[test]
    fn diffs_a_claude_worktree_against_where_it_forked_from_the_chat() {
        let Some((root, git)) = scratch_repo("session-worktrees") else { return };
        write(&root, ".git/info/exclude", ".claude/\n");
        write(&root, "a.txt", "one\n");
        git.output(&["add", "a.txt"]).unwrap();
        git.output(&["commit", "-q", "-m", "start"]).unwrap();
        let agent = root.join(".claude/worktrees/agent");
        let outside = root.with_file_name(format!("{}-outside", root.file_name().unwrap().to_string_lossy()));
        git.output(&["worktree", "add", "-q", "-b", "agent", &agent.to_string_lossy()]).unwrap();
        git.output(&["worktree", "add", "-q", "-b", "outside", &outside.to_string_lossy()]).unwrap();
        let agent_git = identified(&Git::at(&agent));
        write(&agent, "b.txt", "committed\n");
        agent_git.output(&["add", "b.txt"]).unwrap();
        agent_git.output(&["commit", "-q", "-m", "agent work"]).unwrap();
        write(&agent, "a.txt", "agent edit\n");
        write(&agent, "c.txt", "untracked\n");
        write(&root, "d.txt", "main moved on\n");
        git.output(&["add", "d.txt"]).unwrap();
        git.output(&["commit", "-q", "-m", "main only"]).unwrap();

        let session = SessionRoots { chat_root: root.clone(), project_root: root.clone() };
        let worktrees = worktrees_with_changes(&session).unwrap();
        assert_eq!(worktrees.len(), 2);
        assert!(worktrees[0].is_chat_root && worktrees[0].files.is_empty());
        let listed_agent = &worktrees[1];
        assert_eq!((listed_agent.name.as_str(), listed_agent.branch.as_deref()), ("agent", Some("agent")));
        let changed: Vec<_> =
            listed_agent.files.iter().map(|file| (file.path.as_str(), file.added, file.removed)).collect();
        assert_eq!(changed, vec![("a.txt", 1, 1), ("b.txt", 1, 0), ("c.txt", 0, 0)]);
        let committed = worktree_diff(&session, &listed_agent.path, Some("b.txt")).unwrap();
        assert!(committed.text.contains("+committed"));
        let uncommitted = worktree_diff(&session, &listed_agent.path, Some("a.txt")).unwrap();
        assert!(uncommitted.text.contains("+agent edit") && !uncommitted.text.contains("d.txt"));
        let rejected = worktree_diff(&session, &outside.to_string_lossy(), None);
        assert!(matches!(rejected, Err(AppError::Invalid(reason)) if reason == NOT_A_SESSION_WORKTREE));
    }
}
