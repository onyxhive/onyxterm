use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use tauri::State;

use crate::chats;
use crate::db::{Db, new_id};
use crate::error::{AppError, AppResult};
use crate::git::{self, Git, validated_id};
use crate::subprocess::{Limits, in_background};

const CHECKPOINT_NAMESPACE: &str = "refs/onyx/checkpoints";
const SCRATCH_INDEX_PREFIX: &str = "onyx-checkpoint-";
const LOCK_SUFFIX: &str = ".lock";
const CHECKPOINT_AUTHOR: &str = "Onyx Hive";
const CHECKPOINT_EMAIL: &str = "checkpoints@onyx-hive.local";
const SCRATCH_CONFIG: &[&str] = &["-c", "core.splitIndex=false", "-c", "core.safecrlf=false"];
const CAPTURE_LIMITS: Limits = Limits { timeout: Duration::from_secs(60), max_output: 1 << 20, label: "checkpoint" };

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TurnEdge {
    Start,
    End,
}

impl TurnEdge {
    fn as_str(self) -> &'static str {
        match self {
            TurnEdge::Start => "start",
            TurnEdge::End => "end",
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiffFile {
    pub path: String,
    pub added: u64,
    pub removed: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TurnDiff {
    pub turn: u32,
    pub text: String,
    pub is_truncated: bool,
    pub files: Vec<DiffFile>,
}

pub fn checkpoint_ref(chat_id: &str, turn: u32, edge: TurnEdge) -> String {
    format!("{CHECKPOINT_NAMESPACE}/{chat_id}/{turn}/{}", edge.as_str())
}

struct ScratchIndex(PathBuf);

impl ScratchIndex {
    fn beside_real_index(git: &Git) -> AppResult<Self> {
        let real = PathBuf::from(git.output(&["rev-parse", "--path-format=absolute", "--git-path", "index"])?.trim());
        let folder = real.parent().ok_or(AppError::NotFound("git directory"))?;
        let scratch = ScratchIndex(folder.join(format!("{SCRATCH_INDEX_PREFIX}{}", new_id())));
        if real.is_file() {
            std::fs::copy(&real, &scratch.0)?;
            let modified = std::fs::metadata(&real)?.modified()?;
            std::fs::File::options().write(true).open(&scratch.0)?.set_modified(modified)?;
        }
        Ok(scratch)
    }

    fn path_text(&self) -> String {
        self.0.to_string_lossy().into_owned()
    }
}

impl Drop for ScratchIndex {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
        let _ = std::fs::remove_file(format!("{}{LOCK_SUFFIX}", self.path_text()));
    }
}

fn with_scratch_config<'a>(arguments: &[&'a str]) -> Vec<&'a str> {
    SCRATCH_CONFIG.iter().chain(arguments).copied().collect()
}

fn snapshot_commit(git: &Git, tree: &str, reference: &str) -> AppResult<String> {
    let author = git
        .with_env("GIT_AUTHOR_NAME", CHECKPOINT_AUTHOR)
        .with_env("GIT_AUTHOR_EMAIL", CHECKPOINT_EMAIL)
        .with_env("GIT_COMMITTER_NAME", CHECKPOINT_AUTHOR)
        .with_env("GIT_COMMITTER_EMAIL", CHECKPOINT_EMAIL);
    let message = format!("onyx checkpoint {reference}");
    let mut arguments = vec!["commit-tree", tree, "-m", message.as_str()];
    if git::has_head(git)? {
        arguments.extend(["-p", "HEAD"]);
    }
    Ok(author.output(&arguments)?.trim().to_string())
}

pub fn capture(git: &Git, reference: &str) -> AppResult<String> {
    let index = ScratchIndex::beside_real_index(git)?;
    let scratch = git.with_env("GIT_INDEX_FILE", index.path_text());
    scratch.output_within(&with_scratch_config(&["add", "-A", "--", "."]), CAPTURE_LIMITS)?;
    let tree = scratch.output(&with_scratch_config(&["write-tree"]))?.trim().to_string();
    let commit = snapshot_commit(git, &tree, reference)?;
    git.output(&["update-ref", reference, &commit])?;
    Ok(commit)
}

fn recorded_turns(git: &Git, chat_id: &str) -> AppResult<Vec<(u32, String)>> {
    let prefix = format!("{CHECKPOINT_NAMESPACE}/{chat_id}/");
    let listing = git.output(&["for-each-ref", "--format=%(refname)", &prefix])?;
    Ok(listing
        .lines()
        .filter_map(|reference| {
            let (turn, edge) = reference.strip_prefix(&prefix)?.split_once('/')?;
            Some((turn.parse().ok()?, edge.to_string()))
        })
        .collect())
}

pub fn next_turn(git: &Git, chat_id: &str) -> AppResult<u32> {
    Ok(recorded_turns(git, chat_id)?.into_iter().map(|(turn, _)| turn).max().unwrap_or(0) + 1)
}

pub fn finished_turns(git: &Git, chat_id: &str) -> AppResult<Vec<u32>> {
    let end = TurnEdge::End.as_str();
    let mut turns: Vec<u32> =
        recorded_turns(git, chat_id)?.into_iter().filter(|(_, edge)| edge == end).map(|(turn, _)| turn).collect();
    turns.sort_unstable();
    Ok(turns)
}

fn existing_ref(git: &Git, reference: String) -> AppResult<String> {
    if !git.succeeds(&["rev-parse", "--verify", "--quiet", &reference])? {
        return Err(AppError::NotFound("checkpoint for this turn"));
    }
    Ok(reference)
}

pub fn turn_diff(git: &Git, chat_id: &str, turn: u32) -> AppResult<TurnDiff> {
    let start = existing_ref(git, checkpoint_ref(chat_id, turn, TurnEdge::Start))?;
    let end = existing_ref(git, checkpoint_ref(chat_id, turn, TurnEdge::End))?;
    let diff = git::diff_text(git, &[&start, &end])?;
    let mut files: Vec<DiffFile> = git::line_counts(git, &[&start, &end])?
        .into_iter()
        .map(|(path, (added, removed))| DiffFile { path, added, removed })
        .collect();
    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(TurnDiff { turn, text: diff.text, is_truncated: diff.is_truncated, files })
}

pub fn begin_turn(root: &Path, chat_id: &str) -> Option<u32> {
    let git = Git::at(root);
    if !git::is_repository(&git) {
        return None;
    }
    let turn = next_turn(&git, chat_id).ok()?;
    capture(&git, &checkpoint_ref(chat_id, turn, TurnEdge::Start)).ok()?;
    Some(turn)
}

pub fn end_turn(root: &Path, chat_id: &str, turn: u32) {
    let _ = capture(&Git::at(root), &checkpoint_ref(chat_id, turn, TurnEdge::End));
}

fn chat_git(db: &Db, chat_id: &str) -> AppResult<Git> {
    validated_id(chat_id, "chat")?;
    let connection = db.connection();
    let chat = chats::chat(&connection, chat_id)?;
    Ok(Git::at(chats::chat_root(&connection, &chat)?))
}

#[tauri::command]
pub async fn git_turn_diff(db: State<'_, Db>, chat_id: String, turn: u32) -> AppResult<TurnDiff> {
    let git = chat_git(&db, &chat_id)?;
    in_background(move || turn_diff(&git, &chat_id, turn)).await
}

#[tauri::command]
pub async fn git_checkpoint_turns(db: State<'_, Db>, chat_id: String) -> AppResult<Vec<u32>> {
    let git = chat_git(&db, &chat_id)?;
    in_background(move || finished_turns(&git, &chat_id)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::testing::{scratch_repo, write};

    const CHAT: &str = "6a1f0a3e-0000-4000-8000-000000000000";

    struct Untouched {
        index: Vec<u8>,
        head: String,
        branch: String,
        staged: String,
    }

    fn observe(root: &Path, git: &Git) -> Untouched {
        Untouched {
            index: std::fs::read(root.join(".git/index")).unwrap(),
            head: git.output(&["rev-parse", "HEAD"]).unwrap(),
            branch: git.output(&["symbolic-ref", "HEAD"]).unwrap(),
            staged: git.output(&["diff", "--cached", "--name-status"]).unwrap(),
        }
    }

    fn assert_untouched(before: &Untouched, root: &Path, git: &Git) {
        let after = observe(root, git);
        assert!(before.index == after.index, "the real index changed");
        assert_eq!(before.head, after.head);
        assert_eq!(before.branch, after.branch);
        assert_eq!(before.staged, after.staged);
    }

    fn leftover_scratch_indexes(root: &Path) -> usize {
        std::fs::read_dir(root.join(".git"))
            .unwrap()
            .flatten()
            .filter(|entry| entry.file_name().to_string_lossy().starts_with(SCRATCH_INDEX_PREFIX))
            .count()
    }

    #[test]
    fn snapshots_each_turn_without_touching_the_index_or_head() {
        let Some((root, git)) = scratch_repo("checkpoint") else { return };
        write(&root, "a.txt", "one\n");
        write(&root, "b.txt", "one\n");
        git.output(&["add", "."]).unwrap();
        git.output(&["commit", "-q", "-m", "start"]).unwrap();
        write(&root, "b.txt", "staged\n");
        git.output(&["add", "b.txt"]).unwrap();
        write(&root, "a.txt", "unstaged\n");
        write(&root, "c.txt", "untracked\n");
        let before = observe(&root, &git);

        assert_eq!(begin_turn(&root, CHAT), Some(1));
        assert_untouched(&before, &root, &git);
        let start = checkpoint_ref(CHAT, 1, TurnEdge::Start);
        assert!(git.succeeds(&["cat-file", "-e", &format!("{start}:c.txt")]).unwrap());

        write(&root, "a.txt", "agent edit\nmore\n");
        write(&root, "d.txt", "new from agent\n");
        end_turn(&root, CHAT, 1);
        assert_untouched(&before, &root, &git);
        assert_eq!(leftover_scratch_indexes(&root), 0);

        let diff = turn_diff(&git, CHAT, 1).unwrap();
        let paths: Vec<_> = diff.files.iter().map(|file| file.path.as_str()).collect();
        assert_eq!(paths, vec!["a.txt", "d.txt"]);
        assert_eq!((diff.files[0].added, diff.files[0].removed), (2, 1));
        assert!(diff.text.contains("+agent edit"));
        assert_eq!(finished_turns(&git, CHAT).unwrap(), vec![1]);
        assert_eq!(next_turn(&git, CHAT).unwrap(), 2);
        assert_eq!(git.output(&["status", "--porcelain"]).unwrap().lines().count(), 4);
    }

    #[test]
    fn snapshots_a_repository_without_commits() {
        let Some((root, git)) = scratch_repo("unborn") else { return };
        write(&root, "a.txt", "one\n");
        assert_eq!(begin_turn(&root, CHAT), Some(1));
        write(&root, "a.txt", "two\n");
        end_turn(&root, CHAT, 1);
        assert!(turn_diff(&git, CHAT, 1).unwrap().text.contains("+two"));
        assert!(!git::has_head(&git).unwrap());
    }

    #[test]
    fn skips_folders_outside_git_and_reports_missing_turns() {
        let folder = std::env::temp_dir().join(format!("onyx-hive-plain-{}", new_id()));
        std::fs::create_dir_all(&folder).unwrap();
        assert_eq!(begin_turn(&folder, CHAT), None);
        let Some((_, git)) = scratch_repo("missing") else { return };
        assert!(matches!(turn_diff(&git, CHAT, 7), Err(AppError::NotFound(_))));
    }
}
