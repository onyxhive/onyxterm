use std::collections::HashSet;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde::Deserialize;
use tauri::{AppHandle, State};

use crate::chats;
use crate::db::Db;
use crate::error::AppResult;
use crate::protocol::{AgentEvent, Source, StreamParser};
use crate::runtime::rename_chat;

const DEFAULT_CONFIG_DIR: &str = ".claude";
const ALTERNATE_CONFIG_PREFIX: &str = ".claude-";
const PROJECTS_DIR: &str = "projects";
const TRANSCRIPT_EXTENSION: &str = "jsonl";
const TITLE_LINE_MARKER: &str = "-title\"";

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum TitleLine {
    CustomTitle {
        #[serde(rename = "customTitle")]
        custom_title: String,
    },
    AiTitle {
        #[serde(rename = "aiTitle")]
        ai_title: String,
    },
    #[serde(other)]
    Other,
}

#[derive(Default)]
struct SessionTitles {
    custom: Option<String>,
    generated: Option<String>,
}

impl SessionTitles {
    fn record(&mut self, line: &str) {
        if !line.contains(TITLE_LINE_MARKER) {
            return;
        }
        match serde_json::from_str::<TitleLine>(line) {
            Ok(TitleLine::CustomTitle { custom_title }) => self.custom = Some(custom_title),
            Ok(TitleLine::AiTitle { ai_title }) => self.generated = Some(ai_title),
            _ => {}
        }
    }

    fn preferred(self) -> Option<String> {
        self.custom.filter(|title| !title.trim().is_empty()).or(self.generated)
    }
}

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

fn for_each_line(transcript: &Path, mut on_line: impl FnMut(&str)) -> AppResult<()> {
    let mut reader = BufReader::new(std::fs::File::open(transcript)?);
    let mut buffer = Vec::new();
    while reader.read_until(b'\n', &mut buffer)? > 0 {
        on_line(String::from_utf8_lossy(&buffer).trim_end());
        buffer.clear();
    }
    Ok(())
}

pub fn history(transcript: &Path) -> AppResult<Vec<AgentEvent>> {
    let mut parser = StreamParser::new(Source::Transcript);
    let mut events = Vec::new();
    for_each_line(transcript, |line| events.extend(parser.parse_line(line)))?;
    Ok(events)
}

pub fn session_title(transcript: &Path) -> AppResult<Option<String>> {
    let mut titles = SessionTitles::default();
    for_each_line(transcript, |line| titles.record(line))?;
    Ok(titles.preferred())
}

#[tauri::command]
pub fn load_chat_history(app: AppHandle, db: State<'_, Db>, chat_id: String) -> AppResult<Vec<AgentEvent>> {
    let session_id = chats::chat(&db.connection(), &chat_id)?.session_id;
    let Some(transcript) = find(&session_id) else {
        return Ok(Vec::new());
    };
    if let Some(title) = session_title(&transcript)? {
        rename_chat(&app, &chat_id, &title);
    }
    history(&transcript)
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
    fn rebuilds_the_conversation_from_a_transcript() {
        let home = scratch_home("history");
        let transcript = home.join("session.jsonl");
        let lines = [
            r#"{"type":"queue-operation","operation":"enqueue"}"#,
            r#"{"type":"user","isSidechain":false,"message":{"role":"user","content":[{"type":"text","text":"hi"}]}}"#,
            r#"{"type":"user","isMeta":true,"message":{"role":"user","content":"<local-command-caveat>"}}"#,
            r#"{"type":"assistant","message":{"id":"m1","content":[{"type":"thinking","thinking":""}]}}"#,
            r#"{"type":"assistant","message":{"id":"m1","content":[{"type":"text","text":"ok"}]}}"#,
            r#"{"type":"assistant","message":{"id":"m1","content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}}]}}"#,
            r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"x"}]}}"#,
        ];
        std::fs::write(&transcript, lines.join("\n")).unwrap();
        let events = history(&transcript).unwrap();
        assert_eq!(events.len(), 4, "{events:?}");
        assert_eq!(events[0], AgentEvent::UserText { text: "hi".into() });
        assert_eq!(events[1], AgentEvent::Text { message_id: "m1".into(), text: "ok".into() });
        assert!(matches!(&events[2], AgentEvent::ToolStarted { tool_use_id, .. } if tool_use_id == "t1"));
        assert_eq!(events[3], AgentEvent::ToolFinished { tool_use_id: "t1".into(), is_error: false });
    }

    #[test]
    fn takes_the_title_claude_generated_for_the_session() {
        let home = scratch_home("ai-title");
        let transcript = home.join("session.jsonl");
        std::fs::write(&transcript, include_str!("fixtures/titles.jsonl")).unwrap();
        assert_eq!(session_title(&transcript).unwrap().as_deref(), Some("Nearby stores sorting in src/order.ts"));
    }

    #[test]
    fn prefers_a_custom_name_over_the_generated_title_until_it_is_cleared() {
        let home = scratch_home("custom-title");
        let transcript = home.join("session.jsonl");
        let renamed = r#"{"type":"custom-title","customTitle":"Store sort walkthrough","sessionId":"s"}"#;
        let later_ai = r#"{"type":"ai-title","aiTitle":"Something else","sessionId":"s"}"#;
        std::fs::write(&transcript, [renamed, later_ai].join("\n")).unwrap();
        assert_eq!(session_title(&transcript).unwrap().as_deref(), Some("Store sort walkthrough"));
        let cleared = r#"{"type":"custom-title","customTitle":"","sessionId":"s"}"#;
        std::fs::write(&transcript, [renamed, later_ai, cleared].join("\n")).unwrap();
        assert_eq!(session_title(&transcript).unwrap().as_deref(), Some("Something else"));
    }

    #[test]
    fn has_no_title_before_claude_writes_one() {
        let home = scratch_home("untitled");
        let transcript = home.join("session.jsonl");
        std::fs::write(&transcript, r#"{"type":"user","message":{"role":"user","content":"hi"}}"#).unwrap();
        assert_eq!(session_title(&transcript).unwrap(), None);
    }

    #[test]
    fn rejects_session_ids_that_are_not_uuids() {
        let home = scratch_home("traversal");
        assert_eq!(find_in(&home, "../../etc/passwd"), None);
    }
}
