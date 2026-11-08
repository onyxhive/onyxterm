use std::cmp::Ordering;
use std::collections::HashSet;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::time::{Duration, UNIX_EPOCH};

use serde::Serialize;
use tauri::State;

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::git::{GitTarget, workdir};
use crate::subprocess::{self, Limits, in_background};

const MAX_RELATIVE_PATH_LENGTH: usize = 4096;
const MAX_LISTED_ENTRIES: usize = 5000;
const MAX_READ_BYTES: usize = 1024 * 1024;
const BINARY_SNIFF_BYTES: usize = 8192;
const HIDDEN_ENTRIES: [&str; 1] = [".git"];
const IGNORE_CHECK_LIMITS: Limits =
    Limits { timeout: Duration::from_secs(5), max_output: 1024 * 1024, label: "git check-ignore" };

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<i64>,
    pub is_ignored: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub text: Option<String>,
    pub is_binary: bool,
    pub is_truncated: bool,
    pub size: u64,
}

fn validated_relative(relative: &str) -> AppResult<&Path> {
    if relative.len() > MAX_RELATIVE_PATH_LENGTH || relative.contains('\0') {
        return Err(AppError::Invalid("the path is too long or holds a null byte".into()));
    }
    let path = Path::new(relative);
    if path.components().all(|component| matches!(component, Component::Normal(_) | Component::CurDir)) {
        return Ok(path);
    }
    Err(AppError::Invalid("the path must stay inside the folder, without .. or a leading /".into()))
}

pub fn resolved_inside(root: &Path, relative: &str) -> AppResult<PathBuf> {
    let relative = validated_relative(relative)?;
    let root = root.canonicalize()?;
    let resolved = root.join(relative).canonicalize()?;
    if !resolved.starts_with(&root) {
        return Err(AppError::Invalid("the path leads outside the folder".into()));
    }
    Ok(resolved)
}

fn modified_millis(metadata: &std::fs::Metadata) -> Option<i64> {
    let elapsed = metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
    Some(elapsed.as_millis() as i64)
}

fn entry_of(entry: &std::fs::DirEntry) -> Option<DirEntry> {
    let name = entry.file_name().to_string_lossy().into_owned();
    if HIDDEN_ENTRIES.contains(&name.as_str()) {
        return None;
    }
    let metadata = std::fs::metadata(entry.path()).or_else(|_| entry.metadata()).ok()?;
    Some(DirEntry {
        name,
        is_dir: metadata.is_dir(),
        size: metadata.len(),
        modified: modified_millis(&metadata),
        is_ignored: false,
    })
}

fn dirs_first(left: &DirEntry, right: &DirEntry) -> Ordering {
    right.is_dir.cmp(&left.is_dir).then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
}

fn ignore_check_path(prefix: &Path, entry: &DirEntry) -> String {
    let path = prefix.join(&entry.name).to_string_lossy().into_owned();
    if entry.is_dir { format!("{path}/") } else { path }
}

fn ignored_names(root: &Path, folder: &Path, entries: &[DirEntry]) -> HashSet<String> {
    let prefix = folder.strip_prefix(root).unwrap_or(Path::new(""));
    let relative: Vec<String> = entries.iter().map(|entry| ignore_check_path(prefix, entry)).collect();
    if relative.is_empty() {
        return HashSet::new();
    }
    let mut command = Command::new("git");
    command.arg("-C").arg(root).args(["-c", "core.quotePath=false", "check-ignore", "--"]).args(&relative);
    let Ok(output) = subprocess::run(&mut command, IGNORE_CHECK_LIMITS) else { return HashSet::new() };
    output
        .stdout
        .lines()
        .filter_map(|path| Path::new(path).file_name())
        .map(|name| name.to_string_lossy().into_owned())
        .collect()
}

pub fn list(root: &Path, relative: &str) -> AppResult<Vec<DirEntry>> {
    let folder = resolved_inside(root, relative)?;
    if !folder.is_dir() {
        return Err(AppError::Invalid("the path is not a folder".into()));
    }
    let mut entries: Vec<DirEntry> =
        std::fs::read_dir(&folder)?.flatten().filter_map(|entry| entry_of(&entry)).take(MAX_LISTED_ENTRIES).collect();
    let ignored = ignored_names(&root.canonicalize()?, &folder, &entries);
    for entry in &mut entries {
        entry.is_ignored = ignored.contains(&entry.name);
    }
    entries.sort_by(dirs_first);
    Ok(entries)
}

fn is_binary(bytes: &[u8]) -> bool {
    bytes[..bytes.len().min(BINARY_SNIFF_BYTES)].contains(&0)
}

fn decoded(bytes: Vec<u8>, is_truncated: bool) -> Option<String> {
    match String::from_utf8(bytes) {
        Ok(text) => Some(text),
        Err(error) if is_truncated && error.utf8_error().error_len().is_none() => {
            let valid = error.utf8_error().valid_up_to();
            let mut bytes = error.into_bytes();
            bytes.truncate(valid);
            String::from_utf8(bytes).ok()
        }
        Err(_) => None,
    }
}

pub fn read(root: &Path, relative: &str) -> AppResult<FileContent> {
    let path = resolved_inside(root, relative)?;
    if !path.is_file() {
        return Err(AppError::Invalid("the path is not a file".into()));
    }
    let size = std::fs::metadata(&path)?.len();
    let mut bytes = Vec::new();
    std::fs::File::open(&path)?.take(MAX_READ_BYTES as u64).read_to_end(&mut bytes)?;
    let is_truncated = size > bytes.len() as u64;
    let text = if is_binary(&bytes) { None } else { decoded(bytes, is_truncated) };
    Ok(FileContent { is_binary: text.is_none(), text, is_truncated, size })
}

#[tauri::command]
pub async fn list_dir(db: State<'_, Db>, target: GitTarget, rel_path: String) -> AppResult<Vec<DirEntry>> {
    let root = workdir(&db, &target)?.root;
    in_background(move || list(&root, &rel_path)).await
}

#[tauri::command]
pub async fn read_file(db: State<'_, Db>, target: GitTarget, rel_path: String) -> AppResult<FileContent> {
    let root = workdir(&db, &target)?.root;
    in_background(move || read(&root, &rel_path)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_folder(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("onyx-hive-explorer-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn write(root: &Path, relative: &str, contents: &[u8]) {
        let path = root.join(relative);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, contents).unwrap();
    }

    #[test]
    fn rejects_traversal_and_absolute_paths() {
        let root = scratch_folder("traversal");
        write(&root, "inner/file.txt", b"ok");
        assert!(resolved_inside(&root, "../").is_err());
        assert!(resolved_inside(&root, "inner/../../etc").is_err());
        assert!(resolved_inside(&root, "/etc/passwd").is_err());
        assert!(resolved_inside(&root, "inner\0").is_err());
        assert!(resolved_inside(&root, "inner/file.txt").unwrap().ends_with("inner/file.txt"));
        assert_eq!(resolved_inside(&root, "").unwrap(), root.canonicalize().unwrap());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_symlinks_that_escape_the_root() {
        let root = scratch_folder("symlink");
        let outside = scratch_folder("outside");
        write(&outside, "secret.txt", b"secret");
        write(&root, "real.txt", b"real");
        std::os::unix::fs::symlink(&outside, root.join("escape")).unwrap();
        std::os::unix::fs::symlink(root.join("real.txt"), root.join("alias.txt")).unwrap();
        assert!(resolved_inside(&root, "escape/secret.txt").is_err());
        assert!(read(&root, "escape/secret.txt").is_err());
        assert!(list(&root, "escape").is_err());
        assert_eq!(read(&root, "alias.txt").unwrap().text.as_deref(), Some("real"));
        std::fs::remove_dir_all(root).unwrap();
        std::fs::remove_dir_all(outside).unwrap();
    }

    #[test]
    fn detects_binary_files_and_reads_text() {
        let root = scratch_folder("binary");
        write(&root, "image.png", &[0x89, b'P', b'N', b'G', 0, 0, 1]);
        write(&root, "latin1.txt", &[b'c', b'a', b'f', 0xE9]);
        write(&root, "notes.md", "héllo".as_bytes());
        let image = read(&root, "image.png").unwrap();
        assert!(image.is_binary && image.text.is_none());
        assert!(read(&root, "latin1.txt").unwrap().is_binary);
        let notes = read(&root, "notes.md").unwrap();
        assert_eq!((notes.text.as_deref(), notes.is_binary, notes.size), (Some("héllo"), false, 6));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn caps_large_files_without_splitting_a_character() {
        let root = scratch_folder("large");
        let mut contents = vec![b'a'; MAX_READ_BYTES - 1];
        contents.extend("é and more".as_bytes());
        write(&root, "big.txt", &contents);
        let big = read(&root, "big.txt").unwrap();
        assert!(big.is_truncated && !big.is_binary);
        assert_eq!(big.text.unwrap().len(), MAX_READ_BYTES - 1);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn lists_folders_first_and_hides_git() {
        let root = scratch_folder("list");
        write(&root, "b.txt", b"b");
        write(&root, "A.txt", b"a");
        write(&root, "src/main.rs", b"fn main() {}");
        write(&root, ".git/HEAD", b"ref");
        let names: Vec<_> = list(&root, "").unwrap().into_iter().map(|entry| (entry.name, entry.is_dir)).collect();
        assert_eq!(names, vec![("src".into(), true), ("A.txt".into(), false), ("b.txt".into(), false)]);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn marks_gitignored_entries() {
        let root = scratch_folder("ignored");
        let initialized = Command::new("git").arg("-C").arg(&root).args(["init", "-q"]).status();
        if !initialized.is_ok_and(|status| status.success()) {
            return;
        }
        write(&root, ".gitignore", b"dist/\n*.log\n");
        write(&root, "dist/bundle.js", b"x");
        write(&root, "src/debug.log", b"x");
        write(&root, "src/app.ts", b"x");
        let top = list(&root, "").unwrap();
        assert!(top.iter().any(|entry| entry.name == "dist" && entry.is_ignored));
        let nested = list(&root, "src").unwrap();
        let ignored: Vec<_> = nested.iter().map(|entry| (entry.name.as_str(), entry.is_ignored)).collect();
        assert_eq!(ignored, vec![("app.ts", false), ("debug.log", true)]);
        std::fs::remove_dir_all(root).unwrap();
    }
}
