#![deny(warnings)]
#![forbid(unsafe_code)]

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

const GIT_PROGRAM: &str = "git";
const BRANCH_HEADER: &str = "## ";
const UPSTREAM_SEPARATOR: &str = "...";
const NO_COMMITS_PREFIX: &str = "No commits yet on ";
const DETACHED_HEAD: &str = "HEAD (no branch)";
const DETACHED_LABEL: &str = "HEAD";
const AHEAD_MARK: char = '\u{2191}';
const BEHIND_MARK: char = '\u{2193}';
const CHANGED_MARK: char = '~';
const UNTRUSTED_REPO_FLAGS: [&str; 3] = ["--no-optional-locks", "-c", "core.fsmonitor=false"];
const UNMERGED_PAIRS: [&str; 7] = ["DD", "AU", "UD", "UA", "DU", "AA", "UU"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GitMark {
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    Untracked,
    Conflicted,
    ChangedInside,
}

impl GitMark {
    pub fn letter(self) -> &'static str {
        match self {
            GitMark::Modified => "M",
            GitMark::Added => "A",
            GitMark::Deleted => "D",
            GitMark::Renamed => "R",
            GitMark::Copied => "C",
            GitMark::Untracked => "U",
            GitMark::Conflicted => "!",
            GitMark::ChangedInside => "\u{2022}",
        }
    }

    pub fn is_addition(self) -> bool {
        matches!(self, GitMark::Added | GitMark::Untracked)
    }

    fn from_code(code: char) -> Option<Self> {
        match code {
            'M' | 'T' => Some(GitMark::Modified),
            'A' => Some(GitMark::Added),
            'D' => Some(GitMark::Deleted),
            'R' => Some(GitMark::Renamed),
            'C' => Some(GitMark::Copied),
            _ => None,
        }
    }

    fn from_pair(pair: &str) -> Option<Self> {
        if pair == "??" {
            return Some(GitMark::Untracked);
        }
        if UNMERGED_PAIRS.contains(&pair) {
            return Some(GitMark::Conflicted);
        }
        let mut codes = pair.chars();
        let (index, worktree) = (codes.next()?, codes.next()?);
        if index == 'A' {
            return Some(GitMark::Added);
        }
        GitMark::from_code(worktree).or_else(|| GitMark::from_code(index))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Porcelain {
    pub branch: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub marks: Vec<(String, GitMark)>,
}

pub fn parse_porcelain(output: &str) -> Porcelain {
    let mut porcelain = Porcelain::default();
    let mut records = output.split('\0').filter(|record| !record.is_empty());
    while let Some(record) = records.next() {
        if let Some(header) = record.strip_prefix(BRANCH_HEADER) {
            porcelain.branch = branch_name(header);
            (porcelain.ahead, porcelain.behind) = upstream_counts(header);
            continue;
        }
        let (Some(pair), Some(path)) = (record.get(..2), record.get(3..)) else {
            continue;
        };
        if pair.starts_with('R') || pair.starts_with('C') {
            records.next();
        }
        if let Some(mark) = GitMark::from_pair(pair) {
            porcelain.marks.push((path.to_string(), mark));
        }
    }
    porcelain
}

fn branch_name(header: &str) -> Option<String> {
    if header == DETACHED_HEAD {
        return Some(DETACHED_LABEL.to_string());
    }
    let local = header.strip_prefix(NO_COMMITS_PREFIX).unwrap_or(header);
    let name = local.split(UPSTREAM_SEPARATOR).next()?.split(' ').next()?;
    (!name.is_empty()).then(|| name.to_string())
}

fn upstream_counts(header: &str) -> (u32, u32) {
    let Some(counts) = header.rsplit_once('[').and_then(|(_, rest)| rest.strip_suffix(']')) else {
        return (0, 0);
    };
    counts.split(", ").fold((0, 0), |(ahead, behind), part| match part.split_once(' ') {
        Some(("ahead", count)) => (count.parse().unwrap_or(0), behind),
        Some(("behind", count)) => (ahead, count.parse().unwrap_or(0)),
        _ => (ahead, behind),
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitSummary {
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub changed: usize,
}

impl GitSummary {
    pub fn from_porcelain(porcelain: &Porcelain) -> Option<Self> {
        Some(Self {
            branch: porcelain.branch.clone()?,
            ahead: porcelain.ahead,
            behind: porcelain.behind,
            changed: porcelain.marks.len(),
        })
    }

    pub fn sync_label(&self) -> String {
        let mut label = self.branch.clone();
        if self.ahead > 0 {
            label.push_str(&format!(" {AHEAD_MARK}{}", self.ahead));
        }
        if self.behind > 0 {
            label.push_str(&format!(" {BEHIND_MARK}{}", self.behind));
        }
        label
    }

    pub fn full_label(&self) -> String {
        let mut label = self.sync_label();
        if self.changed > 0 {
            label.push_str(&format!(" {CHANGED_MARK}{}", self.changed));
        }
        label
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct GitStatus {
    pub branch: Option<String>,
    marks: HashMap<PathBuf, GitMark>,
    changed_dirs: HashSet<PathBuf>,
}

impl GitStatus {
    pub fn from_porcelain(repo_root: &Path, porcelain: Porcelain) -> Self {
        let marks: HashMap<PathBuf, GitMark> =
            porcelain.marks.into_iter().map(|(path, mark)| (repo_root.join(path), mark)).collect();
        let changed_dirs = marks
            .keys()
            .flat_map(|path| path.ancestors().skip(1).take_while(|dir| dir.starts_with(repo_root)))
            .map(Path::to_path_buf)
            .collect();
        Self { branch: porcelain.branch, marks, changed_dirs }
    }

    pub fn file_mark(&self, path: &Path) -> Option<GitMark> {
        self.marks.get(path).copied()
    }

    pub fn dir_mark(&self, path: &Path, is_expanded: bool) -> Option<GitMark> {
        let has_changes = !is_expanded && self.changed_dirs.contains(path);
        has_changes.then_some(GitMark::ChangedInside)
    }
}

pub fn read_git_status(dir: &Path) -> Option<GitStatus> {
    let root = git_output(dir, &["rev-parse", "--show-toplevel"])?;
    let root = PathBuf::from(root.trim_end());
    let status = git_output(&root, &["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all"])?;
    Some(GitStatus::from_porcelain(&root_as_spelled(dir, &root), parse_porcelain(&status)))
}

fn root_as_spelled(dir: &Path, canonical_root: &Path) -> PathBuf {
    let depth = dir
        .canonicalize()
        .ok()
        .and_then(|canonical| canonical.strip_prefix(canonical_root).ok().map(|inner| inner.components().count()));
    match depth.and_then(|depth| dir.ancestors().nth(depth)) {
        Some(root) => root.to_path_buf(),
        None => canonical_root.to_path_buf(),
    }
}

pub fn read_git_summary(dir: &Path) -> Option<GitSummary> {
    let args = ["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all"];
    let status = untrusted_repo_output(dir, &args)?;
    GitSummary::from_porcelain(&parse_porcelain(&status))
}

fn git_output(dir: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new(GIT_PROGRAM).arg("-C").arg(dir).args(args).output();
    String::from_utf8(successful_stdout(output)?).ok()
}

pub(crate) fn untrusted_repo_output(dir: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new(GIT_PROGRAM).args(UNTRUSTED_REPO_FLAGS).arg("-C").arg(dir).args(args).output();
    Some(String::from_utf8_lossy(&successful_stdout(output)?).into_owned())
}

fn successful_stdout(output: std::io::Result<Output>) -> Option<Vec<u8>> {
    match output {
        Ok(output) if output.status.success() => Some(output.stdout),
        Ok(_) => None,
        Err(err) => {
            tracing::debug!(%err, "git unavailable");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn porcelain_reads_branch_and_file_marks() {
        let output = "## main...origin/main [ahead 1]\0 M crates/ui/src/shell.rs\0?? notes.md\0A  new.rs\0D  gone.rs\0";
        let parsed = parse_porcelain(output);
        assert_eq!(parsed.branch.as_deref(), Some("main"));
        assert_eq!(parsed.marks, vec![
            ("crates/ui/src/shell.rs".to_string(), GitMark::Modified),
            ("notes.md".to_string(), GitMark::Untracked),
            ("new.rs".to_string(), GitMark::Added),
            ("gone.rs".to_string(), GitMark::Deleted),
        ]);
    }

    #[test]
    fn porcelain_skips_the_original_path_of_renames() {
        let parsed = parse_porcelain("## feature\0R  to.rs\0from.rs\0 M other.rs\0");
        assert_eq!(parsed.branch.as_deref(), Some("feature"));
        assert_eq!(parsed.marks, vec![
            ("to.rs".to_string(), GitMark::Renamed),
            ("other.rs".to_string(), GitMark::Modified),
        ]);
    }

    #[test]
    fn porcelain_marks_conflicts_and_prefers_worktree_changes() {
        let parsed = parse_porcelain("UU merge.rs\0MM both.rs\0AM staged.rs\0");
        let marks: Vec<GitMark> = parsed.marks.into_iter().map(|(_, mark)| mark).collect();
        assert_eq!(marks, [GitMark::Conflicted, GitMark::Modified, GitMark::Added]);
    }

    #[test]
    fn branch_header_handles_fresh_and_detached_repositories() {
        assert_eq!(parse_porcelain("## No commits yet on trunk\0").branch.as_deref(), Some("trunk"));
        assert_eq!(parse_porcelain("## HEAD (no branch)\0").branch.as_deref(), Some("HEAD"));
        assert_eq!(parse_porcelain("## dev...origin/dev\0").branch.as_deref(), Some("dev"));
    }

    #[test]
    fn branch_header_reads_ahead_and_behind_counts() {
        let counts = |header: &str| {
            let parsed = parse_porcelain(header);
            (parsed.ahead, parsed.behind)
        };
        assert_eq!(counts("## main...origin/main [ahead 2, behind 1]\0"), (2, 1));
        assert_eq!(counts("## main...origin/main [ahead 3]\0"), (3, 0));
        assert_eq!(counts("## main...origin/main [behind 4]\0"), (0, 4));
        assert_eq!(counts("## main...origin/main [gone]\0"), (0, 0));
        assert_eq!(counts("## main...origin/main\0"), (0, 0));
        assert_eq!(counts("## main\0"), (0, 0));
        assert_eq!(counts("## HEAD (no branch)\0"), (0, 0));
        assert_eq!(counts("## main...origin/main [ahead x, behind 1]\0"), (0, 1));
    }

    #[test]
    fn summary_labels_omit_zero_counts() {
        let summary = |output: &str| GitSummary::from_porcelain(&parse_porcelain(output)).expect("branch");
        let busy = summary("## main...origin/main [ahead 2, behind 1]\0 M a.rs\0?? b.rs\0?? c.rs\0");
        assert_eq!(busy.full_label(), "main \u{2191}2 \u{2193}1 ~3");
        assert_eq!(busy.sync_label(), "main \u{2191}2 \u{2193}1");
        assert_eq!(summary("## main\0").full_label(), "main");
        assert_eq!(summary("## main...o/main [behind 1]\0").full_label(), "main \u{2193}1");
        assert_eq!(summary("## main\0 M a.rs\0").full_label(), "main ~1");
        assert_eq!(GitSummary::from_porcelain(&parse_porcelain(" M a.rs\0")), None);
    }

    #[test]
    fn a_repository_config_cannot_run_a_program_through_the_summary_read() {
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path();
        let git = |args: &[&str]| {
            assert!(Command::new(GIT_PROGRAM).arg("-C").arg(repo).args(args).status().unwrap().success());
        };
        git(&["init", "-b", "main"]);
        let marker = repo.join("fsmonitor-ran");
        let script = repo.join("monitor.sh");
        std::fs::write(&script, format!("#!/bin/sh\ntouch '{}'\n", marker.display())).unwrap();
        git(&["config", "core.fsmonitor", &script.display().to_string()]);
        git(&["config", "core.hooksPath", &repo.join("hooks").display().to_string()]);
        std::fs::create_dir_all(repo.join("hooks")).unwrap();
        let hook = repo.join("hooks/post-index-change");
        std::fs::write(&hook, format!("#!/bin/sh\ntouch '{}'\n", marker.display())).unwrap();
        for program in [&script, &hook] {
            std::fs::set_permissions(program, PermissionsExt::from_mode(0o755)).unwrap();
        }

        let summary = read_git_summary(repo).expect("repository summary");
        assert_eq!(summary.branch, "main");
        assert_eq!(summary.changed, 2);
        assert!(!marker.exists(), "a repository's config must not run a program on a status read");
    }

    #[test]
    fn a_directory_outside_any_repository_has_no_summary() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_git_summary(dir.path()), None);
    }

    #[test]
    fn status_marks_files_and_collapsed_ancestors_of_changes() {
        let root = Path::new("/r");
        let porcelain = parse_porcelain(" M crates/ui/src/shell.rs\0?? README.md\0");
        let status = GitStatus::from_porcelain(root, porcelain);
        assert_eq!(status.file_mark(Path::new("/r/crates/ui/src/shell.rs")), Some(GitMark::Modified));
        assert_eq!(status.file_mark(Path::new("/r/README.md")), Some(GitMark::Untracked));
        assert_eq!(status.file_mark(Path::new("/r/Cargo.toml")), None);
        assert_eq!(status.dir_mark(Path::new("/r/crates/ui"), false), Some(GitMark::ChangedInside));
        assert_eq!(status.dir_mark(Path::new("/r/crates/ui"), true), None);
        assert_eq!(status.dir_mark(Path::new("/r/assets"), false), None);
        assert_eq!(status.dir_mark(Path::new("/r"), false), Some(GitMark::ChangedInside));
    }

    #[test]
    fn letters_and_addition_colors_follow_the_design() {
        assert_eq!(GitMark::Modified.letter(), "M");
        assert_eq!(GitMark::Untracked.letter(), "U");
        assert_eq!(GitMark::ChangedInside.letter(), "\u{2022}");
        assert!(GitMark::Untracked.is_addition());
        assert!(GitMark::Added.is_addition());
        assert!(!GitMark::Modified.is_addition());
    }

    #[test]
    fn a_symlinked_folder_keeps_its_spelling_for_the_repository_root() {
        let dir = tempfile::tempdir().unwrap();
        let canonical = dir.path().canonicalize().unwrap();
        std::fs::create_dir_all(canonical.join("repo/src")).unwrap();
        let spelled = dir.path().join("repo/src");
        assert_eq!(root_as_spelled(&spelled, &canonical.join("repo")), dir.path().join("repo"));
    }

    #[test]
    fn a_directory_outside_any_repository_has_no_status() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_git_status(dir.path()), None);
    }
}
