use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::chats;
use crate::db::Db;
use crate::error::AppResult;
use crate::git::validated_id;
use crate::protocol::{AgentEvent, SUMMARY_LENGTH, Source, StreamParser, clipped};
use crate::subprocess::in_background;
use crate::transcripts::{self, for_each_line};

const NOTIFICATION_TAG: &str = "<task-notification>";
const SIDECHAIN_FOLDER: &str = "subagents";
const META_SUFFIX: &str = ".meta.json";
const TRANSCRIPT_SUFFIX: &str = ".jsonl";
const COMPLETED_STATUS: &str = "completed";

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SubagentStatus {
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Subagent {
    pub tool_use_id: String,
    pub agent_type: String,
    pub description: String,
    pub status: SubagentStatus,
    pub last_tool: Option<String>,
    pub summary: Option<String>,
    pub started_at: Option<String>,
    pub last_activity_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SidechainMeta {
    tool_use_id: String,
    #[serde(default)]
    agent_type: String,
    #[serde(default)]
    description: String,
}

#[derive(Debug, Default)]
struct SidechainActivity {
    last_tool: Option<String>,
    last_text: Option<String>,
    started_at: Option<String>,
    last_activity_at: Option<String>,
}

#[derive(Default)]
struct Roster {
    subagents: Vec<Subagent>,
}

impl Roster {
    fn find(&mut self, tool_use_id: &str) -> Option<&mut Subagent> {
        self.subagents.iter_mut().find(|subagent| subagent.tool_use_id == tool_use_id)
    }

    fn start(&mut self, tool_use_id: &str, agent_type: &str, description: &str) {
        if self.find(tool_use_id).is_some() {
            return;
        }
        self.subagents.push(Subagent {
            tool_use_id: tool_use_id.to_string(),
            agent_type: agent_type.to_string(),
            description: description.to_string(),
            status: SubagentStatus::Running,
            last_tool: None,
            summary: None,
            started_at: None,
            last_activity_at: None,
        });
    }

    fn apply(&mut self, event: &AgentEvent) {
        match event {
            AgentEvent::SubagentStarted { tool_use_id, agent_type, description } => {
                self.start(tool_use_id, agent_type, description)
            }
            AgentEvent::SubagentProgress { tool_use_id, last_tool: Some(tool), .. } => {
                if let Some(subagent) = self.find(tool_use_id) {
                    subagent.last_tool = Some(tool.clone());
                }
            }
            AgentEvent::SubagentFinished { tool_use_id, is_error, summary } => {
                if let Some(subagent) = self.find(tool_use_id) {
                    subagent.status = if *is_error { SubagentStatus::Failed } else { SubagentStatus::Completed };
                    subagent.summary = Some(summary.clone()).filter(|summary| !summary.is_empty());
                }
            }
            _ => {}
        }
    }

    fn merge_sidechain(&mut self, meta: SidechainMeta, activity: SidechainActivity) {
        self.start(&meta.tool_use_id, &meta.agent_type, &meta.description);
        let Some(subagent) = self.find(&meta.tool_use_id) else { return };
        subagent.last_tool = activity.last_tool.or(subagent.last_tool.take());
        subagent.summary = activity.last_text.map(|text| clipped(&text, SUMMARY_LENGTH)).or(subagent.summary.take());
        subagent.started_at = activity.started_at;
        subagent.last_activity_at = activity.last_activity_at;
    }
}

fn tag<'a>(text: &'a str, name: &str) -> Option<&'a str> {
    let open = format!("<{name}>");
    let start = text.find(&open)? + open.len();
    let end = text[start..].find(&format!("</{name}>"))? + start;
    Some(text[start..end].trim())
}

fn notification_event(notification: &str) -> Option<AgentEvent> {
    Some(AgentEvent::SubagentFinished {
        tool_use_id: tag(notification, "tool-use-id")?.to_string(),
        is_error: tag(notification, "status")? != COMPLETED_STATUS,
        summary: clipped(tag(notification, "summary").unwrap_or_default(), SUMMARY_LENGTH),
    })
}

fn collect_notifications(value: &Value, events: &mut Vec<AgentEvent>) {
    match value {
        Value::String(text) if text.contains(NOTIFICATION_TAG) => {
            events.extend(text.split(NOTIFICATION_TAG).skip(1).filter_map(notification_event))
        }
        Value::Array(items) => items.iter().for_each(|item| collect_notifications(item, events)),
        Value::Object(fields) => fields.values().for_each(|field| collect_notifications(field, events)),
        _ => {}
    }
}

fn notification_events(line: &str) -> Vec<AgentEvent> {
    let mut events = Vec::new();
    if let Ok(value) = serde_json::from_str::<Value>(line) {
        collect_notifications(&value, &mut events);
    }
    events
}

fn record_timestamp(value: &Value, activity: &mut SidechainActivity) {
    let Some(timestamp) = value.get("timestamp").and_then(Value::as_str) else { return };
    activity.started_at.get_or_insert_with(|| timestamp.to_string());
    activity.last_activity_at = Some(timestamp.to_string());
}

fn record_assistant_blocks(value: &Value, activity: &mut SidechainActivity) {
    if value.get("type").and_then(Value::as_str) != Some("assistant") {
        return;
    }
    let blocks = value.pointer("/message/content").and_then(Value::as_array).cloned().unwrap_or_default();
    for block in blocks {
        match block.get("type").and_then(Value::as_str) {
            Some("tool_use") => activity.last_tool = block.get("name").and_then(Value::as_str).map(String::from),
            Some("text") => {
                let text = block.get("text").and_then(Value::as_str).unwrap_or_default().trim();
                if !text.is_empty() {
                    activity.last_text = Some(text.to_string());
                }
            }
            _ => {}
        }
    }
}

fn sidechain_activity(transcript: &Path) -> SidechainActivity {
    let mut activity = SidechainActivity::default();
    let _ = for_each_line(transcript, |line| {
        if let Ok(value) = serde_json::from_str::<Value>(line) {
            record_timestamp(&value, &mut activity);
            record_assistant_blocks(&value, &mut activity);
        }
    });
    activity
}

fn sidechain_folder(transcript: &Path) -> PathBuf {
    transcript.with_extension("").join(SIDECHAIN_FOLDER)
}

fn sidechains(folder: &Path) -> Vec<(SidechainMeta, SidechainActivity)> {
    let mut metas: Vec<PathBuf> = std::fs::read_dir(folder)
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.to_string_lossy().ends_with(META_SUFFIX))
        .collect();
    metas.sort();
    metas
        .into_iter()
        .filter_map(|meta_path| {
            let meta: SidechainMeta = serde_json::from_str(&std::fs::read_to_string(&meta_path).ok()?).ok()?;
            let meta_text = meta_path.to_string_lossy();
            let transcript = PathBuf::from(format!("{}{TRANSCRIPT_SUFFIX}", meta_text.strip_suffix(META_SUFFIX)?));
            Some((meta, sidechain_activity(&transcript)))
        })
        .collect()
}

pub fn subagents_of(transcript: &Path) -> AppResult<Vec<Subagent>> {
    let mut roster = Roster::default();
    let mut parser = StreamParser::new(Source::Transcript);
    for_each_line(transcript, |line| {
        for event in parser.parse_line(line) {
            roster.apply(&event);
        }
        if line.contains(NOTIFICATION_TAG) {
            notification_events(line).iter().for_each(|event| roster.apply(event));
        }
    })?;
    for (meta, activity) in sidechains(&sidechain_folder(transcript)) {
        roster.merge_sidechain(meta, activity);
    }
    Ok(roster.subagents)
}

#[tauri::command]
pub async fn list_subagents(db: State<'_, Db>, chat_id: String) -> AppResult<Vec<Subagent>> {
    validated_id(&chat_id, "chat")?;
    let session_id = chats::chat(&db.connection(), &chat_id)?.session_id;
    let Some(transcript) = transcripts::find(&session_id) else {
        return Ok(Vec::new());
    };
    in_background(move || subagents_of(&transcript)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_session() -> PathBuf {
        let folder = std::env::temp_dir().join(format!("onyx-hive-subagents-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&folder).unwrap();
        folder.join("session.jsonl")
    }

    #[test]
    fn rebuilds_subagents_from_the_stream_shapes() {
        let transcript = scratch_session();
        std::fs::write(&transcript, include_str!("fixtures/subagents.jsonl")).unwrap();
        let listed = subagents_of(&transcript).unwrap();
        let summary: Vec<_> = listed.iter().map(|agent| (agent.tool_use_id.as_str(), agent.status)).collect();
        assert_eq!(
            summary,
            vec![
                ("toolu_fg", SubagentStatus::Completed),
                ("toolu_bg", SubagentStatus::Failed),
                ("toolu_late", SubagentStatus::Failed),
            ]
        );
        assert_eq!(listed[0].last_tool.as_deref(), Some("Grep"));
        assert_eq!(listed[0].summary.as_deref(), Some("It lives in src/order.ts"));
    }

    #[test]
    fn finishes_background_agents_from_queued_task_notifications_and_reads_sidechains() {
        let transcript = scratch_session();
        std::fs::write(&transcript, include_str!("fixtures/background_subagent.jsonl")).unwrap();
        let folder = sidechain_folder(&transcript);
        std::fs::create_dir_all(&folder).unwrap();
        let meta = r#"{"agentType":"coding","description":"Build it","toolUseId":"toolu_bg","spawnDepth":1}"#;
        std::fs::write(folder.join("agent-a1.meta.json"), meta).unwrap();
        let orphan = r#"{"agentType":"Explore","description":"Look around","toolUseId":"toolu_orphan"}"#;
        std::fs::write(folder.join("agent-a2.meta.json"), orphan).unwrap();
        std::fs::write(folder.join("agent-a1.jsonl"), include_str!("fixtures/sidechain.jsonl")).unwrap();
        let listed = subagents_of(&transcript).unwrap();
        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0].status, SubagentStatus::Completed);
        assert_eq!(listed[0].last_tool.as_deref(), Some("Edit"));
        assert_eq!(listed[0].summary.as_deref(), Some("Built and tested."));
        assert_eq!(listed[0].started_at.as_deref(), Some("2026-10-10T20:46:01.085Z"));
        assert_eq!(listed[0].last_activity_at.as_deref(), Some("2026-10-10T20:49:30.000Z"));
        assert_eq!((listed[1].agent_type.as_str(), listed[1].status), ("Explore", SubagentStatus::Running));
    }

    #[test]
    fn reads_tags_out_of_a_notification() {
        let event = notification_event("<tool-use-id>t1</tool-use-id><status>killed</status>").unwrap();
        assert_eq!(
            event,
            AgentEvent::SubagentFinished { tool_use_id: "t1".into(), is_error: true, summary: "".into() }
        );
        assert!(notification_event("<status>completed</status>").is_none());
    }
}
