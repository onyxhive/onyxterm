use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Component, Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::git::{self, Git};

pub const WORK_IN_WORKTREES_SETTING: &str = "workInWorktrees";
const WORKTREES_FOLDER: &str = "worktrees";
const MAX_FOLDER_NAME_LENGTH: usize = 40;
const HASHED_FOLDER_PREFIX_LENGTH: usize = 23;
const CURRENT_BRANCH: &str = "HEAD";
const MANAGED_DEPTH: usize = 2;
const DIRTY_WORKTREE: &str = "the worktree has uncommitted changes; commit or discard them before removing it";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorktreeRequest {
    pub title: String,
    pub branch_prefix: String,
    pub starts_from_remote: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Worktree {
    pub path: PathBuf,
    pub branch: String,
}

pub fn worktrees_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(WORKTREES_FOLDER)
}

fn folder_name(branch: &str) -> String {
    let flattened = branch.replace('/', "-");
    if flattened.chars().count() <= MAX_FOLDER_NAME_LENGTH {
        return flattened;
    }
    let mut hasher = DefaultHasher::new();
    branch.hash(&mut hasher);
    let prefix: String = flattened.chars().take(HASHED_FOLDER_PREFIX_LENGTH).collect();
    format!("{prefix}-{:016x}", hasher.finish())
}

fn repository_name(project_root: &Path) -> AppResult<String> {
    project_root
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or_else(|| AppError::Invalid("the project folder has no name".into()))
}

pub fn worktree_path(worktrees_root: &Path, project_root: &Path, branch: &str) -> AppResult<PathBuf> {
    Ok(worktrees_root.join(repository_name(project_root)?).join(folder_name(branch)))
}

pub fn is_managed(worktrees_root: &Path, candidate: &Path) -> bool {
    let Ok(relative) = candidate.strip_prefix(worktrees_root) else { return false };
    let components: Vec<Component<'_>> = relative.components().collect();
    components.len() == MANAGED_DEPTH && components.iter().all(|component| matches!(component, Component::Normal(_)))
}

fn add_worktree(project: &Git, path: &Path, branch: &str) -> AppResult<()> {
    let path_text = path.to_string_lossy();
    if let Err(error) = project.write(&["worktree", "add", "--", &path_text, branch]) {
        let _ = project.write(&["branch", "-D", branch]);
        return Err(error);
    }
    Ok(())
}

fn base_revision(project: &Git, starts_from_remote: bool) -> AppResult<String> {
    if starts_from_remote && let Some(remote_base) = git::fresh_remote_base(project)? {
        return Ok(remote_base);
    }
    git::validated_revision(project, CURRENT_BRANCH)
}

pub fn create(project_root: &Path, worktrees_root: &Path, request: &WorktreeRequest) -> AppResult<Worktree> {
    let project = Git::at(project_root);
    if !git::is_repository(&project) {
        return Err(AppError::Invalid("the project is not a git repository".into()));
    }
    let base = base_revision(&project, request.starts_from_remote)?;
    let chat_branch = git::unused_chat_branch(&project, &request.branch_prefix, &request.title)?;
    let branch = git::validated_branch(&project, &chat_branch)?;
    let path = worktree_path(worktrees_root, project_root, &branch)?;
    if path.exists() {
        return Err(AppError::Invalid(format!("{} already exists", path.display())));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    project.write(&["branch", "--no-track", &branch, &base])?;
    add_worktree(&project, &path, &branch)?;
    Ok(Worktree { path, branch })
}

fn has_uncommitted_work(worktree: &Git) -> AppResult<bool> {
    Ok(!worktree.output(&["status", "--porcelain", "-z", "--untracked-files=all"])?.is_empty())
}

pub fn remove(project_root: &Path, worktrees_root: &Path, path: &Path) -> AppResult<()> {
    if !is_managed(worktrees_root, path) {
        return Err(AppError::Invalid(format!("{} is not a worktree this app created", path.display())));
    }
    let project = Git::at(project_root);
    if !path.is_dir() {
        project.write(&["worktree", "prune"])?;
        return Ok(());
    }
    if has_uncommitted_work(&Git::at(path))? {
        return Err(AppError::Invalid(DIRTY_WORKTREE.into()));
    }
    project.write(&["worktree", "remove", "--", &path.to_string_lossy()])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::testing::{identified, scratch_repo, write};

    fn request(title: &str) -> WorktreeRequest {
        WorktreeRequest {
            title: title.into(),
            branch_prefix: git::DEFAULT_CHAT_BRANCH_PREFIX.into(),
            starts_from_remote: false,
        }
    }

    fn scratch_worktrees_root() -> PathBuf {
        std::env::temp_dir().join(format!("onyx-hive-worktrees-{}", uuid::Uuid::new_v4()))
    }

    fn committed_repo(name: &str) -> Option<(PathBuf, Git)> {
        let (root, git) = scratch_repo(name)?;
        write(&root, "a.txt", "one\n");
        git.output(&["add", "a.txt"]).unwrap();
        git.output(&["commit", "-q", "-m", "start"]).unwrap();
        Some((root, git))
    }

    struct Checkout {
        index: Vec<u8>,
        head: String,
        branch: String,
        porcelain: String,
    }

    fn observe(root: &Path, git: &Git) -> Checkout {
        Checkout {
            index: std::fs::read(root.join(".git/index")).unwrap(),
            head: git.output(&["rev-parse", "HEAD"]).unwrap(),
            branch: git.output(&["symbolic-ref", "HEAD"]).unwrap(),
            porcelain: git.output(&["status", "--porcelain"]).unwrap(),
        }
    }

    fn assert_unchanged(before: &Checkout, root: &Path, git: &Git) {
        let after = observe(root, git);
        assert!(before.index == after.index, "the project index changed");
        assert_eq!(before.head, after.head);
        assert_eq!(before.branch, after.branch);
        assert_eq!(before.porcelain, after.porcelain);
    }

    #[test]
    fn names_worktree_folders_like_their_branch_and_hashes_long_ones() {
        assert_eq!(folder_name("onyx/fix-the-sort"), "onyx-fix-the-sort");
        let long = folder_name("onyx/a-really-long-title-that-keeps-going-forever");
        assert_eq!(long.len(), HASHED_FOLDER_PREFIX_LENGTH + 1 + 16);
        assert!(long.starts_with("onyx-a-really-long-titl-"));
        let root = Path::new("/data/worktrees");
        let path = worktree_path(root, Path::new("/code/harbor-api"), "onyx/fix").unwrap();
        assert_eq!(path, Path::new("/data/worktrees/harbor-api/onyx-fix"));
    }

    #[test]
    fn manages_only_repository_and_branch_folders_under_the_root() {
        let root = Path::new("/data/worktrees");
        assert!(is_managed(root, Path::new("/data/worktrees/harbor/onyx-fix")));
        assert!(!is_managed(root, Path::new("/data/worktrees/harbor")));
        assert!(!is_managed(root, Path::new("/data/worktrees/harbor/onyx-fix/src")));
        assert!(!is_managed(root, Path::new("/data/worktrees/../code/harbor")));
        assert!(!is_managed(root, Path::new("/code/harbor-api")));
    }

    #[test]
    fn creates_a_worktree_on_a_new_branch_without_touching_the_project_checkout() {
        let Some((root, git)) = committed_repo("worktree-create") else { return };
        write(&root, "a.txt", "dirty in the user's checkout\n");
        let before = observe(&root, &git);
        let worktrees = scratch_worktrees_root();
        let created = create(&root, &worktrees, &request("Fix the sort")).unwrap();
        assert_eq!(created.branch, "onyx/fix-the-sort");
        assert!(created.path.starts_with(&worktrees) && created.path.join("a.txt").is_file());
        assert_eq!(git::current_branch(&Git::at(&created.path)).unwrap().as_deref(), Some("onyx/fix-the-sort"));
        assert_eq!(std::fs::read_to_string(created.path.join("a.txt")).unwrap(), "one\n");
        assert_unchanged(&before, &root, &git);
        let upstream = Git::at(&created.path).run(&["rev-parse", "@{upstream}"], git::READ_LIMITS).unwrap();
        assert!(!upstream.is_success);
    }

    #[test]
    fn runs_chat_git_operations_inside_the_worktree_only() {
        let Some((root, git)) = committed_repo("worktree-ops") else { return };
        let before = observe(&root, &git);
        let worktrees = scratch_worktrees_root();
        let created = create(&root, &worktrees, &request("Add limits")).unwrap();
        let tree = identified(&Git::at(&created.path));
        write(&created.path, "limits.txt", "60\n");
        assert_eq!(git::status(&tree).unwrap().files.len(), 1);
        git::commit(&tree, "add limits", &[]).unwrap();
        assert!(git::status(&tree).unwrap().files.is_empty());
        assert_unchanged(&before, &root, &git);
        assert!(!root.join("limits.txt").exists());
        let on_branch = git.output(&["log", "-1", "--format=%s", "onyx/add-limits"]).unwrap();
        assert_eq!(on_branch.trim(), "add limits");
    }

    #[test]
    fn removes_a_clean_worktree_and_keeps_its_branch() {
        let Some((root, git)) = committed_repo("worktree-remove") else { return };
        let before = observe(&root, &git);
        let worktrees = scratch_worktrees_root();
        let created = create(&root, &worktrees, &request("Tidy")).unwrap();
        remove(&root, &worktrees, &created.path).unwrap();
        assert!(!created.path.exists());
        assert!(git.succeeds(&["show-ref", "--verify", "--quiet", "refs/heads/onyx/tidy"]).unwrap());
        assert!(!git.output(&["worktree", "list"]).unwrap().contains(&*created.path.to_string_lossy()));
        assert_unchanged(&before, &root, &git);
        remove(&root, &worktrees, &created.path).unwrap();
    }

    #[test]
    fn refuses_to_remove_a_worktree_with_uncommitted_or_untracked_work() {
        let Some((root, _)) = committed_repo("worktree-dirty") else { return };
        let worktrees = scratch_worktrees_root();
        let created = create(&root, &worktrees, &request("Keep my work")).unwrap();
        write(&created.path, "notes.txt", "unsaved idea\n");
        let refused = remove(&root, &worktrees, &created.path);
        assert!(matches!(refused, Err(AppError::Invalid(reason)) if reason == DIRTY_WORKTREE));
        assert_eq!(std::fs::read_to_string(created.path.join("notes.txt")).unwrap(), "unsaved idea\n");
        std::fs::remove_file(created.path.join("notes.txt")).unwrap();
        write(&created.path, "a.txt", "edited\n");
        assert!(remove(&root, &worktrees, &created.path).is_err());
        assert!(created.path.join("a.txt").is_file());
    }

    #[test]
    fn starts_from_the_fetched_remote_branch_when_asked() {
        let Some((remote_root, remote)) = committed_repo("worktree-remote-origin") else { return };
        let Some((root, git)) = scratch_repo("worktree-remote-project") else { return };
        let branch = remote.output(&["symbolic-ref", "--short", "HEAD"]).unwrap().trim().to_string();
        git.output(&["remote", "add", "origin", &remote_root.to_string_lossy()]).unwrap();
        git.output(&["fetch", "-q", "origin"]).unwrap();
        git.output(&["checkout", "-q", "-b", &branch, "--track", &format!("origin/{branch}")]).unwrap();
        write(&remote_root, "b.txt", "from the remote\n");
        remote.output(&["add", "b.txt"]).unwrap();
        remote.output(&["commit", "-q", "-m", "remote only"]).unwrap();
        let worktrees = scratch_worktrees_root();
        let local = create(&root, &worktrees, &request("Local base")).unwrap();
        assert!(!local.path.join("b.txt").exists());
        let from_remote = WorktreeRequest { starts_from_remote: true, ..request("Remote base") };
        let created = create(&root, &worktrees, &from_remote).unwrap();
        assert!(created.path.join("b.txt").is_file());
        assert!(!root.join("b.txt").exists());
    }

    #[test]
    fn refuses_to_remove_folders_it_did_not_create() {
        let Some((root, _)) = committed_repo("worktree-foreign") else { return };
        let worktrees = scratch_worktrees_root();
        assert!(remove(&root, &worktrees, &root).is_err());
        assert!(root.join("a.txt").is_file());
    }
}
