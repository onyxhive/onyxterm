use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

use tauri::State;

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::workspaces::project;

const GIT_TIMEOUT: Duration = Duration::from_secs(2);
const CACHE_LIFETIME: Duration = Duration::from_secs(10);
const EXIT_POLL_INTERVAL: Duration = Duration::from_millis(20);
const MAX_ID_LENGTH: usize = 64;
const MAX_BRANCH_LENGTH: usize = 255;

type CachedBranch = (Instant, Option<String>);

#[derive(Default)]
pub struct ProjectBranches(Mutex<HashMap<String, CachedBranch>>);

impl ProjectBranches {
    fn cache(&self) -> MutexGuard<'_, HashMap<String, CachedBranch>> {
        self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn fresh(&self, project_id: &str) -> Option<Option<String>> {
        let cache = self.cache();
        let (read_at, branch) = cache.get(project_id)?;
        (read_at.elapsed() < CACHE_LIFETIME).then(|| branch.clone())
    }

    fn remember(&self, project_id: String, branch: Option<String>) {
        self.cache().insert(project_id, (Instant::now(), branch));
    }

    pub fn forget(&self, project_id: &str) {
        self.cache().remove(project_id);
    }
}

fn is_project_id(project_id: &str) -> bool {
    !project_id.is_empty()
        && project_id.len() <= MAX_ID_LENGTH
        && project_id.chars().all(|character| character.is_ascii_alphanumeric() || character == '-')
}

fn is_branch_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= MAX_BRANCH_LENGTH && !name.chars().any(char::is_control)
}

fn wait_with_timeout(child: &mut std::process::Child) -> Option<std::process::ExitStatus> {
    let deadline = Instant::now() + GIT_TIMEOUT;
    while Instant::now() < deadline {
        if let Ok(Some(status)) = child.try_wait() {
            return Some(status);
        }
        thread::sleep(EXIT_POLL_INTERVAL);
    }
    let _ = child.kill();
    let _ = child.wait();
    None
}

fn current_branch(root: &Path) -> Option<String> {
    let mut child = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let status = wait_with_timeout(&mut child)?;
    if !status.success() {
        return None;
    }
    let mut output = String::new();
    child.stdout.take()?.read_to_string(&mut output).ok()?;
    let branch = output.trim();
    is_branch_name(branch).then(|| branch.to_string())
}

#[tauri::command]
pub async fn project_branch(
    db: State<'_, Db>,
    branches: State<'_, ProjectBranches>,
    project_id: String,
) -> AppResult<Option<String>> {
    if !is_project_id(&project_id) {
        return Err(AppError::Invalid("project id must be up to 64 letters, digits or dashes".into()));
    }
    let root = project(&db.connection(), &project_id)?.path;
    if let Some(branch) = branches.fresh(&project_id) {
        return Ok(branch);
    }
    let branch = tauri::async_runtime::spawn_blocking(move || current_branch(Path::new(&root)))
        .await
        .map_err(|error| AppError::Agent(error.to_string()))?;
    branches.remember(project_id, branch.clone());
    Ok(branch)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch_folder(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("onyx-hive-branch-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn git(root: &Path, arguments: &[&str]) -> bool {
        Command::new("git")
            .arg("-C")
            .arg(root)
            .args(["-c", "user.name=onyx", "-c", "user.email=onyx@example.com"])
            .args(arguments)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|status| status.success())
    }

    #[test]
    fn reads_the_checked_out_branch_of_a_repository() {
        let root = scratch_folder("repo");
        if !git(&root, &["init", "-q", "-b", "feature/sort"]) {
            return;
        }
        assert!(git(&root, &["commit", "-q", "--allow-empty", "-m", "start"]));
        assert_eq!(current_branch(&root).as_deref(), Some("feature/sort"));
    }

    #[test]
    fn has_no_branch_outside_a_repository() {
        assert_eq!(current_branch(&scratch_folder("plain")), None);
    }

    #[test]
    fn keeps_a_branch_until_it_is_forgotten() {
        let branches = ProjectBranches::default();
        assert_eq!(branches.fresh("p1"), None);
        branches.remember("p1".into(), Some("main".into()));
        assert_eq!(branches.fresh("p1"), Some(Some("main".into())));
        branches.forget("p1");
        assert_eq!(branches.fresh("p1"), None);
    }

    #[test]
    fn accepts_only_plain_project_ids() {
        assert!(is_project_id("6a1f0a3e-0000-4000-8000-000000000000"));
        assert!(!is_project_id("../etc"));
        assert!(!is_project_id(""));
        assert!(!is_project_id(&"a".repeat(MAX_ID_LENGTH + 1)));
    }

    #[test]
    fn rejects_branch_output_with_control_characters() {
        assert!(is_branch_name("feature/sort"));
        assert!(!is_branch_name("main\u{1b}[31m"));
        assert!(!is_branch_name(""));
    }
}
