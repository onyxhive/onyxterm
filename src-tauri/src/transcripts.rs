use std::collections::HashSet;
use std::path::{Path, PathBuf};

const DEFAULT_CONFIG_DIR: &str = ".claude";
const ALTERNATE_CONFIG_PREFIX: &str = ".claude-";
const PROJECTS_DIR: &str = "projects";
const TRANSCRIPT_EXTENSION: &str = "jsonl";

fn config_dirs(home: &Path) -> Vec<PathBuf> {
    let alternates = std::fs::read_dir(home)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| entry.file_name().to_string_lossy().starts_with(ALTERNATE_CONFIG_PREFIX))
        .map(|entry| entry.path());
    std::iter::once(home.join(DEFAULT_CONFIG_DIR)).chain(alternates).collect()
}

fn projects_dirs(home: &Path) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    config_dirs(home)
        .into_iter()
        .filter_map(|config_dir| config_dir.join(PROJECTS_DIR).canonicalize().ok())
        .filter(|projects_dir| seen.insert(projects_dir.clone()))
        .collect()
}

pub fn find_in(home: &Path, session_id: &str) -> Option<PathBuf> {
    uuid::Uuid::parse_str(session_id).ok()?;
    let file_name = format!("{session_id}.{TRANSCRIPT_EXTENSION}");
    projects_dirs(home)
        .into_iter()
        .flat_map(|projects_dir| std::fs::read_dir(projects_dir).into_iter().flatten().flatten())
        .map(|project_dir| project_dir.path().join(&file_name))
        .find(|candidate| candidate.is_file())
}

pub fn find(session_id: &str) -> Option<PathBuf> {
    find_in(&dirs::home_dir()?, session_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SESSION: &str = "ef40303a-7b7d-4e3e-b1ec-5bb732289b8a";

    fn scratch_home(name: &str) -> PathBuf {
        let home = std::env::temp_dir().join(format!("onyx-hive-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&home).unwrap();
        home
    }

    #[test]
    fn finds_transcripts_in_alternate_config_dirs() {
        let home = scratch_home("alternate");
        let project = home.join(".claude-team/projects/-tmp-probe");
        std::fs::create_dir_all(&project).unwrap();
        std::fs::create_dir_all(home.join(".claude/projects")).unwrap();
        std::fs::write(project.join(format!("{SESSION}.jsonl")), "{}\n").unwrap();
        assert_eq!(find_in(&home, SESSION), Some(project.canonicalize().unwrap().join(format!("{SESSION}.jsonl"))));
        assert_eq!(find_in(&home, "6a1f0a3e-0000-4000-8000-000000000000"), None);
    }

    #[test]
    fn visits_a_symlinked_projects_dir_once() {
        let home = scratch_home("symlink");
        std::fs::create_dir_all(home.join(".claude/projects")).unwrap();
        std::fs::create_dir_all(home.join(".claude-alt")).unwrap();
        std::os::unix::fs::symlink(home.join(".claude/projects"), home.join(".claude-alt/projects")).unwrap();
        assert_eq!(projects_dirs(&home).len(), 1);
    }

    #[test]
    fn rejects_session_ids_that_are_not_uuids() {
        let home = scratch_home("traversal");
        assert_eq!(find_in(&home, "../../etc/passwd"), None);
    }
}
