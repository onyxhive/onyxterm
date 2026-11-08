use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::git::{self, Git, project_root};
use crate::process::login_shell;
use crate::subprocess::{self, Limits, Output, in_background};

pub const PRS_UPDATED: &str = "prs-updated";
const LIST_LIFETIME: Duration = Duration::from_secs(30);
const GH_LIMITS: Limits = Limits { timeout: Duration::from_secs(30), max_output: 8 << 20, label: "gh" };
const PUSH_LIMITS: Limits = Limits { timeout: Duration::from_secs(120), max_output: 1 << 20, label: "gh" };
const SHELL_LIMITS: Limits = Limits { timeout: Duration::from_secs(15), max_output: 64 << 10, label: "login shell" };
const COMMON_GH_PATHS: &[&str] = &["/opt/homebrew/bin/gh", "/usr/local/bin/gh"];
const LIST_FIELDS: &str =
    "number,title,state,headRefName,baseRefName,author,isDraft,reviewDecision,statusCheckRollup,url,updatedAt";
const DETAIL_FIELDS: &str = "body,files,comments,reviews,mergeable";
const CHECK_FIELDS: &str = "name,state,bucket,link,workflow,description,startedAt,completedAt";
const LIST_LIMIT: &str = "100";
const NO_CHECKS: &str = "no checks reported";
const PULL_PATH: &str = "/pull/";
const MAX_TITLE_LENGTH: usize = 256;
const MAX_BODY_LENGTH: usize = 65_536;
const GH_ENV: &[(&str, &str)] =
    &[("GH_PROMPT_DISABLED", "1"), ("GH_NO_UPDATE_NOTIFIER", "1"), ("GH_SPINNER_DISABLED", "1"), ("NO_COLOR", "1")];

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum PrState {
    Open,
    Closed,
    Merged,
    All,
}

impl PrState {
    fn as_str(self) -> &'static str {
        match self {
            PrState::Open => "open",
            PrState::Closed => "closed",
            PrState::Merged => "merged",
            PrState::All => "all",
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MergeMethod {
    Merge,
    Squash,
    Rebase,
}

impl MergeMethod {
    fn flag(self) -> &'static str {
        match self {
            MergeMethod::Merge => "--merge",
            MergeMethod::Squash => "--squash",
            MergeMethod::Rebase => "--rebase",
        }
    }
}

fn null_as_default<'de, D: Deserializer<'de>, T: Default + Deserialize<'de>>(deserializer: D) -> Result<T, D::Error> {
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

fn non_empty<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<String>, D::Error> {
    Ok(Option::<String>::deserialize(deserializer)?.filter(|text| !text.is_empty()))
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Author {
    #[serde(default)]
    pub login: String,
}

#[derive(Debug, Default, Deserialize)]
struct RollupItem {
    status: Option<String>,
    conclusion: Option<String>,
    state: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CheckOutcome {
    Passed,
    Failed,
    Pending,
}

impl RollupItem {
    fn outcome(&self) -> CheckOutcome {
        if let Some(state) = &self.state {
            return match state.as_str() {
                "SUCCESS" => CheckOutcome::Passed,
                "FAILURE" | "ERROR" => CheckOutcome::Failed,
                _ => CheckOutcome::Pending,
            };
        }
        if self.status.as_deref() != Some("COMPLETED") {
            return CheckOutcome::Pending;
        }
        match self.conclusion.as_deref() {
            Some("SUCCESS" | "NEUTRAL" | "SKIPPED") => CheckOutcome::Passed,
            _ => CheckOutcome::Failed,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChecksSummary {
    pub total: u32,
    pub passed: u32,
    pub failed: u32,
    pub pending: u32,
}

impl ChecksSummary {
    fn count(mut self, outcome: CheckOutcome) -> Self {
        self.total += 1;
        match outcome {
            CheckOutcome::Passed => self.passed += 1,
            CheckOutcome::Failed => self.failed += 1,
            CheckOutcome::Pending => self.pending += 1,
        }
        self
    }
}

fn summarized_checks<'de, D: Deserializer<'de>>(deserializer: D) -> Result<ChecksSummary, D::Error> {
    let items: Vec<RollupItem> = null_as_default(deserializer)?;
    Ok(items.iter().map(RollupItem::outcome).fold(ChecksSummary::default(), ChecksSummary::count))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    pub number: u64,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub head_ref_name: String,
    #[serde(default)]
    pub base_ref_name: String,
    #[serde(default, deserialize_with = "null_as_default")]
    pub author: Author,
    #[serde(default)]
    pub is_draft: bool,
    #[serde(default, deserialize_with = "non_empty")]
    pub review_decision: Option<String>,
    #[serde(default, rename(deserialize = "statusCheckRollup"), deserialize_with = "summarized_checks")]
    pub checks: ChecksSummary,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PrFile {
    pub path: String,
    #[serde(default)]
    pub additions: u64,
    #[serde(default)]
    pub deletions: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PrComment {
    #[serde(default, deserialize_with = "null_as_default")]
    pub author: Author,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PrReview {
    #[serde(default, deserialize_with = "null_as_default")]
    pub author: Author,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub body: String,
    #[serde(default, deserialize_with = "null_as_default")]
    pub submitted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestDetail {
    #[serde(flatten)]
    pub pull_request: PullRequest,
    #[serde(default, deserialize_with = "null_as_default")]
    pub body: String,
    #[serde(default, deserialize_with = "null_as_default")]
    pub files: Vec<PrFile>,
    #[serde(default, deserialize_with = "null_as_default")]
    pub comments: Vec<PrComment>,
    #[serde(default, deserialize_with = "null_as_default")]
    pub reviews: Vec<PrReview>,
    #[serde(default, deserialize_with = "null_as_default")]
    pub mergeable: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct PrCheck {
    pub name: String,
    pub state: String,
    pub bucket: String,
    pub link: String,
    pub workflow: String,
    pub description: String,
    pub started_at: String,
    pub completed_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatPullRequest {
    pub number: u64,
    pub state: String,
    pub is_draft: bool,
    pub url: String,
    pub checks: ChecksSummary,
}

impl From<&PullRequest> for ChatPullRequest {
    fn from(pull_request: &PullRequest) -> Self {
        ChatPullRequest {
            number: pull_request.number,
            state: pull_request.state.clone(),
            is_draft: pull_request.is_draft,
            url: pull_request.url.clone(),
            checks: pull_request.checks,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PullRequestDraft {
    pub title: String,
    #[serde(default)]
    pub body: String,
    pub base: Option<String>,
    #[serde(default)]
    pub draft: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PrsUpdated<'a> {
    project_id: &'a str,
}

struct Gh {
    executable: PathBuf,
    root: PathBuf,
}

impl Gh {
    fn command(&self, arguments: &[&str]) -> Command {
        let mut command = Command::new(&self.executable);
        command.args(arguments).current_dir(&self.root).envs(GH_ENV.iter().copied());
        if let Some(folder) = self.executable.parent() {
            let inherited = std::env::var("PATH").unwrap_or_default();
            command.env("PATH", format!("{}:{inherited}", folder.display()));
        }
        command
    }

    fn run(&self, arguments: &[&str], limits: Limits) -> AppResult<Output> {
        subprocess::run(&mut self.command(arguments), limits)
    }

    fn is_logged_in(&self) -> bool {
        self.run(&["auth", "status"], GH_LIMITS).is_ok_and(|output| output.is_success)
    }

    fn failure(&self, output: Output) -> AppError {
        if !self.is_logged_in() {
            return AppError::GhNotLoggedIn;
        }
        let reason = if output.stderr.is_empty() { output.stdout.trim().to_string() } else { output.stderr };
        AppError::GitHub(reason)
    }

    fn checked(&self, arguments: &[&str], limits: Limits) -> AppResult<String> {
        let output = self.run(arguments, limits)?;
        if !output.is_success {
            return Err(self.failure(output));
        }
        Ok(output.stdout)
    }

    fn json<T: DeserializeOwned>(&self, arguments: &[&str]) -> AppResult<T> {
        parsed(&self.checked(arguments, GH_LIMITS)?)
    }

    fn list(&self, state: PrState) -> AppResult<Vec<PullRequest>> {
        self.json(&["pr", "list", "--state", state.as_str(), "--limit", LIST_LIMIT, "--json", LIST_FIELDS])
    }

    fn for_branch(&self, branch: &str) -> AppResult<Option<PullRequest>> {
        let head = format!("--head={branch}");
        let found: Vec<PullRequest> =
            self.json(&["pr", "list", &head, "--state", "all", "--limit", "1", "--json", LIST_FIELDS])?;
        Ok(found.into_iter().next())
    }

    fn view(&self, number: u64) -> AppResult<PullRequestDetail> {
        let fields = format!("{LIST_FIELDS},{DETAIL_FIELDS}");
        self.json(&["pr", "view", &number.to_string(), "--json", &fields])
    }

    fn checks(&self, number: u64) -> AppResult<Vec<PrCheck>> {
        let output = self.run(&["pr", "checks", &number.to_string(), "--json", CHECK_FIELDS], GH_LIMITS)?;
        if let Ok(checks) = parsed(&output.stdout) {
            return Ok(checks);
        }
        if output.stderr.contains(NO_CHECKS) {
            return Ok(Vec::new());
        }
        Err(self.failure(output))
    }

    fn create(&self, branch: &str, draft: &PullRequestDraft) -> AppResult<u64> {
        let flags = [format!("--title={}", draft.title), format!("--body={}", draft.body), format!("--head={branch}")];
        let mut arguments: Vec<&str> = vec!["pr", "create"];
        arguments.extend(flags.iter().map(String::as_str));
        let base = draft.base.as_ref().map(|base| format!("--base={base}"));
        arguments.extend(base.as_deref());
        if draft.draft {
            arguments.push("--draft");
        }
        number_from_url(&self.checked(&arguments, PUSH_LIMITS)?)
    }

    fn merge(&self, number: u64, method: MergeMethod) -> AppResult<()> {
        self.checked(&["pr", "merge", &number.to_string(), method.flag()], PUSH_LIMITS)?;
        Ok(())
    }
}

fn parsed<T: DeserializeOwned>(text: &str) -> AppResult<T> {
    serde_json::from_str(text).map_err(|error| AppError::GitHub(format!("unexpected gh output: {error}")))
}

fn number_from_url(output: &str) -> AppResult<u64> {
    output
        .lines()
        .rev()
        .find_map(|line| line.trim().rsplit_once(PULL_PATH)?.1.parse().ok())
        .ok_or_else(|| AppError::GitHub(format!("gh did not print a pull request url: {}", output.trim())))
}

fn gh_from_login_shell() -> Option<PathBuf> {
    let mut shell = Command::new(login_shell());
    shell.args(["-l", "-i", "-c", "command -v gh"]);
    let output = subprocess::run(&mut shell, SHELL_LIMITS).ok()?;
    let found = output.stdout.lines().map(str::trim).rfind(|line| line.starts_with('/')).map(PathBuf::from);
    found.filter(|path| path.is_file())
}

fn locate_gh() -> Option<PathBuf> {
    COMMON_GH_PATHS.iter().map(PathBuf::from).find(|path| path.is_file()).or_else(gh_from_login_shell)
}

type ListKey = (String, PrState);
type CachedList = (Instant, Vec<PullRequest>);

#[derive(Default)]
pub struct GitHub {
    executable: Mutex<Option<PathBuf>>,
    lists: Mutex<HashMap<ListKey, CachedList>>,
    refreshing: Mutex<HashSet<String>>,
}

fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl GitHub {
    fn gh(&self, root: &Path) -> AppResult<Gh> {
        let mut executable = locked(&self.executable);
        if executable.is_none() {
            *executable = locate_gh();
        }
        let executable = executable.clone().ok_or(AppError::GhNotInstalled)?;
        Ok(Gh { executable, root: root.to_path_buf() })
    }

    fn fresh_list(&self, project_id: &str, state: PrState) -> Option<Vec<PullRequest>> {
        let lists = locked(&self.lists);
        let (read_at, pull_requests) = lists.get(&(project_id.to_string(), state))?;
        (read_at.elapsed() < LIST_LIFETIME).then(|| pull_requests.clone())
    }

    fn remember_list(&self, project_id: &str, state: PrState, pull_requests: Vec<PullRequest>) {
        locked(&self.lists).insert((project_id.to_string(), state), (Instant::now(), pull_requests));
    }

    fn forget_project(&self, project_id: &str) {
        locked(&self.lists).retain(|(cached_project, _), _| cached_project != project_id);
    }

    pub fn chat_pull_request(&self, project_id: &str, branch: &str) -> Option<ChatPullRequest> {
        let pull_requests = self.fresh_list(project_id, PrState::All)?;
        pull_requests.iter().find(|pull_request| pull_request.head_ref_name == branch).map(ChatPullRequest::from)
    }

    pub fn refresh_stale(&self, app: &AppHandle, project_ids: HashSet<String>) {
        for project_id in project_ids {
            let is_fresh = self.fresh_list(&project_id, PrState::All).is_some();
            if is_fresh || !locked(&self.refreshing).insert(project_id.clone()) {
                continue;
            }
            let app = app.clone();
            thread::spawn(move || refresh_project(&app, &project_id));
        }
    }
}

fn refresh_project(app: &AppHandle, project_id: &str) {
    let github = app.state::<GitHub>();
    let listed = project_root(&app.state::<Db>(), project_id)
        .and_then(|root| github.gh(&root))
        .and_then(|gh| gh.list(PrState::All));
    let is_listed = listed.is_ok();
    github.remember_list(project_id, PrState::All, listed.unwrap_or_default());
    locked(&github.refreshing).remove(project_id);
    if is_listed {
        let _ = app.emit(PRS_UPDATED, PrsUpdated { project_id });
    }
}

fn validated_number(number: u64) -> AppResult<u64> {
    if number == 0 {
        return Err(AppError::Invalid("pull request number must be positive".into()));
    }
    Ok(number)
}

fn validated_draft(git: &Git, draft: PullRequestDraft) -> AppResult<PullRequestDraft> {
    let title = draft.title.trim().to_string();
    if title.is_empty() || title.chars().count() > MAX_TITLE_LENGTH || title.chars().any(char::is_control) {
        return Err(AppError::Invalid(format!("title must be 1 to {MAX_TITLE_LENGTH} characters on one line")));
    }
    if draft.body.len() > MAX_BODY_LENGTH || draft.body.contains('\0') {
        return Err(AppError::Invalid(format!("body must be under {MAX_BODY_LENGTH} bytes")));
    }
    let base = draft.base.map(|base| git::validated_branch(git, &base)).transpose()?;
    Ok(PullRequestDraft { title, base, ..draft })
}

fn push_if_needed(git: &Git) -> AppResult<String> {
    let status = git::status(git)?;
    let branch =
        status.branch.ok_or_else(|| AppError::Invalid("cannot open a pull request from a detached HEAD".into()))?;
    if status.upstream.is_none() || status.ahead > 0 {
        git::push(git)?;
    }
    Ok(branch)
}

#[tauri::command]
pub async fn pr_list(
    db: State<'_, Db>,
    github: State<'_, GitHub>,
    project_id: String,
    state: Option<PrState>,
) -> AppResult<Vec<PullRequest>> {
    let state = state.unwrap_or(PrState::Open);
    let root = project_root(&db, &project_id)?;
    if let Some(cached) = github.fresh_list(&project_id, state) {
        return Ok(cached);
    }
    let gh = github.gh(&root)?;
    let listed = in_background(move || gh.list(state)).await?;
    github.remember_list(&project_id, state, listed.clone());
    Ok(listed)
}

#[tauri::command]
pub async fn pr_view(
    db: State<'_, Db>,
    github: State<'_, GitHub>,
    project_id: String,
    number: u64,
) -> AppResult<PullRequestDetail> {
    let number = validated_number(number)?;
    let gh = github.gh(&project_root(&db, &project_id)?)?;
    in_background(move || gh.view(number)).await
}

#[tauri::command]
pub async fn pr_for_branch(
    db: State<'_, Db>,
    github: State<'_, GitHub>,
    project_id: String,
    branch: String,
) -> AppResult<Option<PullRequest>> {
    let root = project_root(&db, &project_id)?;
    let gh = github.gh(&root)?;
    in_background(move || {
        let branch = git::validated_branch(&Git::at(&root), &branch)?;
        gh.for_branch(&branch)
    })
    .await
}

#[tauri::command]
pub async fn pr_checks(
    db: State<'_, Db>,
    github: State<'_, GitHub>,
    project_id: String,
    number: u64,
) -> AppResult<Vec<PrCheck>> {
    let number = validated_number(number)?;
    let gh = github.gh(&project_root(&db, &project_id)?)?;
    in_background(move || gh.checks(number)).await
}

#[tauri::command]
pub async fn pr_create(
    db: State<'_, Db>,
    github: State<'_, GitHub>,
    project_id: String,
    draft: PullRequestDraft,
) -> AppResult<PullRequestDetail> {
    let root = project_root(&db, &project_id)?;
    let gh = github.gh(&root)?;
    let created = in_background(move || {
        let git = Git::at(&root);
        let draft = validated_draft(&git, draft)?;
        let branch = push_if_needed(&git)?;
        gh.view(gh.create(&branch, &draft)?)
    })
    .await;
    github.forget_project(&project_id);
    created
}

#[tauri::command]
pub async fn pr_merge(
    db: State<'_, Db>,
    github: State<'_, GitHub>,
    project_id: String,
    number: u64,
    method: MergeMethod,
) -> AppResult<()> {
    let number = validated_number(number)?;
    let gh = github.gh(&project_root(&db, &project_id)?)?;
    let merged = in_background(move || gh.merge(number, method)).await;
    github.forget_project(&project_id);
    merged
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIST: &str = include_str!("fixtures/gh_pr_list.json");
    const VIEW: &str = include_str!("fixtures/gh_pr_view.json");
    const CHECKS: &str = include_str!("fixtures/gh_pr_checks.json");

    #[test]
    fn reads_a_pr_list_and_summarises_its_checks() {
        let listed: Vec<PullRequest> = parsed(LIST).unwrap();
        assert_eq!(listed.len(), 2);
        let first = &listed[0];
        assert_eq!((first.number, first.head_ref_name.as_str()), (42, "onyx/fix-the-sort"));
        assert_eq!(first.author.login, "mhmd-zbib");
        assert_eq!(first.review_decision.as_deref(), Some("REVIEW_REQUIRED"));
        assert_eq!(first.checks, ChecksSummary { total: 4, passed: 2, failed: 1, pending: 1 });
    }

    #[test]
    fn tolerates_null_authors_empty_decisions_and_unknown_fields() {
        let listed: Vec<PullRequest> = parsed(LIST).unwrap();
        let second = &listed[1];
        assert_eq!(second.author, Author::default());
        assert_eq!(second.review_decision, None);
        assert_eq!(second.checks, ChecksSummary::default());
        assert!(second.is_draft);
    }

    #[test]
    fn reads_a_pr_with_body_files_comments_and_reviews() {
        let detail: PullRequestDetail = parsed(VIEW).unwrap();
        assert_eq!(detail.pull_request.number, 42);
        assert_eq!(detail.pull_request.checks.total, 0);
        assert_eq!(detail.files[0], PrFile { path: "src/order.ts".into(), additions: 12, deletions: 3 });
        assert_eq!(detail.comments[0].author.login, "reviewer");
        assert_eq!(detail.reviews[0].state, "APPROVED");
        assert_eq!(detail.mergeable, "MERGEABLE");
        let wire = serde_json::to_value(&detail).unwrap();
        assert_eq!(wire["headRefName"], "onyx/fix-the-sort");
        assert_eq!(wire["checks"]["total"], 0);
        assert!(wire.get("statusCheckRollup").is_none());
    }

    #[test]
    fn reads_check_runs() {
        let checks: Vec<PrCheck> = parsed(CHECKS).unwrap();
        assert_eq!(checks.len(), 2);
        assert_eq!((checks[1].name.as_str(), checks[1].bucket.as_str()), ("build", "pending"));
    }

    #[test]
    fn finds_the_number_in_the_created_pr_url() {
        let output = "Warning: 1 uncommitted change\nhttps://github.com/acme/geo/pull/43\n";
        assert_eq!(number_from_url(output).unwrap(), 43);
        assert!(number_from_url("something went wrong").is_err());
    }

    #[test]
    fn caches_lists_per_project_and_finds_a_branch_pr() {
        let github = GitHub::default();
        assert!(github.chat_pull_request("p1", "onyx/fix-the-sort").is_none());
        github.remember_list("p1", PrState::All, parsed(LIST).unwrap());
        let found = github.chat_pull_request("p1", "onyx/fix-the-sort").unwrap();
        assert_eq!((found.number, found.checks.failed), (42, 1));
        assert!(github.fresh_list("p1", PrState::Open).is_none());
        github.forget_project("p1");
        assert!(github.chat_pull_request("p1", "onyx/fix-the-sort").is_none());
    }

    #[test]
    fn rejects_bad_states_methods_and_drafts_at_the_boundary() {
        assert!(serde_json::from_str::<PrState>("\"draft\"").is_err());
        assert!(serde_json::from_str::<MergeMethod>("\"force\"").is_err());
        let extra = r#"{"title":"t","body":"","base":null,"draft":false,"reviewers":["x"]}"#;
        assert!(serde_json::from_str::<PullRequestDraft>(extra).is_err());
        assert!(validated_number(0).is_err());
    }

    #[test]
    #[ignore = "calls gh against a real repository named by ONYX_LIVE_REPO"]
    fn live_lists_pull_requests_of_a_real_repository() {
        let Ok(root) = std::env::var("ONYX_LIVE_REPO") else { return };
        let gh = GitHub::default().gh(Path::new(&root)).unwrap();
        for state in [PrState::Open, PrState::All] {
            match gh.list(state) {
                Ok(listed) => {
                    eprintln!("{} prs: {}", state.as_str(), listed.len());
                    for pull_request in listed.iter().take(3) {
                        eprintln!("pr: {}", serde_json::to_string(pull_request).unwrap());
                    }
                }
                Err(error) => eprintln!("{} prs failed: {error}", state.as_str()),
            }
        }
    }
}
