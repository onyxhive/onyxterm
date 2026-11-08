use std::collections::{BTreeSet, HashMap};
use std::path::Path;
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::State;

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::workspaces::project;

const MAX_ENTRIES: usize = 50_000;
const CACHE_LIFETIME: Duration = Duration::from_secs(30);
const SKIPPED_FOLDERS: [&str; 3] = [".git", "node_modules", "target"];
const FOLDER_SUFFIX: char = '/';

#[derive(Default)]
pub struct ProjectFiles(Mutex<HashMap<String, (Instant, Vec<String>)>>);

impl ProjectFiles {
    fn fresh(&self, project_id: &str) -> Option<Vec<String>> {
        let cache = self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let (listed_at, entries) = cache.get(project_id)?;
        (listed_at.elapsed() < CACHE_LIFETIME).then(|| entries.clone())
    }

    fn remember(&self, project_id: String, entries: Vec<String>) {
        let mut cache = self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        cache.insert(project_id, (Instant::now(), entries));
    }
}

fn git_files(root: &Path) -> Option<Vec<String>> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let listed = String::from_utf8_lossy(&output.stdout);
    Some(listed.split('\0').filter(|file| !file.is_empty()).take(MAX_ENTRIES).map(str::to_string).collect())
}

fn is_skipped(name: &str) -> bool {
    SKIPPED_FOLDERS.contains(&name)
}

fn walked_files(root: &Path) -> Vec<String> {
    let mut files = Vec::new();
    let mut pending = vec![root.to_path_buf()];
    while let Some(folder) = pending.pop() {
        for entry in std::fs::read_dir(&folder).into_iter().flatten().flatten() {
            if files.len() >= MAX_ENTRIES {
                return files;
            }
            let Ok(kind) = entry.file_type() else { continue };
            let path = entry.path();
            if kind.is_dir() && !is_skipped(&entry.file_name().to_string_lossy()) {
                pending.push(path);
            } else if kind.is_file() {
                let relative = path.strip_prefix(root).unwrap_or(&path);
                files.push(relative.to_string_lossy().into_owned());
            }
        }
    }
    files
}

fn with_folders(files: Vec<String>) -> Vec<String> {
    let mut folders = BTreeSet::new();
    for file in &files {
        let mut end = 0;
        while let Some(offset) = file[end..].find(FOLDER_SUFFIX) {
            end += offset + 1;
            folders.insert(file[..end].to_string());
        }
    }
    folders.into_iter().chain(files).take(MAX_ENTRIES).collect()
}

pub fn list(root: &Path) -> Vec<String> {
    with_folders(git_files(root).unwrap_or_else(|| walked_files(root)))
}

#[tauri::command]
pub async fn list_project_files(
    db: State<'_, Db>,
    cache: State<'_, ProjectFiles>,
    project_id: String,
) -> AppResult<Vec<String>> {
    let root = project(&db.connection(), &project_id)?.path;
    if let Some(entries) = cache.fresh(&project_id) {
        return Ok(entries);
    }
    let entries = tauri::async_runtime::spawn_blocking(move || list(Path::new(&root)))
        .await
        .map_err(|error| AppError::Agent(error.to_string()))?;
    cache.remember(project_id, entries.clone());
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch_folder(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("onyx-hive-files-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn touch(root: &Path, relative: &str) {
        let path = root.join(relative);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, "").unwrap();
    }

    #[test]
    fn folders_of_every_file_come_first_with_a_trailing_slash() {
        let listed = with_folders(vec!["src/app/main.ts".into(), "README.md".into()]);
        assert_eq!(listed, vec!["src/", "src/app/", "src/app/main.ts", "README.md"]);
    }

    #[test]
    fn walking_a_plain_folder_skips_dependency_and_build_folders() {
        let root = scratch_folder("walk");
        touch(&root, "src/lib.rs");
        touch(&root, "node_modules/left-pad/index.js");
        touch(&root, "target/debug/app");
        touch(&root, ".git/HEAD");
        let mut listed = list(&root);
        listed.sort();
        assert_eq!(listed, vec!["src/", "src/lib.rs"]);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn git_projects_list_tracked_and_untracked_files_but_not_ignored_ones() {
        let root = scratch_folder("git");
        let initialized = Command::new("git").arg("-C").arg(&root).args(["init", "-q"]).status();
        if !initialized.is_ok_and(|status| status.success()) {
            return;
        }
        touch(&root, ".gitignore");
        std::fs::write(root.join(".gitignore"), "dist/\n").unwrap();
        touch(&root, "docs/guide.md");
        touch(&root, "dist/bundle.js");
        let mut listed = list(&root);
        listed.sort();
        assert_eq!(listed, vec![".gitignore", "docs/", "docs/guide.md"]);
        std::fs::remove_dir_all(root).unwrap();
    }
}
