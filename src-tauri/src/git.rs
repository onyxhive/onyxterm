use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::branches::ProjectBranches;
use crate::chats;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::subprocess::{self, Limits, Output, in_background};
use crate::workspaces::project;

pub const READ_LIMITS: Limits = Limits { timeout: Duration::from_secs(10), max_output: 8 << 20, label: "git" };
pub const DIFF_LIMITS: Limits = Limits { timeout: Duration::from_secs(15), max_output: 1 << 20, label: "git diff" };
const WRITE_LIMITS: Limits = Limits { timeout: Duration::from_secs(120), max_output: 1 << 20, label: "git" };
const FETCH_LIMITS: Limits = Limits { timeout: Duration::from_secs(20), max_output: 1 << 20, label: "git fetch" };
const MAX_ID_LENGTH: usize = 64;
const MAX_REF_LENGTH: usize = 255;
const MAX_PATH_LENGTH: usize = 4096;
const MAX_COMMIT_FILES: usize = 1000;
const MAX_MESSAGE_LENGTH: usize = 20_000;
const PREFERRED_REMOTE: &str = "origin";
const DEFAULT_BRANCH_CANDIDATES: [&str; 2] = ["main", "master"];
const MAX_SLUG_LENGTH: usize = 40;
pub const DEFAULT_CHAT_BRANCH_PREFIX: &str = "onyx/";
const FALLBACK_SLUG: &str = "chat";
const SUFFIX_LENGTH: usize = 6;
const BRANCH_FORMAT: &str = "%(refname)%09%(HEAD)%09%(committerdate:unix)%09%(upstream:short)";
const LOCAL_PREFIX: &str = "refs/heads/";
const REMOTE_PREFIX: &str = "refs/remotes/";
const CLEARED_ENV: &[&str] = &[
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
];
const DIRTY_TREE: &str = "the working tree has uncommitted changes; commit or stash them, or retry with force";

#[derive(Debug, Clone)]
pub struct Git {
    root: PathBuf,
    environment: Vec<(&'static str, String)>,
}

impl Git {
    pub fn at(root: impl Into<PathBuf>) -> Self {
        Git { root: root.into(), environment: Vec::new() }
    }

    #[cfg(test)]
    pub fn with_env(&self, name: &'static str, value: impl Into<String>) -> Self {
        let mut environment = self.environment.clone();
        environment.push((name, value.into()));
        Git { root: self.root.clone(), environment }
    }

    fn command(&self, arguments: &[&str]) -> Command {
        let mut command = Command::new("git");
        command.arg("-C").arg(&self.root).args(["-c", "core.quotepath=false"]).args(arguments);
        for name in CLEARED_ENV {
            command.env_remove(name);
        }
        command.env("GIT_TERMINAL_PROMPT", "0").env("GIT_OPTIONAL_LOCKS", "0").env("LC_ALL", "C");
        for (name, value) in &self.environment {
            command.env(name, value);
        }
        command
    }

    pub fn run(&self, arguments: &[&str], limits: Limits) -> AppResult<Output> {
        subprocess::run(&mut self.command(arguments), limits)
    }

    pub fn output_within(&self, arguments: &[&str], limits: Limits) -> AppResult<String> {
        let output = self.run(arguments, limits)?;
        if !output.is_success {
            return Err(failure(output));
        }
        Ok(output.stdout)
    }

    pub fn output(&self, arguments: &[&str]) -> AppResult<String> {
        self.output_within(arguments, READ_LIMITS)
    }

    pub fn succeeds(&self, arguments: &[&str]) -> AppResult<bool> {
        Ok(self.run(arguments, READ_LIMITS)?.is_success)
    }

    pub fn write(&self, arguments: &[&str]) -> AppResult<String> {
        self.output_within(arguments, WRITE_LIMITS)
    }
}

fn failure(output: Output) -> AppError {
    let stdout = output.stdout.trim();
    let reason = [output.stderr.as_str(), stdout].into_iter().find(|text| !text.is_empty()).unwrap_or("command failed");
    AppError::Git(reason.to_string())
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FileChange {
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    TypeChanged,
    Untracked,
    Conflicted,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub original_path: Option<String>,
    pub change: FileChange,
    pub is_staged: bool,
    pub is_unstaged: bool,
    pub added: u64,
    pub removed: u64,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: Option<String>,
    pub head: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u64,
    pub behind: u64,
    pub ahead_of_default: u64,
    pub has_remote: bool,
    pub files: Vec<ChangedFile>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub is_remote: bool,
    pub is_current: bool,
    pub upstream: Option<String>,
    pub last_commit_at: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Branches {
    pub current: Option<String>,
    pub branches: Vec<Branch>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Diff {
    pub text: String,
    pub is_truncated: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitResult {
    pub oid: String,
    pub summary: String,
}

pub type LineCounts = HashMap<String, (u64, u64)>;

fn change_of(code: char) -> FileChange {
    match code {
        'A' => FileChange::Added,
        'D' => FileChange::Deleted,
        'R' => FileChange::Renamed,
        'C' => FileChange::Copied,
        'T' => FileChange::TypeChanged,
        _ => FileChange::Modified,
    }
}

fn fields(rest: &str, count: usize) -> Option<(&str, &str)> {
    let parts: Vec<&str> = rest.splitn(count + 1, ' ').collect();
    (parts.len() == count + 1).then(|| (parts[0], parts[count]))
}

fn tracked_entry(rest: &str, count: usize, original_path: Option<&str>) -> Option<ChangedFile> {
    let (codes, path) = fields(rest, count)?;
    let mut codes = codes.chars();
    let (index, worktree) = (codes.next()?, codes.next()?);
    Some(ChangedFile {
        path: path.to_string(),
        original_path: original_path.map(String::from),
        change: change_of(if index == '.' { worktree } else { index }),
        is_staged: index != '.',
        is_unstaged: worktree != '.',
        added: 0,
        removed: 0,
    })
}

fn conflicted_entry(rest: &str) -> Option<ChangedFile> {
    let (_, path) = fields(rest, 9)?;
    Some(ChangedFile {
        path: path.to_string(),
        original_path: None,
        change: FileChange::Conflicted,
        is_staged: false,
        is_unstaged: true,
        added: 0,
        removed: 0,
    })
}

fn untracked_entry(path: &str) -> ChangedFile {
    ChangedFile {
        path: path.to_string(),
        original_path: None,
        change: FileChange::Untracked,
        is_staged: false,
        is_unstaged: true,
        added: 0,
        removed: 0,
    }
}

fn apply_header(status: &mut GitStatus, header: &str) {
    let Some((key, value)) = header.split_once(' ') else { return };
    match key {
        "branch.oid" => status.head = (value != "(initial)").then(|| value.to_string()),
        "branch.head" => status.branch = (value != "(detached)").then(|| value.to_string()),
        "branch.upstream" => status.upstream = Some(value.to_string()),
        "branch.ab" => {
            let mut counts = value.split(' ').map(|count| count.trim_start_matches(['+', '-']).parse().unwrap_or(0));
            status.ahead = counts.next().unwrap_or(0);
            status.behind = counts.next().unwrap_or(0);
        }
        _ => {}
    }
}

pub fn parse_status(porcelain: &str) -> GitStatus {
    let mut status = GitStatus::default();
    let mut records = porcelain.split('\0').filter(|record| !record.is_empty());
    while let Some(record) = records.next() {
        match record.split_once(' ') {
            Some(("#", header)) => apply_header(&mut status, header),
            Some(("1", rest)) => status.files.extend(tracked_entry(rest, 7, None)),
            Some(("2", rest)) => {
                let original_path = records.next();
                status.files.extend(tracked_entry(rest, 8, original_path));
            }
            Some(("u", rest)) => status.files.extend(conflicted_entry(rest)),
            Some(("?", path)) => status.files.push(untracked_entry(path)),
            _ => {}
        }
    }
    status
}

pub fn parse_numstat(numstat: &str, counts: &mut LineCounts) {
    for record in numstat.split('\0').filter(|record| !record.is_empty()) {
        let mut parts = record.trim_start_matches('\n').splitn(3, '\t');
        let (Some(added), Some(removed), Some(path)) = (parts.next(), parts.next(), parts.next()) else { continue };
        let entry = counts.entry(path.to_string()).or_default();
        entry.0 += added.parse::<u64>().unwrap_or(0);
        entry.1 += removed.parse::<u64>().unwrap_or(0);
    }
}

fn branch_of(line: &str) -> Option<Branch> {
    let mut parts = line.split('\t');
    let reference = parts.next()?;
    let is_current = parts.next()? == "*";
    let last_commit_at = parts.next()?.parse::<i64>().unwrap_or(0) * 1000;
    let upstream = parts.next().filter(|upstream| !upstream.is_empty()).map(String::from);
    let (name, is_remote) = match reference.strip_prefix(LOCAL_PREFIX) {
        Some(local) => (local, false),
        None => (reference.strip_prefix(REMOTE_PREFIX)?, true),
    };
    if is_remote && name.ends_with("/HEAD") {
        return None;
    }
    Some(Branch { name: name.to_string(), is_remote, is_current, upstream, last_commit_at })
}

pub fn parse_branches(listing: &str) -> Branches {
    let branches: Vec<Branch> = listing.lines().filter_map(branch_of).collect();
    let current = branches.iter().find(|branch| branch.is_current).map(|branch| branch.name.clone());
    Branches { current, branches }
}

pub fn validated_id(value: &str, what: &str) -> AppResult<()> {
    let is_plain = !value.is_empty()
        && value.len() <= MAX_ID_LENGTH
        && value.chars().all(|character| character.is_ascii_alphanumeric() || character == '-');
    if is_plain {
        return Ok(());
    }
    Err(AppError::Invalid(format!("{what} id must be up to {MAX_ID_LENGTH} letters, digits or dashes")))
}

fn is_option_safe(text: &str, max_length: usize) -> bool {
    !text.is_empty() && text.len() <= max_length && !text.starts_with('-') && !text.chars().any(char::is_control)
}

pub fn validated_branch(git: &Git, name: &str) -> AppResult<String> {
    let name = name.trim();
    let invalid = || AppError::Invalid(format!("{name:?} is not a valid branch name"));
    if !is_option_safe(name, MAX_REF_LENGTH) {
        return Err(invalid());
    }
    let output = git.run(&["check-ref-format", "--branch", name], READ_LIMITS)?;
    if !output.is_success {
        return Err(invalid());
    }
    Ok(output.stdout.trim().to_string())
}

pub fn validated_revision(git: &Git, revision: &str) -> AppResult<String> {
    let revision = revision.trim();
    let invalid = || AppError::Invalid(format!("{revision:?} is not a commit in this repository"));
    if !is_option_safe(revision, MAX_REF_LENGTH) {
        return Err(invalid());
    }
    if !git.succeeds(&["rev-parse", "--verify", "--quiet", &format!("{revision}^{{commit}}")])? {
        return Err(invalid());
    }
    Ok(revision.to_string())
}

pub fn validated_path(path: &str) -> AppResult<String> {
    let is_inside = !path.is_empty()
        && path.len() <= MAX_PATH_LENGTH
        && !path.starts_with('/')
        && !path.chars().any(char::is_control)
        && !path.split('/').any(|part| part == "..");
    if !is_inside {
        return Err(AppError::Invalid(format!("{path:?} is not a path inside the project")));
    }
    Ok(path.to_string())
}

fn validated_message(message: &str) -> AppResult<String> {
    let message = message.trim();
    if message.is_empty() || message.chars().count() > MAX_MESSAGE_LENGTH || message.contains('\0') {
        return Err(AppError::Invalid(format!("commit message must be 1 to {MAX_MESSAGE_LENGTH} characters")));
    }
    Ok(message.to_string())
}

fn literal_pathspec(path: &str) -> String {
    format!(":(literal){path}")
}

pub fn line_counts(git: &Git, base: &[&str]) -> AppResult<LineCounts> {
    let mut counts = LineCounts::new();
    let arguments: Vec<&str> =
        ["diff", "--numstat", "--no-renames", "-z"].into_iter().chain(base.iter().copied()).collect();
    parse_numstat(&git.output(&arguments)?, &mut counts);
    Ok(counts)
}

fn remote_default_base(git: &Git, remote: &str) -> AppResult<Option<String>> {
    let output =
        git.run(&["symbolic-ref", "--quiet", "--short", &format!("{REMOTE_PREFIX}{remote}/HEAD")], READ_LIMITS)?;
    if output.is_success && !output.stdout.trim().is_empty() {
        return Ok(Some(output.stdout.trim().to_string()));
    }
    for candidate in DEFAULT_BRANCH_CANDIDATES {
        let base = format!("{remote}/{candidate}");
        if ref_exists(git, &format!("{REMOTE_PREFIX}{base}"))? {
            return Ok(Some(base));
        }
    }
    Ok(None)
}

fn commits_ahead_of(git: &Git, base: &str) -> AppResult<u64> {
    let counted = git.output(&["rev-list", "--count", &format!("{base}..HEAD")])?;
    Ok(counted.trim().parse().unwrap_or_default())
}

fn apply_default_base_divergence(git: &Git, status: &mut GitStatus) -> AppResult<()> {
    let Ok(remote) = push_remote(git) else { return Ok(()) };
    status.has_remote = true;
    let Some(branch) = status.branch.clone() else { return Ok(()) };
    let Some(base) = remote_default_base(git, &remote)? else { return Ok(()) };
    let ahead = commits_ahead_of(git, &base)?;
    if base != format!("{remote}/{branch}") {
        status.ahead_of_default = ahead;
    }
    if status.upstream.is_none() {
        (status.ahead, status.behind) = (ahead, 0);
    }
    Ok(())
}

pub fn status(git: &Git) -> AppResult<GitStatus> {
    let mut status = parse_status(&git.output(&["status", "--porcelain=v2", "--branch", "-z"])?);
    apply_default_base_divergence(git, &mut status)?;
    let mut counts = line_counts(git, &[])?;
    for (path, (added, removed)) in line_counts(git, &["--cached"])? {
        let entry = counts.entry(path).or_default();
        entry.0 += added;
        entry.1 += removed;
    }
    for file in &mut status.files {
        if let Some((added, removed)) = counts.get(&file.path) {
            (file.added, file.removed) = (*added, *removed);
        }
    }
    Ok(status)
}

pub fn branches(git: &Git) -> AppResult<Branches> {
    let format = format!("--format={BRANCH_FORMAT}");
    let listing = git.output(&["for-each-ref", "--sort=-committerdate", &format, "refs/heads", "refs/remotes"])?;
    Ok(parse_branches(&listing))
}

pub fn is_repository(git: &Git) -> bool {
    git.succeeds(&["rev-parse", "--is-inside-work-tree"]).unwrap_or(false)
}

pub fn has_head(git: &Git) -> AppResult<bool> {
    git.succeeds(&["rev-parse", "--verify", "--quiet", "HEAD^{commit}"])
}

pub fn current_branch(git: &Git) -> AppResult<Option<String>> {
    let output = git.run(&["symbolic-ref", "--quiet", "--short", "HEAD"], READ_LIMITS)?;
    Ok(output.is_success.then(|| output.stdout.trim().to_string()).filter(|branch| !branch.is_empty()))
}

fn ref_exists(git: &Git, reference: &str) -> AppResult<bool> {
    git.succeeds(&["show-ref", "--verify", "--quiet", reference])
}

fn has_tracked_changes(git: &Git) -> AppResult<bool> {
    Ok(!git.output(&["status", "--porcelain", "-z", "--untracked-files=no"])?.is_empty())
}

fn ensure_clean(git: &Git) -> AppResult<()> {
    if has_tracked_changes(git)? {
        return Err(AppError::Invalid(DIRTY_TREE.into()));
    }
    Ok(())
}

pub fn checkout(git: &Git, branch: &str) -> AppResult<()> {
    if ref_exists(git, &format!("{LOCAL_PREFIX}{branch}"))? {
        git.write(&["switch", branch])?;
        return Ok(());
    }
    if ref_exists(git, &format!("{REMOTE_PREFIX}{branch}"))? {
        git.write(&["switch", "--track", branch])?;
        return Ok(());
    }
    git.write(&["switch", branch])?;
    Ok(())
}

pub fn create_branch(git: &Git, name: &str, from: Option<&str>) -> AppResult<()> {
    let mut arguments = vec!["switch", "-c", name];
    arguments.extend(from);
    git.write(&arguments)?;
    Ok(())
}

pub fn empty_tree(git: &Git) -> AppResult<String> {
    Ok(git.output(&["hash-object", "-t", "tree", "/dev/null"])?.trim().to_string())
}

pub fn diff_text(git: &Git, arguments: &[&str]) -> AppResult<Diff> {
    let full: Vec<&str> =
        ["diff", "--no-color", "--no-ext-diff"].into_iter().chain(arguments.iter().copied()).collect();
    let output = git.run(&full, DIFF_LIMITS)?;
    if !output.is_success {
        return Err(failure(output));
    }
    Ok(Diff { text: output.stdout, is_truncated: output.is_truncated })
}

pub fn head_base(git: &Git) -> AppResult<String> {
    if has_head(git)? { Ok("HEAD".to_string()) } else { empty_tree(git) }
}

pub fn diff_against(git: &Git, base: &str, file: Option<&str>) -> AppResult<Diff> {
    let pathspec = file.map(literal_pathspec);
    let mut arguments = vec![base];
    if let Some(pathspec) = &pathspec {
        arguments.extend(["--", pathspec.as_str()]);
    }
    diff_text(git, &arguments)
}

pub fn commit(git: &Git, message: &str, files: &[String]) -> AppResult<CommitResult> {
    let pathspecs: Vec<String> = files.iter().map(|file| literal_pathspec(file)).collect();
    let mut add = vec!["add", "-A"];
    let mut record = vec!["commit", "-m", message];
    if !pathspecs.is_empty() {
        add.push("--");
        add.extend(pathspecs.iter().map(String::as_str));
        record.push("--");
        record.extend(pathspecs.iter().map(String::as_str));
    }
    git.write(&add)?;
    git.write(&record)?;
    Ok(CommitResult {
        oid: git.output(&["rev-parse", "HEAD"])?.trim().to_string(),
        summary: git.output(&["log", "-1", "--format=%s"])?.trim().to_string(),
    })
}

fn push_remote(git: &Git) -> AppResult<String> {
    let listing = git.output(&["remote"])?;
    let remotes: Vec<&str> = listing.lines().map(str::trim).filter(|remote| !remote.is_empty()).collect();
    let chosen = remotes.iter().find(|remote| **remote == PREFERRED_REMOTE).or(remotes.first());
    chosen.map(|remote| remote.to_string()).ok_or_else(|| AppError::Git("this repository has no remote".into()))
}

fn has_upstream(git: &Git) -> AppResult<bool> {
    git.succeeds(&["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
}

pub fn push(git: &Git) -> AppResult<()> {
    let branch = current_branch(git)?.ok_or_else(|| AppError::Invalid("cannot push a detached HEAD".into()))?;
    if has_upstream(git)? {
        git.write(&["push"])?;
        return Ok(());
    }
    let remote = push_remote(git)?;
    git.write(&["push", "--set-upstream", &remote, &branch])?;
    Ok(())
}

fn slug(title: &str) -> String {
    let lowered: String = title
        .to_lowercase()
        .chars()
        .map(|character| if character.is_ascii_alphanumeric() { character } else { '-' })
        .collect();
    let joined = lowered.split('-').filter(|part| !part.is_empty()).collect::<Vec<_>>().join("-");
    let capped: String = joined.chars().take(MAX_SLUG_LENGTH).collect();
    let trimmed = capped.trim_end_matches('-');
    if trimmed.is_empty() { FALLBACK_SLUG.to_string() } else { trimmed.to_string() }
}

fn branch_prefix(prefix: &str) -> String {
    let trimmed = prefix.trim().trim_end_matches('/');
    if trimmed.is_empty() { String::new() } else { format!("{trimmed}/") }
}

pub fn unused_chat_branch(git: &Git, prefix: &str, title: &str) -> AppResult<String> {
    let base = format!("{}{}", branch_prefix(prefix), slug(title));
    if !ref_exists(git, &format!("{LOCAL_PREFIX}{base}"))? {
        return Ok(base);
    }
    let suffix: String = uuid::Uuid::new_v4().simple().to_string().chars().take(SUFFIX_LENGTH).collect();
    Ok(format!("{base}-{suffix}"))
}

fn tracked_remote_branch(git: &Git, branch: &str) -> AppResult<String> {
    let upstream = git.run(&["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], READ_LIMITS)?;
    let tracked = upstream.stdout.trim();
    if upstream.is_success && !tracked.is_empty() {
        return Ok(tracked.to_string());
    }
    Ok(format!("{PREFERRED_REMOTE}/{branch}"))
}

fn refresh_remote_branch(git: &Git, remote_branch: &str) {
    let Some((remote, name)) = remote_branch.split_once('/') else { return };
    if is_option_safe(remote, MAX_REF_LENGTH) && is_option_safe(name, MAX_REF_LENGTH) {
        let _ = git.run(&["fetch", "--quiet", "--no-tags", remote, name], FETCH_LIMITS);
    }
}

pub fn fresh_remote_base(git: &Git) -> AppResult<Option<String>> {
    let Some(branch) = current_branch(git)? else { return Ok(None) };
    let remote_branch = tracked_remote_branch(git, &branch)?;
    refresh_remote_branch(git, &remote_branch);
    if ref_exists(git, &format!("{REMOTE_PREFIX}{remote_branch}"))? {
        return Ok(Some(validated_revision(git, &format!("{REMOTE_PREFIX}{remote_branch}"))?));
    }
    Ok(None)
}

pub fn branch_at(root: &Path) -> Option<String> {
    current_branch(&Git::at(root)).ok().flatten()
}

pub fn project_root(db: &Db, project_id: &str) -> AppResult<PathBuf> {
    validated_id(project_id, "project")?;
    Ok(PathBuf::from(project(&db.connection(), project_id)?.path))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub enum GitTarget {
    Project(String),
    Chat(String),
}

pub struct Workdir {
    pub project_id: String,
    pub root: PathBuf,
}

impl Workdir {
    pub fn git(&self) -> Git {
        Git::at(&self.root)
    }
}

pub fn workdir(db: &Db, target: &GitTarget) -> AppResult<Workdir> {
    match target {
        GitTarget::Project(project_id) => {
            Ok(Workdir { project_id: project_id.clone(), root: project_root(db, project_id)? })
        }
        GitTarget::Chat(chat_id) => {
            validated_id(chat_id, "chat")?;
            let connection = db.connection();
            let chat = chats::chat(&connection, chat_id)?;
            Ok(Workdir { root: chats::chat_root(&connection, &chat)?, project_id: chat.project_id })
        }
    }
}

fn validated_files(files: Option<Vec<String>>) -> AppResult<Vec<String>> {
    let files = files.unwrap_or_default();
    if files.len() > MAX_COMMIT_FILES {
        return Err(AppError::Invalid(format!("commit at most {MAX_COMMIT_FILES} files at once")));
    }
    files.iter().map(|file| validated_path(file)).collect()
}

#[tauri::command]
pub async fn git_status(db: State<'_, Db>, target: GitTarget) -> AppResult<GitStatus> {
    let git = workdir(&db, &target)?.git();
    in_background(move || status(&git)).await
}

#[tauri::command]
pub async fn git_branches(db: State<'_, Db>, target: GitTarget) -> AppResult<Branches> {
    let git = workdir(&db, &target)?.git();
    in_background(move || branches(&git)).await
}

#[tauri::command]
pub async fn git_checkout(
    db: State<'_, Db>,
    project_branches: State<'_, ProjectBranches>,
    target: GitTarget,
    branch: String,
    force: Option<bool>,
) -> AppResult<GitStatus> {
    let workdir = workdir(&db, &target)?;
    let git = workdir.git();
    let switched = in_background(move || {
        let branch = validated_branch(&git, &branch)?;
        if !force.unwrap_or(false) {
            ensure_clean(&git)?;
        }
        checkout(&git, &branch)?;
        status(&git)
    })
    .await;
    project_branches.forget(&workdir.project_id);
    switched
}

#[tauri::command]
pub async fn git_create_branch(
    db: State<'_, Db>,
    project_branches: State<'_, ProjectBranches>,
    target: GitTarget,
    name: String,
    from: Option<String>,
    force: Option<bool>,
) -> AppResult<GitStatus> {
    let workdir = workdir(&db, &target)?;
    let git = workdir.git();
    let created = in_background(move || {
        let name = validated_branch(&git, &name)?;
        let from = from.map(|from| validated_revision(&git, &from)).transpose()?;
        if !force.unwrap_or(false) {
            ensure_clean(&git)?;
        }
        create_branch(&git, &name, from.as_deref())?;
        status(&git)
    })
    .await;
    project_branches.forget(&workdir.project_id);
    created
}

#[tauri::command]
pub async fn git_commit(
    db: State<'_, Db>,
    target: GitTarget,
    message: String,
    files: Option<Vec<String>>,
) -> AppResult<CommitResult> {
    let git = workdir(&db, &target)?.git();
    let message = validated_message(&message)?;
    let files = validated_files(files)?;
    in_background(move || commit(&git, &message, &files)).await
}

#[tauri::command]
pub async fn git_push(db: State<'_, Db>, target: GitTarget) -> AppResult<GitStatus> {
    let git = workdir(&db, &target)?.git();
    in_background(move || {
        push(&git)?;
        status(&git)
    })
    .await
}

#[cfg(test)]
pub mod testing {
    use super::*;

    pub fn scratch_repo(name: &str) -> Option<(PathBuf, Git)> {
        let root = std::env::temp_dir().join(format!("onyx-hive-git-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let git = identified(&Git::at(&root));
        git.output(&["init", "-q", "-b", "main"]).ok()?;
        Some((root, git))
    }

    pub fn identified(git: &Git) -> Git {
        git.with_env("GIT_AUTHOR_NAME", "onyx")
            .with_env("GIT_AUTHOR_EMAIL", "onyx@example.com")
            .with_env("GIT_COMMITTER_NAME", "onyx")
            .with_env("GIT_COMMITTER_EMAIL", "onyx@example.com")
    }

    pub fn write(root: &Path, path: &str, text: &str) {
        let target = root.join(path);
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::write(target, text).unwrap();
    }
}

#[cfg(test)]
mod tests {
    use super::testing::{scratch_repo, write};
    use super::*;

    #[test]
    fn parses_porcelain_v2_headers_and_every_entry_kind() {
        let porcelain = [
            "# branch.oid 1234",
            "# branch.head feature/x",
            "# branch.upstream origin/feature/x",
            "# branch.ab +2 -1",
            "1 .M N... 100644 100644 100644 aaa aaa src/a.rs",
            "1 A. N... 000000 100644 100644 000 bbb new file.rs",
            "2 R. N... 100644 100644 100644 ccc ccc R100 src/new.rs",
            "src/old.rs",
            "u UU N... 100644 100644 100644 100644 d1 d2 d3 conflict.rs",
            "? notes.txt",
            "",
        ]
        .join("\0");
        let status = parse_status(&porcelain);
        assert_eq!(status.branch.as_deref(), Some("feature/x"));
        assert_eq!(status.upstream.as_deref(), Some("origin/feature/x"));
        assert_eq!((status.ahead, status.behind), (2, 1));
        let summary: Vec<_> = status.files.iter().map(|file| (file.path.as_str(), file.change)).collect();
        assert_eq!(
            summary,
            vec![
                ("src/a.rs", FileChange::Modified),
                ("new file.rs", FileChange::Added),
                ("src/new.rs", FileChange::Renamed),
                ("conflict.rs", FileChange::Conflicted),
                ("notes.txt", FileChange::Untracked),
            ]
        );
        assert_eq!(status.files[2].original_path.as_deref(), Some("src/old.rs"));
        assert!(status.files[0].is_unstaged && !status.files[0].is_staged);
    }

    #[test]
    fn reads_detached_and_unborn_heads_as_missing() {
        let status = parse_status("# branch.oid (initial)\0# branch.head (detached)\0");
        assert_eq!((status.head, status.branch), (None, None));
    }

    #[test]
    fn sums_numstat_and_treats_binary_files_as_zero() {
        let mut counts = LineCounts::new();
        parse_numstat("3\t1\ta.rs\0-\t-\timage.png\0", &mut counts);
        parse_numstat("2\t0\ta.rs\0", &mut counts);
        assert_eq!(counts["a.rs"], (5, 1));
        assert_eq!(counts["image.png"], (0, 0));
    }

    #[test]
    fn lists_local_and_remote_branches_without_remote_head() {
        let listing = "refs/heads/main\t*\t100\torigin/main\nrefs/remotes/origin/HEAD\t \t100\t\n\
                       refs/remotes/origin/main\t \t90\t\nrefs/heads/topic\t \t80\t\n";
        let parsed = parse_branches(listing);
        assert_eq!(parsed.current.as_deref(), Some("main"));
        assert_eq!(parsed.branches.len(), 3);
        assert_eq!(parsed.branches[0].upstream.as_deref(), Some("origin/main"));
        assert_eq!(parsed.branches[0].last_commit_at, 100_000);
        assert!(parsed.branches[1].is_remote);
    }

    #[test]
    fn rejects_paths_that_escape_the_project() {
        assert!(validated_path("src/a.rs").is_ok());
        assert!(validated_path("../etc/passwd").is_err());
        assert!(validated_path("/etc/passwd").is_err());
        assert!(validated_path("a/\u{0}b").is_err());
    }

    #[test]
    fn slugs_titles_into_branch_friendly_names() {
        assert_eq!(slug("Fix the Nearby-stores sort!"), "fix-the-nearby-stores-sort");
        assert_eq!(slug("ü"), FALLBACK_SLUG);
        assert!(slug(&"word ".repeat(30)).len() <= MAX_SLUG_LENGTH);
    }

    #[test]
    fn reports_status_with_line_counts_in_a_real_repository() {
        let Some((root, git)) = scratch_repo("status") else { return };
        write(&root, "a.txt", "one\ntwo\n");
        git.output(&["add", "a.txt"]).unwrap();
        git.output(&["commit", "-q", "-m", "start"]).unwrap();
        write(&root, "a.txt", "one\nchanged\nthree\n");
        write(&root, "b.txt", "new\n");
        let status = status(&git).unwrap();
        assert_eq!(status.branch.as_deref(), Some("main"));
        let modified = status.files.iter().find(|file| file.path == "a.txt").unwrap();
        assert_eq!((modified.added, modified.removed), (2, 1));
        assert!(status.files.iter().any(|file| file.path == "b.txt" && file.change == FileChange::Untracked));
    }

    #[test]
    fn validates_branch_names_with_git_itself() {
        let Some((_, git)) = scratch_repo("names") else { return };
        assert_eq!(validated_branch(&git, " onyx/fix-sort ").unwrap(), "onyx/fix-sort");
        for bad in ["-x", "a..b", "a b", "bad~name", "", "x\u{1b}"] {
            assert!(validated_branch(&git, bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn refuses_to_switch_with_tracked_changes_and_creates_branches_when_clean() {
        let Some((root, git)) = scratch_repo("switch") else { return };
        write(&root, "a.txt", "one\n");
        git.output(&["add", "a.txt"]).unwrap();
        git.output(&["commit", "-q", "-m", "start"]).unwrap();
        write(&root, "untracked.txt", "x\n");
        assert!(ensure_clean(&git).is_ok());
        create_branch(&git, "topic", None).unwrap();
        assert_eq!(current_branch(&git).unwrap().as_deref(), Some("topic"));
        write(&root, "a.txt", "two\n");
        assert!(matches!(ensure_clean(&git), Err(AppError::Invalid(reason)) if reason == DIRTY_TREE));
        git.output(&["checkout", "--", "a.txt"]).unwrap();
        checkout(&git, "main").unwrap();
        assert_eq!(current_branch(&git).unwrap().as_deref(), Some("main"));
    }

    #[test]
    fn commits_only_the_named_files_and_diffs_against_head() {
        let Some((root, git)) = scratch_repo("commit") else { return };
        write(&root, "a.txt", "one\n");
        write(&root, "b.txt", "one\n");
        let first = commit(&git, "start", &[]).unwrap();
        assert_eq!(first.summary, "start");
        write(&root, "a.txt", "two\n");
        write(&root, "b.txt", "two\n");
        let diff = diff_against(&git, &head_base(&git).unwrap(), Some("a.txt")).unwrap();
        assert!(diff.text.contains("+two") && !diff.text.contains("b.txt"));
        commit(&git, "only a", &["a.txt".to_string()]).unwrap();
        let remaining = status(&git).unwrap();
        assert_eq!(remaining.files.len(), 1);
        assert_eq!(remaining.files[0].path, "b.txt");
    }

    #[test]
    fn names_an_unused_chat_branch_from_the_title() {
        let Some((_, git)) = scratch_repo("chat-branch") else { return };
        git.output(&["commit", "-q", "--allow-empty", "-m", "start"]).unwrap();
        let first = unused_chat_branch(&git, DEFAULT_CHAT_BRANCH_PREFIX, "Fix the sort").unwrap();
        assert_eq!(first, "onyx/fix-the-sort");
        git.output(&["branch", &first]).unwrap();
        let second = unused_chat_branch(&git, DEFAULT_CHAT_BRANCH_PREFIX, "Fix the sort").unwrap();
        assert!(second.starts_with("onyx/fix-the-sort-") && second != first);
    }

    #[test]
    fn prefixes_chat_branches_with_a_slash_or_nothing() {
        let Some((_, git)) = scratch_repo("chat-branch-prefix") else { return };
        git.output(&["commit", "-q", "--allow-empty", "-m", "start"]).unwrap();
        assert_eq!(unused_chat_branch(&git, "julius", "Add search").unwrap(), "julius/add-search");
        assert_eq!(unused_chat_branch(&git, "julius/", "Add search").unwrap(), "julius/add-search");
        assert_eq!(unused_chat_branch(&git, "", "Add search").unwrap(), "add-search");
    }

    #[test]
    fn pushes_with_upstream_on_first_push() {
        let Some((root, git)) = scratch_repo("push") else { return };
        let Some((remote_root, remote)) = scratch_repo("push-remote") else { return };
        remote.output(&["config", "receive.denyCurrentBranch", "ignore"]).unwrap();
        write(&root, "a.txt", "one\n");
        commit(&git, "start", &[]).unwrap();
        git.output(&["remote", "add", "origin", remote_root.to_str().unwrap()]).unwrap();
        push(&git).unwrap();
        let pushed = status(&git).unwrap();
        assert_eq!(pushed.upstream.as_deref(), Some("origin/main"));
        assert_eq!(pushed.ahead, 0);
        assert!(pushed.has_remote);
    }

    #[test]
    fn counts_commits_ahead_of_the_remote_default_branch_before_the_first_push() {
        let Some((root, git)) = scratch_repo("ahead") else { return };
        let Some((remote_root, remote)) = scratch_repo("ahead-remote") else { return };
        remote.output(&["config", "receive.denyCurrentBranch", "ignore"]).unwrap();
        write(&root, "a.txt", "one\n");
        commit(&git, "start", &[]).unwrap();
        git.output(&["remote", "add", "origin", remote_root.to_str().unwrap()]).unwrap();
        push(&git).unwrap();
        create_branch(&git, "topic", None).unwrap();
        write(&root, "a.txt", "two\n");
        commit(&git, "change", &[]).unwrap();
        let topic = status(&git).unwrap();
        assert_eq!((topic.upstream.as_deref(), topic.ahead, topic.ahead_of_default), (None, 1, 1));
        checkout(&git, "main").unwrap();
        let main = status(&git).unwrap();
        assert_eq!((main.ahead, main.ahead_of_default), (0, 0));
    }

    #[test]
    fn reports_no_remote_for_a_local_only_repository() {
        let Some((root, git)) = scratch_repo("no-remote") else { return };
        write(&root, "a.txt", "one\n");
        commit(&git, "start", &[]).unwrap();
        let local = status(&git).unwrap();
        assert!(!local.has_remote);
        assert_eq!(local.ahead_of_default, 0);
    }

    #[test]
    #[ignore = "reads a real repository named by ONYX_LIVE_REPO"]
    fn live_reads_status_and_branches_of_a_real_repository() {
        let Ok(root) = std::env::var("ONYX_LIVE_REPO") else { return };
        let git = Git::at(root);
        eprintln!("status: {}", serde_json::to_string_pretty(&status(&git).unwrap()).unwrap());
        let listed = branches(&git).unwrap();
        eprintln!("current: {:?}, branches: {}", listed.current, listed.branches.len());
        for branch in listed.branches.iter().take(5) {
            eprintln!("branch: {}", serde_json::to_string(branch).unwrap());
        }
    }
}
