use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::attachments::Attachment;
use crate::chats::PermissionMode;
use crate::usage::{self, PlanUsage, RateLimitWindows};

const ASK_USER_QUESTION: &str = "AskUserQuestion";
const DETAIL_LENGTH: usize = 160;
const RULE_LABEL_LENGTH: usize = 120;
const PERSISTABLE_RULE_TYPES: [&str; 2] = ["addRules", "addDirectories"];
const SESSION_DESTINATION: &str = "session";
const TITLE_FIELD: &str = "title";
const SUBAGENT_TOOLS: [&str; 2] = ["Task", "Agent"];
const SHELL_TOOL: &str = "Bash";
const BACKGROUND_FIELD: &str = "run_in_background";
const AGENT_TASK_TYPE: &str = "local_agent";
const DEFAULT_AGENT_TYPE: &str = "general-purpose";
const COMPLETED_STATUS: &str = "completed";
const ASYNC_LAUNCH_PREFIX: &str = "Async agent launched";
const REPORT_MARKER: &str = "The report follows:";
const AGENT_ID_TRAILER: &str = "\nagentId:";
const ERROR_SUBTYPE: &str = "error";
const APPLIED_SETTINGS_FIELD: &str = "applied";
const ULTRACODE_AVAILABLE_FIELD: &str = "ultracodeAvailable";
const RATE_LIMITS_AVAILABLE_FIELD: &str = "rate_limits_available";
const UNKNOWN_CONTROL_ERROR: &str = "the agent refused the request";
pub const SUMMARY_LENGTH: usize = 400;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SlashCommand {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub argument_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentProfile {
    pub name: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelOption {
    pub value: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub supports_effort: bool,
    #[serde(default)]
    pub supported_effort_levels: Vec<String>,
    #[serde(default)]
    pub supports_fast_mode: bool,
    #[serde(default)]
    pub supports_auto_mode: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub email: Option<String>,
    pub organization: Option<String>,
    pub subscription_type: Option<String>,
}

impl Account {
    pub fn is_logged_in(&self) -> bool {
        self.email.is_some() || self.subscription_type.is_some()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub commands: Vec<SlashCommand>,
    #[serde(default)]
    pub agents: Vec<AgentProfile>,
    #[serde(default)]
    pub models: Vec<ModelOption>,
    #[serde(default)]
    pub account: Account,
    #[serde(default, rename = "ultracodeAvailable")]
    pub is_ultracode_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOption {
    pub label: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub question: String,
    #[serde(default)]
    pub header: String,
    #[serde(default)]
    pub options: Vec<QuestionOption>,
    #[serde(default)]
    pub multi_select: bool,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolSummary {
    pub verb: String,
    pub detail: String,
    pub description: String,
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UserImage {
    pub media_type: String,
    pub data_base64: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum AgentEvent {
    Session {
        session_id: String,
    },
    UserText {
        text: String,
        images: Vec<UserImage>,
    },
    TextDelta {
        message_id: String,
        index: u32,
        text: String,
    },
    Text {
        message_id: String,
        text: String,
    },
    ToolStarted {
        tool_use_id: String,
        parent_tool_use_id: Option<String>,
        summary: ToolSummary,
    },
    ToolFinished {
        tool_use_id: String,
        is_error: bool,
    },
    PermissionRequested {
        request_id: String,
        tool_use_id: Option<String>,
        summary: ToolSummary,
        reason: String,
        suggestions: Vec<RuleChoice>,
    },
    QuestionAsked {
        request_id: String,
        questions: Vec<Question>,
    },
    PermissionCancelled {
        request_id: String,
    },
    TurnEnded {
        is_error: bool,
        cost_usd: Option<f64>,
        message: Option<String>,
    },
    Initialized {
        capabilities: Capabilities,
    },
    TitleChanged {
        title: String,
    },
    ProcessExited {
        message: String,
    },
    SubagentStarted {
        tool_use_id: String,
        agent_type: String,
        description: String,
    },
    SubagentProgress {
        tool_use_id: String,
        last_tool: Option<String>,
        text: String,
    },
    SubagentFinished {
        tool_use_id: String,
        is_error: bool,
        summary: String,
    },
    ShellBackgrounded {
        tool_use_id: String,
    },
    ShellFinished {
        tool_use_id: String,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub struct PermissionRequest {
    pub request_id: String,
    pub tool_use_id: Option<String>,
    pub tool_name: String,
    pub input: Value,
    pub suggestions: Vec<Value>,
    pub is_rule_suppressed: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum RuleScope {
    #[serde(rename = "session")]
    Session,
    #[serde(rename = "localSettings")]
    LocalSettings,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RuleChoice {
    pub label: String,
    pub value: RuleScope,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Incoming {
    System(SystemLine),
    StreamEvent(StreamEventLine),
    Assistant(AssistantLine),
    User(UserLine),
    Result(ResultLine),
    ControlRequest(ControlRequestLine),
    ControlResponse(ControlResponseLine),
    ControlCancelRequest(CancelLine),
    RateLimitEvent(RateLimitLine),
    #[serde(other)]
    Other,
}

#[derive(Debug, Deserialize)]
struct SystemLine {
    #[serde(default)]
    subtype: String,
    session_id: Option<String>,
    title: Option<String>,
    tool_use_id: Option<String>,
    #[serde(default)]
    description: String,
    subagent_type: Option<String>,
    task_type: Option<String>,
    last_tool_name: Option<String>,
    #[serde(default)]
    summary: String,
    status: Option<String>,
    #[serde(default)]
    is_backgrounded: bool,
    #[serde(rename = "permissionMode")]
    permission_mode: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct StreamEventLine {
    event: StreamEvent,
    api_message_id: Option<String>,
    parent_tool_use_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum StreamEvent {
    MessageStart {
        message: MessageId,
    },
    ContentBlockDelta {
        index: u32,
        delta: Delta,
    },
    #[serde(other)]
    Other,
}

#[derive(Debug, Deserialize)]
struct MessageId {
    id: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Delta {
    TextDelta {
        text: String,
    },
    #[serde(other)]
    Other,
}

#[derive(Debug, Deserialize)]
struct AssistantLine {
    message: AssistantMessage,
    parent_tool_use_id: Option<String>,
    #[serde(default, rename = "isSidechain")]
    is_sidechain: bool,
}

#[derive(Debug, Deserialize)]
struct AssistantMessage {
    id: String,
    #[serde(default)]
    content: Vec<ContentBlock>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ContentBlock {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        #[serde(default)]
        input: Value,
    },
    ToolResult {
        tool_use_id: String,
        #[serde(default)]
        is_error: Option<bool>,
        #[serde(default)]
        content: Value,
    },
    Image {
        source: ImageSourceLine,
    },
    #[serde(other)]
    Other,
}

#[derive(Debug, Deserialize)]
struct ImageSourceLine {
    #[serde(default)]
    media_type: String,
    #[serde(default)]
    data: String,
}

#[derive(Debug, Deserialize)]
struct UserLine {
    message: UserMessage,
    parent_tool_use_id: Option<String>,
    #[serde(default, rename = "isMeta")]
    is_meta: bool,
    #[serde(default, rename = "isSidechain")]
    is_sidechain: bool,
}

#[derive(Debug, Deserialize)]
struct UserMessage {
    content: UserContent,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum UserContent {
    Text(String),
    Blocks(Vec<ContentBlock>),
}

#[derive(Debug, Deserialize)]
struct ResultLine {
    #[serde(default)]
    subtype: String,
    #[serde(default)]
    is_error: bool,
    total_cost_usd: Option<f64>,
    result: Option<String>,
    #[serde(default)]
    errors: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ControlRequestLine {
    request_id: String,
    request: ControlRequestBody,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "subtype", rename_all = "snake_case")]
enum ControlRequestBody {
    CanUseTool {
        tool_name: String,
        #[serde(default)]
        input: Value,
        #[serde(default)]
        permission_suggestions: Vec<Value>,
        tool_use_id: Option<String>,
        description: Option<String>,
        decision_reason: Option<String>,
        #[serde(default)]
        suppress_always_allow_rule: bool,
    },
    #[serde(other)]
    Other,
}

#[derive(Debug, Deserialize)]
struct ControlResponseLine {
    response: ControlResponseBody,
}

#[derive(Debug, Deserialize)]
struct ControlResponseBody {
    #[serde(default)]
    subtype: String,
    request_id: Option<String>,
    error: Option<String>,
    response: Option<Value>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ControlNotice {
    PermissionModeReported(PermissionMode),
    RequestFailed { request_id: String, message: String },
    UltracodeAvailability(bool),
    UsageReported(PlanUsage),
    RateLimitsReported(RateLimitWindows),
}

#[derive(Debug, Deserialize)]
struct RateLimitLine {
    #[serde(default)]
    rate_limit_info: Value,
}

#[derive(Debug, Deserialize)]
struct CancelLine {
    request_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    Live,
    Transcript,
}

struct SubagentTrack {
    is_background: bool,
    is_finished: bool,
}

struct SubagentLaunch {
    tool_use_id: String,
    agent_type: Option<String>,
    description: String,
    is_background: bool,
}

pub struct StreamParser {
    source: Source,
    current_message_id: Option<String>,
    pending_permissions: Vec<PermissionRequest>,
    notices: Vec<ControlNotice>,
    subagents: HashMap<String, SubagentTrack>,
    background_shells: HashSet<String>,
}

fn json_start(line: &str) -> Option<&str> {
    line.find('{').map(|start| &line[start..])
}

fn truncated(text: &str) -> String {
    let first_line = text.lines().next().unwrap_or_default().trim();
    if first_line.chars().count() <= DETAIL_LENGTH {
        return first_line.to_string();
    }
    let cut: String = first_line.chars().take(DETAIL_LENGTH).collect();
    format!("{cut}…")
}

pub fn clipped(text: &str, max_length: usize) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= max_length {
        return trimmed.to_string();
    }
    let cut: String = trimmed.chars().take(max_length).collect();
    format!("{}…", cut.trim_end())
}

fn result_text(content: &Value) -> String {
    match content {
        Value::String(text) => text.clone(),
        Value::Array(blocks) => {
            blocks.iter().filter_map(|block| block.get("text").and_then(Value::as_str)).collect::<Vec<_>>().join("\n")
        }
        _ => String::new(),
    }
}

fn report_summary(text: &str) -> String {
    let report = text.split_once(REPORT_MARKER).map_or(text, |(_, report)| report);
    let report = report.split_once(AGENT_ID_TRAILER).map_or(report, |(report, _)| report);
    let lines: Vec<&str> = report.lines().map(str::trim).filter(|line| !line.is_empty()).collect();
    clipped(&lines.join("\n"), SUMMARY_LENGTH)
}

fn tool_progress(parent: &str, name: &str, input: &Value) -> AgentEvent {
    let summary = describe_tool(name, input);
    AgentEvent::SubagentProgress {
        tool_use_id: parent.to_string(),
        last_tool: Some(name.to_string()),
        text: format!("{} {}", summary.verb, summary.detail).trim().to_string(),
    }
}

fn text_field<'a>(input: &'a Value, key: &str) -> &'a str {
    input.get(key).and_then(Value::as_str).unwrap_or_default()
}

fn file_name(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path).to_string()
}

fn file_summary(verb: &str, path: &str) -> ToolSummary {
    ToolSummary {
        verb: verb.into(),
        detail: file_name(path),
        file_path: Some(path.to_string()),
        ..ToolSummary::default()
    }
}

fn plain_summary(verb: &str, detail: &str) -> ToolSummary {
    ToolSummary { verb: verb.into(), detail: truncated(detail), ..ToolSummary::default() }
}

fn mcp_summary(name: &str) -> ToolSummary {
    let mut parts = name.trim_start_matches("mcp__").splitn(2, "__");
    let server = parts.next().unwrap_or_default();
    let tool = parts.next().unwrap_or_default();
    plain_summary("Used", &format!("{server} {tool}"))
}

pub fn describe_tool(name: &str, input: &Value) -> ToolSummary {
    match name {
        "Bash" => ToolSummary {
            description: truncated(text_field(input, "description")),
            ..plain_summary("Ran", text_field(input, "command"))
        },
        "Read" => file_summary("Read", text_field(input, "file_path")),
        "Edit" | "MultiEdit" => file_summary("Edited", text_field(input, "file_path")),
        "Write" => file_summary("Wrote", text_field(input, "file_path")),
        "NotebookEdit" => file_summary("Edited", text_field(input, "notebook_path")),
        "Grep" => plain_summary("Searched", text_field(input, "pattern")),
        "Glob" => plain_summary("Listed", text_field(input, "pattern")),
        "BashOutput" => plain_summary("Read output of", "a background shell"),
        "KillShell" | "TaskStop" => plain_summary("Stopped", "a background task"),
        "Task" | "Agent" => plain_summary("Started", &format!("subagent {}", text_field(input, "subagent_type"))),
        "WebFetch" => plain_summary("Fetched", text_field(input, "url")),
        "WebSearch" => plain_summary("Searched the web for", text_field(input, "query")),
        "TodoWrite" => plain_summary("Updated", "the todo list"),
        ASK_USER_QUESTION => plain_summary("Asked", "you a question"),
        mcp if mcp.starts_with("mcp__") => mcp_summary(mcp),
        other => plain_summary("Used", other),
    }
}

fn with_images(mut events: Vec<AgentEvent>, images: Vec<UserImage>) -> Vec<AgentEvent> {
    if images.is_empty() {
        return events;
    }
    let first_text = events.iter_mut().find_map(|event| match event {
        AgentEvent::UserText { images, .. } => Some(images),
        _ => None,
    });
    match first_text {
        Some(slot) => *slot = images,
        None => events.push(AgentEvent::UserText { text: String::new(), images }),
    }
    events
}

fn questions_of(input: &Value) -> Vec<Question> {
    input.get("questions").cloned().and_then(|questions| serde_json::from_value(questions).ok()).unwrap_or_default()
}

impl StreamParser {
    pub fn new(source: Source) -> Self {
        StreamParser {
            source,
            current_message_id: None,
            pending_permissions: Vec::new(),
            notices: Vec::new(),
            subagents: HashMap::new(),
            background_shells: HashSet::new(),
        }
    }

    pub fn take_control_notices(&mut self) -> Vec<ControlNotice> {
        std::mem::take(&mut self.notices)
    }

    pub fn take_permission_requests(&mut self) -> Vec<PermissionRequest> {
        std::mem::take(&mut self.pending_permissions)
    }

    pub fn parse_line(&mut self, line: &str) -> Vec<AgentEvent> {
        let Some(json) = json_start(line) else {
            return Vec::new();
        };
        match serde_json::from_str::<Incoming>(json) {
            Ok(incoming) => self.events_of(incoming),
            Err(_) => Vec::new(),
        }
    }

    fn events_of(&mut self, incoming: Incoming) -> Vec<AgentEvent> {
        match incoming {
            Incoming::System(system) => self.system_events(system),
            Incoming::StreamEvent(stream) => self.stream_events(stream),
            Incoming::Assistant(assistant) => self.assistant_events(assistant),
            Incoming::User(user) => self.user_events(user),
            Incoming::Result(result) => vec![Self::turn_end(result)],
            Incoming::ControlRequest(request) => self.control_request_events(request),
            Incoming::ControlResponse(response) => self.control_response_events(response),
            Incoming::ControlCancelRequest(cancel) => {
                vec![AgentEvent::PermissionCancelled { request_id: cancel.request_id }]
            }
            Incoming::RateLimitEvent(event) => {
                self.record_rate_limits(&event.rate_limit_info);
                Vec::new()
            }
            Incoming::Other => Vec::new(),
        }
    }

    fn system_events(&mut self, system: SystemLine) -> Vec<AgentEvent> {
        let reported_mode = system.permission_mode.clone().and_then(|mode| serde_json::from_value(mode).ok());
        if let Some(mode) = reported_mode {
            self.notices.push(ControlNotice::PermissionModeReported(mode));
        }
        let event = match system.subtype.as_str() {
            "init" => system.session_id.map(|session_id| AgentEvent::Session { session_id }),
            "session_title_changed" => system.title.map(|title| AgentEvent::TitleChanged { title }),
            "task_started" => self.task_started(system),
            "task_progress" => self.task_progress(system),
            "task_notification" => self.task_notification(system),
            _ => None,
        };
        event.into_iter().collect()
    }

    fn start_subagent(&mut self, launch: SubagentLaunch) -> Option<AgentEvent> {
        if let Some(track) = self.subagents.get_mut(&launch.tool_use_id) {
            track.is_background |= launch.is_background;
            return None;
        }
        let track = SubagentTrack { is_background: launch.is_background, is_finished: false };
        self.subagents.insert(launch.tool_use_id.clone(), track);
        Some(AgentEvent::SubagentStarted {
            tool_use_id: launch.tool_use_id,
            agent_type: launch.agent_type.filter(|kind| !kind.is_empty()).unwrap_or(DEFAULT_AGENT_TYPE.into()),
            description: launch.description,
        })
    }

    fn task_started(&mut self, system: SystemLine) -> Option<AgentEvent> {
        if system.task_type.as_deref() != Some(AGENT_TASK_TYPE) {
            return None;
        }
        self.start_subagent(SubagentLaunch {
            tool_use_id: system.tool_use_id?,
            agent_type: system.subagent_type,
            description: system.description,
            is_background: system.is_backgrounded,
        })
    }

    fn task_progress(&self, system: SystemLine) -> Option<AgentEvent> {
        let tool_use_id = system.tool_use_id.filter(|id| self.subagents.contains_key(id))?;
        Some(AgentEvent::SubagentProgress { tool_use_id, last_tool: system.last_tool_name, text: system.description })
    }

    fn task_notification(&mut self, system: SystemLine) -> Option<AgentEvent> {
        let tool_use_id = system.tool_use_id?;
        if self.background_shells.remove(&tool_use_id) {
            return Some(AgentEvent::ShellFinished { tool_use_id });
        }
        let track = self.subagents.get_mut(&tool_use_id).filter(|track| !track.is_finished)?;
        track.is_finished = true;
        Some(AgentEvent::SubagentFinished {
            tool_use_id,
            is_error: system.status.as_deref() != Some(COMPLETED_STATUS),
            summary: clipped(&system.summary, SUMMARY_LENGTH),
        })
    }

    fn finish_by_result(&mut self, tool_use_id: &str, is_error: bool, content: &Value) -> Option<AgentEvent> {
        let track = self.subagents.get_mut(tool_use_id).filter(|track| !track.is_finished)?;
        let text = result_text(content);
        if !is_error && (track.is_background || text.starts_with(ASYNC_LAUNCH_PREFIX)) {
            track.is_background = true;
            return None;
        }
        track.is_finished = true;
        Some(AgentEvent::SubagentFinished {
            tool_use_id: tool_use_id.to_string(),
            is_error,
            summary: report_summary(&text),
        })
    }

    fn stream_events(&mut self, stream: StreamEventLine) -> Vec<AgentEvent> {
        if stream.parent_tool_use_id.is_some() {
            return Vec::new();
        }
        match stream.event {
            StreamEvent::MessageStart { message } => {
                self.current_message_id = Some(message.id);
                Vec::new()
            }
            StreamEvent::ContentBlockDelta { index, delta: Delta::TextDelta { text } } => {
                let Some(message_id) = stream.api_message_id.or_else(|| self.current_message_id.clone()) else {
                    return Vec::new();
                };
                vec![AgentEvent::TextDelta { message_id, index, text }]
            }
            _ => Vec::new(),
        }
    }

    fn assistant_events(&mut self, assistant: AssistantLine) -> Vec<AgentEvent> {
        let parent = assistant.parent_tool_use_id;
        let is_nested = parent.is_some() || assistant.is_sidechain;
        let message_id = assistant.message.id;
        let mut events = Vec::new();
        for block in assistant.message.content {
            match block {
                ContentBlock::Text { text } if !is_nested => {
                    events.push(AgentEvent::Text { message_id: message_id.clone(), text })
                }
                ContentBlock::Text { text } => {
                    events.extend(parent.as_ref().map(|parent| AgentEvent::SubagentProgress {
                        tool_use_id: parent.clone(),
                        last_tool: None,
                        text: clipped(&text, SUMMARY_LENGTH),
                    }))
                }
                ContentBlock::ToolUse { id, name, input } => {
                    events.push(AgentEvent::ToolStarted {
                        tool_use_id: id.clone(),
                        parent_tool_use_id: parent.clone(),
                        summary: describe_tool(&name, &input),
                    });
                    events.extend(parent.as_deref().map(|parent| tool_progress(parent, &name, &input)));
                    self.track_background_shell(&id, &name, &input);
                    events.extend(self.subagent_launch(id, &name, &input));
                }
                _ => {}
            }
        }
        events
    }

    fn track_background_shell(&mut self, tool_use_id: &str, name: &str, input: &Value) {
        if name == SHELL_TOOL && input.get(BACKGROUND_FIELD).and_then(Value::as_bool).unwrap_or(false) {
            self.background_shells.insert(tool_use_id.to_string());
        }
    }

    fn shell_backgrounded(&mut self, tool_use_id: &str, is_error: bool) -> Option<AgentEvent> {
        if !self.background_shells.contains(tool_use_id) {
            return None;
        }
        if is_error {
            self.background_shells.remove(tool_use_id);
            return None;
        }
        Some(AgentEvent::ShellBackgrounded { tool_use_id: tool_use_id.to_string() })
    }

    fn subagent_launch(&mut self, tool_use_id: String, name: &str, input: &Value) -> Option<AgentEvent> {
        if !SUBAGENT_TOOLS.contains(&name) {
            return None;
        }
        self.start_subagent(SubagentLaunch {
            tool_use_id,
            agent_type: input.get("subagent_type").and_then(Value::as_str).map(String::from),
            description: text_field(input, "description").to_string(),
            is_background: input.get("run_in_background").and_then(Value::as_bool).unwrap_or(false),
        })
    }

    fn user_events(&mut self, user: UserLine) -> Vec<AgentEvent> {
        let shows_text = self.source == Source::Transcript
            && user.parent_tool_use_id.is_none()
            && !user.is_meta
            && !user.is_sidechain;
        match user.message.content {
            UserContent::Text(text) if shows_text => vec![AgentEvent::UserText { text, images: Vec::new() }],
            UserContent::Text(_) => Vec::new(),
            UserContent::Blocks(blocks) => self.user_block_events(blocks, shows_text),
        }
    }

    fn user_block_events(&mut self, blocks: Vec<ContentBlock>, shows_text: bool) -> Vec<AgentEvent> {
        let mut events = Vec::new();
        let mut images = Vec::new();
        for block in blocks {
            match block {
                ContentBlock::ToolResult { tool_use_id, is_error, content } => {
                    let is_error = is_error.unwrap_or(false);
                    let finished = self.finish_by_result(&tool_use_id, is_error, &content);
                    events.extend(self.shell_backgrounded(&tool_use_id, is_error));
                    events.push(AgentEvent::ToolFinished { tool_use_id, is_error });
                    events.extend(finished);
                }
                ContentBlock::Text { text } if shows_text => {
                    events.push(AgentEvent::UserText { text, images: Vec::new() })
                }
                ContentBlock::Image { source } if shows_text && !source.data.is_empty() => {
                    images.push(UserImage { media_type: source.media_type, data_base64: source.data })
                }
                _ => {}
            }
        }
        with_images(events, images)
    }

    fn turn_end(result: ResultLine) -> AgentEvent {
        let is_error = result.is_error || result.subtype.starts_with("error");
        let message = if is_error {
            Some(if result.errors.is_empty() {
                result.result.unwrap_or(result.subtype)
            } else {
                result.errors.join("\n")
            })
        } else {
            None
        };
        AgentEvent::TurnEnded { is_error, cost_usd: result.total_cost_usd, message }
    }

    fn control_request_events(&mut self, request: ControlRequestLine) -> Vec<AgentEvent> {
        let ControlRequestBody::CanUseTool {
            tool_name,
            input,
            permission_suggestions,
            tool_use_id,
            description,
            decision_reason,
            suppress_always_allow_rule,
        } = request.request
        else {
            return Vec::new();
        };
        let suggestions = if suppress_always_allow_rule { Vec::new() } else { permission_suggestions };
        let event = if tool_name == ASK_USER_QUESTION {
            AgentEvent::QuestionAsked { request_id: request.request_id.clone(), questions: questions_of(&input) }
        } else {
            AgentEvent::PermissionRequested {
                request_id: request.request_id.clone(),
                tool_use_id: tool_use_id.clone(),
                summary: describe_tool(&tool_name, &input),
                reason: description.or(decision_reason).unwrap_or_default(),
                suggestions: rule_choices(&tool_name, &suggestions, suppress_always_allow_rule),
            }
        };
        self.pending_permissions.push(PermissionRequest {
            request_id: request.request_id,
            tool_use_id,
            tool_name,
            input,
            suggestions,
            is_rule_suppressed: suppress_always_allow_rule,
        });
        vec![event]
    }

    fn control_response_events(&mut self, response: ControlResponseLine) -> Vec<AgentEvent> {
        let body = response.response;
        if body.subtype == ERROR_SUBTYPE {
            self.record_failure(body);
            return Vec::new();
        }
        let Some(payload) = body.response else {
            return Vec::new();
        };
        if let Some(title) = payload.get(TITLE_FIELD).and_then(Value::as_str) {
            return vec![AgentEvent::TitleChanged { title: title.to_string() }];
        }
        if let Some(applied) = payload.get(APPLIED_SETTINGS_FIELD) {
            let is_available = applied.get(ULTRACODE_AVAILABLE_FIELD).and_then(Value::as_bool).unwrap_or(false);
            self.notices.push(ControlNotice::UltracodeAvailability(is_available));
            return Vec::new();
        }
        if payload.get(RATE_LIMITS_AVAILABLE_FIELD).is_some() {
            self.notices.push(ControlNotice::UsageReported(usage::plan_usage_of(&payload)));
            return Vec::new();
        }
        serde_json::from_value::<Capabilities>(payload)
            .map(|capabilities| vec![AgentEvent::Initialized { capabilities }])
            .unwrap_or_default()
    }

    fn record_failure(&mut self, body: ControlResponseBody) {
        let Some(request_id) = body.request_id else { return };
        let message = body.error.unwrap_or_else(|| UNKNOWN_CONTROL_ERROR.into());
        self.notices.push(ControlNotice::RequestFailed { request_id, message });
    }

    fn record_rate_limits(&mut self, info: &Value) {
        let windows = usage::rate_limit_windows_of(info);
        if !windows.is_empty() {
            self.notices.push(ControlNotice::RateLimitsReported(windows));
        }
    }
}

pub fn get_settings_request(request_id: &str) -> String {
    json!({"type": "control_request", "request_id": request_id, "request": {"subtype": "get_settings"}}).to_string()
}

pub fn get_usage_request(request_id: &str) -> String {
    json!({
        "type": "control_request",
        "request_id": request_id,
        "request": {"subtype": "get_usage", "skip_behaviors": true},
    })
    .to_string()
}

pub fn initialize_request(request_id: &str) -> String {
    json!({"type": "control_request", "request_id": request_id, "request": {"subtype": "initialize"}}).to_string()
}

pub fn title_request(request_id: &str, description: &str) -> String {
    json!({
        "type": "control_request",
        "request_id": request_id,
        "request": {"subtype": "generate_session_title", "description": description, "persist": true},
    })
    .to_string()
}

pub fn set_model_request(request_id: &str, model: &str) -> String {
    json!({"type": "control_request", "request_id": request_id, "request": {"subtype": "set_model", "model": model}})
        .to_string()
}

pub fn set_permission_mode_request(request_id: &str, mode: &str) -> String {
    json!({
        "type": "control_request",
        "request_id": request_id,
        "request": {"subtype": "set_permission_mode", "mode": mode},
    })
    .to_string()
}

pub fn apply_flag_settings_request(request_id: &str, settings: Value) -> String {
    json!({
        "type": "control_request",
        "request_id": request_id,
        "request": {"subtype": "apply_flag_settings", "settings": settings},
    })
    .to_string()
}

pub fn interrupt_request(request_id: &str) -> String {
    json!({"type": "control_request", "request_id": request_id, "request": {"subtype": "interrupt"}}).to_string()
}

pub fn user_message(text: &str, attachments: &[Attachment]) -> String {
    let images = attachments.iter().map(Attachment::content_block);
    let text_block = (!text.trim().is_empty()).then(|| json!({"type": "text", "text": text}));
    let content: Vec<Value> = images.chain(text_block).collect();
    json!({"type": "user", "message": {"role": "user", "content": content}}).to_string()
}

fn control_success(request_id: &str, response: Value) -> String {
    json!({"type": "control_response", "response": {"subtype": "success", "request_id": request_id, "response": response}})
        .to_string()
}

fn rule_type(suggestion: &Value) -> &str {
    suggestion.get("type").and_then(Value::as_str).unwrap_or_default()
}

fn persistable(suggestions: &[Value]) -> Vec<Value> {
    suggestions.iter().filter(|suggestion| PERSISTABLE_RULE_TYPES.contains(&rule_type(suggestion))).cloned().collect()
}

fn rule_text(suggestion: &Value) -> Vec<String> {
    let rules = suggestion.get("rules").and_then(Value::as_array).into_iter().flatten().filter_map(|rule| {
        let tool = rule.get("toolName").and_then(Value::as_str)?;
        Some(match rule.get("ruleContent").and_then(Value::as_str) {
            Some(content) => format!("{tool}({content})"),
            None => tool.to_string(),
        })
    });
    let directories = suggestion.get("directories").and_then(Value::as_array).into_iter().flatten();
    rules.chain(directories.filter_map(|directory| directory.as_str().map(String::from))).collect()
}

fn rules_label(tool_name: &str, suggestions: &[Value]) -> String {
    let texts: Vec<String> = suggestions.iter().flat_map(rule_text).collect();
    let joined = if texts.is_empty() { tool_name.to_string() } else { texts.join(", ") };
    clipped(&joined, RULE_LABEL_LENGTH)
}

fn rule_choices(tool_name: &str, suggestions: &[Value], is_suppressed: bool) -> Vec<RuleChoice> {
    if is_suppressed {
        return Vec::new();
    }
    let for_chat = RuleChoice {
        label: format!("Allow {} for this chat", rules_label(tool_name, suggestions)),
        value: RuleScope::Session,
    };
    let saved = persistable(suggestions);
    let for_project = (!saved.is_empty()).then(|| RuleChoice {
        label: format!("Always allow {} in this project", rules_label(tool_name, &saved)),
        value: RuleScope::LocalSettings,
    });
    std::iter::once(for_chat).chain(for_project).collect()
}

fn scoped_rules(request: &PermissionRequest, scope: RuleScope) -> Vec<Value> {
    let chosen = match scope {
        RuleScope::Session => request.suggestions.clone(),
        RuleScope::LocalSettings => persistable(&request.suggestions),
    };
    if chosen.is_empty() {
        let fallback = json!({"type": "addRules", "rules": [{"toolName": request.tool_name}], "behavior": "allow"});
        return for_session(vec![fallback]);
    }
    for_session(chosen)
}

pub fn project_rules(request: &PermissionRequest) -> Vec<Value> {
    persistable(&request.suggestions)
}

fn for_session(rules: Vec<Value>) -> Vec<Value> {
    rules
        .into_iter()
        .map(|mut rule| {
            if let Some(fields) = rule.as_object_mut() {
                fields.insert("destination".into(), Value::from(SESSION_DESTINATION));
            }
            rule
        })
        .collect()
}

pub fn allow_once(request: &PermissionRequest) -> String {
    control_success(
        &request.request_id,
        json!({
            "behavior": "allow",
            "updatedInput": request.input,
            "toolUseID": request.tool_use_id,
            "decisionClassification": "user_temporary",
        }),
    )
}

pub fn allow_with_rules(request: &PermissionRequest, scope: RuleScope) -> String {
    if request.is_rule_suppressed {
        return allow_once(request);
    }
    control_success(
        &request.request_id,
        json!({
            "behavior": "allow",
            "updatedInput": request.input,
            "toolUseID": request.tool_use_id,
            "updatedPermissions": scoped_rules(request, scope),
            "decisionClassification": "user_permanent",
        }),
    )
}

pub fn deny(request: &PermissionRequest, message: &str) -> String {
    control_success(
        &request.request_id,
        json!({
            "behavior": "deny",
            "message": message,
            "toolUseID": request.tool_use_id,
            "decisionClassification": "user_reject",
        }),
    )
}

pub fn answer_questions(request: &PermissionRequest, answers: &HashMap<String, String>) -> String {
    let questions = request.input.get("questions").cloned().unwrap_or(Value::Array(Vec::new()));
    control_success(
        &request.request_id,
        json!({
            "behavior": "allow",
            "updatedInput": {"questions": questions, "answers": answers},
            "toolUseID": request.tool_use_id,
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROBE_ONE: &str = include_str!("fixtures/probe1.jsonl");
    const PROBE_TWO: &str = include_str!("fixtures/probe2.jsonl");
    const TITLES: &str = include_str!("fixtures/titles.jsonl");
    const SUBAGENTS: &str = include_str!("fixtures/subagents.jsonl");
    const BACKGROUND_SHELL: &str = include_str!("fixtures/background_shell.jsonl");
    const GET_USAGE: &str = include_str!("fixtures/get_usage.json");

    fn subagent_events(source: Source) -> Vec<AgentEvent> {
        let (events, _) = parse_all(source, SUBAGENTS);
        events
            .into_iter()
            .filter(|event| {
                matches!(
                    event,
                    AgentEvent::SubagentStarted { .. }
                        | AgentEvent::SubagentProgress { .. }
                        | AgentEvent::SubagentFinished { .. }
                )
            })
            .collect()
    }

    fn parse_all(source: Source, capture: &str) -> (Vec<AgentEvent>, Vec<PermissionRequest>) {
        let mut parser = StreamParser::new(source);
        let events = capture.lines().flat_map(|line| parser.parse_line(line)).collect();
        (events, parser.take_permission_requests())
    }

    #[test]
    fn reads_the_initialize_response_behind_a_line_prefix() {
        let (events, _) = parse_all(Source::Live, PROBE_TWO);
        let Some(AgentEvent::Initialized { capabilities }) = events.first() else {
            panic!("expected the initialize response first, got {:?}", events.first());
        };
        assert_eq!(capabilities.account.subscription_type.as_deref(), Some("Claude Team"));
        assert!(capabilities.account.is_logged_in());
        assert!(capabilities.commands.iter().any(|command| command.name == "deep-research"));
        let haiku = capabilities.models.iter().find(|model| model.value == "haiku").unwrap();
        assert!(!haiku.supported_effort_levels.is_empty());
        assert!(!capabilities.agents.is_empty());
    }

    #[test]
    fn takes_the_session_id_from_every_init() {
        let (events, _) = parse_all(Source::Live, PROBE_TWO);
        let sessions: Vec<_> = events.iter().filter(|event| matches!(event, AgentEvent::Session { .. })).collect();
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0], &AgentEvent::Session { session_id: "ef40303a-7b7d-4e3e-b1ec-5bb732289b8a".into() });
    }

    #[test]
    fn streams_text_deltas_and_merges_final_text_by_message_id() {
        let (events, _) = parse_all(Source::Live, PROBE_TWO);
        let deltas: Vec<_> = events
            .iter()
            .filter_map(|event| match event {
                AgentEvent::TextDelta { message_id, text, .. } => Some((message_id.as_str(), text.as_str())),
                _ => None,
            })
            .collect();
        assert_eq!(deltas, vec![("msg_011CgqGd4xQ2o4ovkJLD2KrQ", "done"), ("msg_011CgqGd9bCgh5WRGKvrSsig", "Bye!")]);
        assert!(
            events
                .contains(&AgentEvent::Text { message_id: "msg_011CgqGd4xQ2o4ovkJLD2KrQ".into(), text: "done".into() })
        );
    }

    #[test]
    fn pairs_tool_use_with_its_result_and_raises_the_permission() {
        let (events, permissions) = parse_all(Source::Live, PROBE_TWO);
        let tool_id = "toolu_01Q1FJaFLEsy9udorEXBLt7X";
        let started = events.iter().position(|event| {
            matches!(event, AgentEvent::ToolStarted { tool_use_id, summary, .. }
            if tool_use_id == tool_id && summary.verb == "Ran" && summary.detail == "echo hi > f.txt")
        });
        let asked = events.iter().position(|event| {
            matches!(event, AgentEvent::PermissionRequested { tool_use_id, .. }
            if tool_use_id.as_deref() == Some(tool_id))
        });
        let finished = events.iter().position(|event| {
            matches!(event, AgentEvent::ToolFinished { tool_use_id, is_error }
            if tool_use_id == tool_id && !is_error)
        });
        assert!(started < asked && asked < finished, "{started:?} {asked:?} {finished:?}");
        assert_eq!(permissions.len(), 1);
        assert_eq!(permissions[0].request_id, "29d44ef3-de87-4e4f-a009-a7402b8bd4f3");
        assert_eq!(permissions[0].suggestions.len(), 2);
    }

    #[test]
    fn ends_each_turn_with_its_cost() {
        let (events, _) = parse_all(Source::Live, PROBE_TWO);
        let ends: Vec<_> = events.iter().filter(|event| matches!(event, AgentEvent::TurnEnded { .. })).collect();
        assert_eq!(ends.len(), 2);
        assert!(matches!(ends[0], AgentEvent::TurnEnded { is_error: false, cost_usd: Some(cost), message: None }
            if *cost > 0.0));
    }

    #[test]
    fn live_mode_hides_replayed_user_text_but_transcript_mode_shows_it() {
        let (live, _) = parse_all(Source::Live, PROBE_TWO);
        assert!(!live.iter().any(|event| matches!(event, AgentEvent::UserText { .. })));
        let (transcript, _) = parse_all(Source::Transcript, PROBE_TWO);
        assert!(transcript.contains(&AgentEvent::UserText { text: "Now just say bye.".into(), images: Vec::new() }));
    }

    #[test]
    fn reads_complete_assistant_messages_without_partial_stream() {
        let (events, _) = parse_all(Source::Live, PROBE_ONE);
        assert!(events.iter().any(|event| matches!(event, AgentEvent::Text { .. })));
        assert!(events.iter().any(|event| matches!(event, AgentEvent::TurnEnded { is_error: false, .. })));
    }

    #[test]
    fn never_fails_on_unknown_or_broken_lines() {
        let mut parser = StreamParser::new(Source::Live);
        for line in ["", "zsh: no job control", "{\"type\":\"brand_new\"}", "{not json", "prefix {\"type\":\"user\"}"] {
            assert!(parser.parse_line(line).is_empty(), "{line}");
        }
    }

    #[test]
    fn turns_ask_user_question_into_a_question() {
        let line = r#"{"type":"control_request","request_id":"q1","request":{"subtype":"can_use_tool",
            "tool_name":"AskUserQuestion","tool_use_id":"toolu_q","input":{"questions":[{"question":"Which?",
            "header":"Pick","options":[{"label":"A","description":"first"},{"label":"B"}],"multiSelect":false}]}}}"#
            .replace('\n', "");
        let mut parser = StreamParser::new(Source::Live);
        let events = parser.parse_line(&line);
        let AgentEvent::QuestionAsked { request_id, questions } = &events[0] else { panic!("{events:?}") };
        assert_eq!(request_id, "q1");
        assert_eq!(questions[0].options[1].label, "B");
        let request = parser.take_permission_requests().remove(0);
        let answers = HashMap::from([("Which?".to_string(), "A".to_string())]);
        let reply: Value = serde_json::from_str(&answer_questions(&request, &answers)).unwrap();
        assert_eq!(reply["response"]["response"]["updatedInput"]["answers"]["Which?"], "A");
        assert_eq!(reply["response"]["response"]["updatedInput"]["questions"][0]["question"], "Which?");
    }

    #[test]
    fn always_allow_scopes_every_suggestion_to_the_session() {
        let (_, permissions) = parse_all(Source::Live, PROBE_TWO);
        let reply: Value = serde_json::from_str(&allow_with_rules(&permissions[0], RuleScope::Session)).unwrap();
        let body = &reply["response"]["response"];
        assert_eq!(body["behavior"], "allow");
        assert_eq!(body["updatedInput"]["command"], "echo hi > f.txt");
        let destinations: Vec<_> =
            body["updatedPermissions"].as_array().unwrap().iter().map(|rule| &rule["destination"]).collect();
        assert!(destinations.iter().all(|destination| *destination == "session"));
        assert_eq!(body["decisionClassification"], "user_permanent");
        let denied: Value = serde_json::from_str(&deny(&permissions[0], "no")).unwrap();
        assert_eq!(denied["response"]["response"]["behavior"], "deny");
        assert_eq!(denied["response"]["response"]["decisionClassification"], "user_reject");
        let once: Value = serde_json::from_str(&allow_once(&permissions[0])).unwrap();
        assert_eq!(once["response"]["response"]["decisionClassification"], "user_temporary");
    }

    fn bash_request(extra: &str) -> String {
        format!(
            r#"{{"type":"control_request","request_id":"b1","request":{{"subtype":"can_use_tool","tool_name":"Bash",
            "input":{{"command":"cd order && ls src"}},"tool_use_id":"t1","permission_suggestions":[
            {{"type":"addRules","rules":[{{"toolName":"Bash","ruleContent":"ls:*"}}],"behavior":"allow",
            "destination":"localSettings"}},
            {{"type":"setMode","mode":"acceptEdits","destination":"session"}}]{extra}}}}}"#
        )
        .replace('\n', "")
    }

    #[test]
    fn offers_chat_and_project_rules_from_the_suggestions() {
        let mut parser = StreamParser::new(Source::Live);
        let events = parser.parse_line(&bash_request(""));
        let AgentEvent::PermissionRequested { suggestions, .. } = &events[0] else { panic!("{events:?}") };
        assert_eq!(
            suggestions,
            &vec![
                RuleChoice { label: "Allow Bash(ls:*) for this chat".into(), value: RuleScope::Session },
                RuleChoice { label: "Always allow Bash(ls:*) in this project".into(), value: RuleScope::LocalSettings },
            ]
        );
        let wire = serde_json::to_value(&suggestions[1]).unwrap();
        assert_eq!(wire, json!({"label": "Always allow Bash(ls:*) in this project", "value": "localSettings"}));
        let request = parser.take_permission_requests().remove(0);
        assert_eq!(
            project_rules(&request),
            vec![
                json!({"type": "addRules", "rules": [{"toolName": "Bash", "ruleContent": "ls:*"}], "behavior": "allow",
                "destination": "localSettings"})
            ]
        );
        let project: Value = serde_json::from_str(&allow_with_rules(&request, RuleScope::LocalSettings)).unwrap();
        assert_eq!(
            project["response"]["response"]["updatedPermissions"],
            json!([{"type": "addRules", "rules": [{"toolName": "Bash", "ruleContent": "ls:*"}], "behavior": "allow",
                "destination": "session"}])
        );
        let chat: Value = serde_json::from_str(&allow_with_rules(&request, RuleScope::Session)).unwrap();
        let destinations: Vec<_> = chat["response"]["response"]["updatedPermissions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|rule| rule["destination"].clone())
            .collect();
        assert_eq!(destinations, vec![json!("session"), json!("session")]);
    }

    #[test]
    fn grants_the_whole_tool_for_the_chat_when_claude_suggests_nothing() {
        let line = r#"{"type":"control_request","request_id":"w1","request":{"subtype":"can_use_tool",
            "tool_name":"WebFetch","input":{"url":"https://example.com"},"tool_use_id":"t2"}}"#
            .replace('\n', "");
        let mut parser = StreamParser::new(Source::Live);
        let events = parser.parse_line(&line);
        let AgentEvent::PermissionRequested { suggestions, .. } = &events[0] else { panic!("{events:?}") };
        assert_eq!(
            suggestions,
            &vec![RuleChoice { label: "Allow WebFetch for this chat".into(), value: RuleScope::Session }]
        );
        let request = parser.take_permission_requests().remove(0);
        let reply: Value = serde_json::from_str(&allow_with_rules(&request, RuleScope::Session)).unwrap();
        assert_eq!(
            reply["response"]["response"]["updatedPermissions"],
            json!([
                {"type": "addRules", "rules": [{"toolName": "WebFetch"}], "behavior": "allow", "destination": "session"}
            ])
        );
    }

    #[test]
    fn offers_no_standing_rule_when_claude_suppresses_it() {
        let mut parser = StreamParser::new(Source::Live);
        let events = parser.parse_line(&bash_request(r#","suppress_always_allow_rule":true"#));
        let AgentEvent::PermissionRequested { suggestions, .. } = &events[0] else { panic!("{events:?}") };
        assert!(suggestions.is_empty());
        let request = parser.take_permission_requests().remove(0);
        assert!(project_rules(&request).is_empty());
        let reply: Value = serde_json::from_str(&allow_with_rules(&request, RuleScope::Session)).unwrap();
        assert!(reply["response"]["response"].get("updatedPermissions").is_none());
        assert_eq!(reply["response"]["response"]["decisionClassification"], "user_temporary");
    }

    #[test]
    fn treats_subagent_approvals_like_main_agent_ones() {
        let mut parser = StreamParser::new(Source::Live);
        let launch = r#"{"type":"assistant","message":{"id":"m1","content":[{"type":"tool_use","id":"agent1",
            "name":"Task","input":{"description":"Scout","subagent_type":"scout","prompt":"look"}}]}}"#;
        parser.parse_line(&launch.replace('\n', ""));
        let inner = bash_request("").replace(r#""tool_use_id":"t1""#, r#""tool_use_id":"inner1""#);
        let events = parser.parse_line(&inner);
        let AgentEvent::PermissionRequested { suggestions, .. } = &events[0] else { panic!("{events:?}") };
        assert_eq!(suggestions.len(), 2);
        let request = parser.take_permission_requests().remove(0);
        let reply: Value = serde_json::from_str(&allow_with_rules(&request, RuleScope::Session)).unwrap();
        assert_eq!(reply["response"]["response"]["toolUseID"], "inner1");
        assert_eq!(reply["response"]["response"]["updatedPermissions"][0]["destination"], "session");
    }

    #[test]
    fn reads_generated_and_renamed_session_titles() {
        let (events, _) = parse_all(Source::Live, TITLES);
        let titles: Vec<_> = events
            .iter()
            .filter_map(|event| match event {
                AgentEvent::TitleChanged { title } => Some(title.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(titles, vec!["Nearby stores sorting in src/order.ts", "Store sort walkthrough"]);
    }

    #[test]
    fn asks_the_live_session_to_switch_models() {
        let request: Value = serde_json::from_str(&set_model_request("m1", "opus")).unwrap();
        assert_eq!(request["type"], "control_request");
        assert_eq!(request["request_id"], "m1");
        assert_eq!(request["request"], json!({"subtype": "set_model", "model": "opus"}));
    }

    #[test]
    fn asks_the_live_session_to_switch_permission_modes() {
        let request: Value = serde_json::from_str(&set_permission_mode_request("p1", "acceptEdits")).unwrap();
        assert_eq!(request["type"], "control_request");
        assert_eq!(request["request_id"], "p1");
        assert_eq!(request["request"], json!({"subtype": "set_permission_mode", "mode": "acceptEdits"}));
    }

    #[test]
    fn reports_the_permission_mode_claude_says_it_is_in() {
        let mut parser = StreamParser::new(Source::Live);
        parser.parse_line(r#"{"type":"system","subtype":"status","status":null,"permissionMode":"default"}"#);
        parser.parse_line(r#"{"type":"system","subtype":"init","session_id":"s1","permissionMode":"plan"}"#);
        parser.parse_line(r#"{"type":"system","subtype":"status","status":null,"permissionMode":"dontAsk"}"#);
        parser.parse_line(r#"{"type":"system","subtype":"status","status":null,"permissionMode":"auto"}"#);
        parser.parse_line(r#"{"type":"system","subtype":"status","status":"compacting"}"#);
        assert_eq!(
            parser.take_control_notices(),
            vec![
                ControlNotice::PermissionModeReported(PermissionMode::Default),
                ControlNotice::PermissionModeReported(PermissionMode::Plan),
                ControlNotice::PermissionModeReported(PermissionMode::Auto)
            ]
        );
        assert!(parser.take_control_notices().is_empty());
    }

    #[test]
    fn reports_control_requests_claude_refused() {
        let mut parser = StreamParser::new(Source::Live);
        let refused = r#"{"type":"control_response","response":{"subtype":"error","request_id":"p1",
            "error":"Cannot set permission mode to bypassPermissions","error_code":"bypass_not_launched"}}"#;
        assert!(parser.parse_line(&refused.replace('\n', "")).is_empty());
        let accepted = r#"{"type":"control_response","response":{"subtype":"success","request_id":"p2",
            "response":{"mode":"plan"}}}"#;
        parser.parse_line(&accepted.replace('\n', ""));
        assert_eq!(
            parser.take_control_notices(),
            vec![ControlNotice::RequestFailed {
                request_id: "p1".into(),
                message: "Cannot set permission mode to bypassPermissions".into()
            }]
        );
    }

    fn only_notice(parser: &mut StreamParser, line: &str) -> ControlNotice {
        assert!(parser.parse_line(line).is_empty());
        let mut notices = parser.take_control_notices();
        assert_eq!(notices.len(), 1, "{notices:?}");
        notices.remove(0)
    }

    #[test]
    fn reads_plan_usage_from_the_get_usage_response() {
        let mut parser = StreamParser::new(Source::Live);
        let ControlNotice::UsageReported(usage) = only_notice(&mut parser, GET_USAGE.trim()) else {
            panic!("expected a usage report");
        };
        assert_eq!(usage.subscription_type.as_deref(), Some("pro"));
        assert!(usage.has_plan_limits);
        assert_eq!(usage.session.map(|window| window.utilization), Some(1.0));
        assert_eq!(usage.session.and_then(|window| window.resets_at), Some(1_794_275_399_780));
        assert_eq!(usage.week.map(|window| window.utilization), Some(27.0));
        let models: Vec<_> =
            usage.model_weeks.iter().map(|week| (week.model.as_str(), week.window.utilization)).collect();
        assert_eq!(models, vec![("Fable", 0.0)]);
        assert_eq!(usage.extra_usage, None);
        let request: Value = serde_json::from_str(&get_usage_request("u1")).unwrap();
        assert_eq!(request["request"], json!({"subtype": "get_usage", "skip_behaviors": true}));
    }

    #[test]
    fn reports_a_refused_or_empty_usage_request() {
        let mut parser = StreamParser::new(Source::Live);
        let refused = r#"{"type":"control_response","response":{"subtype":"error","request_id":"u1","error":"get_usage is not supported in this context"}}"#;
        assert_eq!(
            only_notice(&mut parser, refused),
            ControlNotice::RequestFailed {
                request_id: "u1".into(),
                message: "get_usage is not supported in this context".into()
            }
        );
        let api_key = r#"{"type":"control_response","response":{"subtype":"success","request_id":"u2","response":{"subscription_type":null,"rate_limits_available":false}}}"#;
        let ControlNotice::UsageReported(usage) = only_notice(&mut parser, api_key) else {
            panic!("expected a usage report");
        };
        assert!(!usage.has_plan_limits);
        assert_eq!((usage.session, usage.week, usage.model_weeks.len()), (None, None, 0));
    }

    #[test]
    fn reads_rate_limit_events_from_live_chats() {
        let mut parser = StreamParser::new(Source::Live);
        let line = PROBE_ONE.lines().find(|line| line.contains("rate_limit_event")).unwrap();
        let ControlNotice::RateLimitsReported(windows) = only_notice(&mut parser, line) else {
            panic!("expected rate limits");
        };
        assert_eq!(windows.session.map(|window| window.utilization), Some(3.0));
        assert_eq!(windows.week.and_then(|window| window.resets_at), Some(1_794_628_800_000));
        assert!(parser.parse_line(r#"{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"}}"#).is_empty());
        assert!(parser.take_control_notices().is_empty());
    }

    #[test]
    fn sends_images_before_the_text_and_drops_an_empty_text_block() {
        let image: Attachment =
            serde_json::from_value(json!({"mediaType": "image/jpeg", "dataBase64": "aGk=", "name": "a.jpg"})).unwrap();
        let message: Value =
            serde_json::from_str(&user_message("what is this?", std::slice::from_ref(&image))).unwrap();
        assert_eq!(
            message["message"]["content"],
            json!([
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "aGk="}},
                {"type": "text", "text": "what is this?"},
            ])
        );
        let only_image: Value = serde_json::from_str(&user_message(" ", &[image])).unwrap();
        assert_eq!(only_image["message"]["content"].as_array().unwrap().len(), 1);
        let only_text: Value = serde_json::from_str(&user_message("hi", &[])).unwrap();
        assert_eq!(only_text["message"]["content"], json!([{"type": "text", "text": "hi"}]));
    }

    #[test]
    fn surfaces_images_the_user_sent_from_the_transcript() {
        let line = r#"{"type":"user","message":{"role":"user","content":[
            {"type":"text","text":"what is this?"},
            {"type":"image","source":{"type":"base64","media_type":"image/png","data":"aGk="}},
            {"type":"image","source":{"type":"url","url":"https://example.com/a.png"}}]}}"#;
        let mut transcript = StreamParser::new(Source::Transcript);
        let image = UserImage { media_type: "image/png".into(), data_base64: "aGk=".into() };
        assert_eq!(
            transcript.parse_line(&line.replace('\n', "")),
            vec![AgentEvent::UserText { text: "what is this?".into(), images: vec![image.clone()] }]
        );
        let image_only = r#"{"type":"user","message":{"role":"user","content":[
            {"type":"image","source":{"type":"base64","media_type":"image/png","data":"aGk="}}]}}"#;
        assert_eq!(
            transcript.parse_line(&image_only.replace('\n', "")),
            vec![AgentEvent::UserText { text: String::new(), images: vec![image] }]
        );
        assert!(StreamParser::new(Source::Live).parse_line(&line.replace('\n', "")).is_empty());
        let wire = serde_json::to_value(AgentEvent::UserText { text: "t".into(), images: Vec::new() }).unwrap();
        assert_eq!(wire, json!({"kind": "userText", "text": "t", "images": []}));
    }

    #[test]
    fn reads_fast_and_auto_support_per_model_and_whether_ultracode_is_available() {
        let mut parser = StreamParser::new(Source::Live);
        let initialized = r#"{"type":"control_response","response":{"subtype":"success","request_id":"i1",
            "response":{"commands":[],"models":[{"value":"opus","displayName":"Opus","description":"",
            "supportsEffort":true,"supportedEffortLevels":["low","medium","high","xhigh","max"],
            "supportsFastMode":true,"supportsAutoMode":true},{"value":"haiku","displayName":"Haiku"}]}}}"#;
        let events = parser.parse_line(&initialized.replace('\n', ""));
        let AgentEvent::Initialized { capabilities } = &events[0] else { panic!("{events:?}") };
        let (opus, haiku) = (&capabilities.models[0], &capabilities.models[1]);
        assert!(opus.supports_fast_mode && opus.supports_auto_mode);
        assert_eq!(opus.supported_effort_levels, vec!["low", "medium", "high", "xhigh", "max"]);
        assert!(!haiku.supports_fast_mode && !haiku.supports_auto_mode && haiku.supported_effort_levels.is_empty());
        assert!(!capabilities.is_ultracode_available);
        let wire = serde_json::to_value(capabilities).unwrap();
        assert_eq!(wire["ultracodeAvailable"], false);
        assert_eq!(wire["models"][0]["supportsFastMode"], true);
        let settings = r#"{"type":"control_response","response":{"subtype":"success","request_id":"g1",
            "response":{"effective":{},"applied":{"model":"opus","effort":null,"ultracodeAvailable":true}}}}"#;
        assert!(parser.parse_line(&settings.replace('\n', "")).is_empty());
        assert_eq!(parser.take_control_notices(), vec![ControlNotice::UltracodeAvailability(true)]);
        let request: Value = serde_json::from_str(&get_settings_request("g1")).unwrap();
        assert_eq!(request["request"], json!({"subtype": "get_settings"}));
    }

    #[test]
    fn asks_claude_to_generate_and_persist_a_title() {
        let request: Value = serde_json::from_str(&title_request("t1", "fix the sort")).unwrap();
        assert_eq!(request["request"]["subtype"], "generate_session_title");
        assert_eq!(request["request"]["description"], "fix the sort");
        assert_eq!(request["request"]["persist"], true);
    }

    #[test]
    fn summarises_file_edits_by_file_name() {
        let input = json!({"file_path": "/repo/src/nearby.rs", "old_string": "a\nb", "new_string": "a\nb\nc"});
        let summary = describe_tool("Edit", &input);
        assert_eq!((summary.verb.as_str(), summary.detail.as_str()), ("Edited", "nearby.rs"));
        assert_eq!(summary.file_path.as_deref(), Some("/repo/src/nearby.rs"));
        assert_eq!(describe_tool("mcp__github__create_pr", &json!({})).detail, "github create_pr");
    }

    #[test]
    fn starts_each_subagent_once_from_its_tool_use_or_task_started() {
        let started: Vec<_> = subagent_events(Source::Live)
            .into_iter()
            .filter_map(|event| match event {
                AgentEvent::SubagentStarted { tool_use_id, agent_type, description } => {
                    Some((tool_use_id, agent_type, description))
                }
                _ => None,
            })
            .collect();
        assert_eq!(
            started,
            vec![
                ("toolu_fg".into(), "Explore".into(), "Find the sort".into()),
                ("toolu_bg".into(), "coding".into(), "Fix the sort".into()),
                ("toolu_late".into(), DEFAULT_AGENT_TYPE.into(), "Review".into()),
            ]
        );
    }

    #[test]
    fn reports_subagent_progress_from_nested_messages_and_task_progress() {
        let progress: Vec<_> = subagent_events(Source::Live)
            .into_iter()
            .filter_map(|event| match event {
                AgentEvent::SubagentProgress { tool_use_id, last_tool, text } => Some((tool_use_id, last_tool, text)),
                _ => None,
            })
            .collect();
        assert_eq!(
            progress,
            vec![
                ("toolu_fg".into(), Some("Grep".into()), "Searched sortStores".into()),
                ("toolu_fg".into(), Some("Grep".into()), "Searching sortStores".into()),
                ("toolu_fg".into(), None, "It lives in src/order.ts".into()),
            ]
        );
    }

    #[test]
    fn finishes_foreground_on_first_signal_and_background_only_on_notification() {
        let finished: Vec<_> = subagent_events(Source::Live)
            .into_iter()
            .filter_map(|event| match event {
                AgentEvent::SubagentFinished { tool_use_id, is_error, summary } => {
                    Some((tool_use_id, is_error, summary))
                }
                _ => None,
            })
            .collect();
        assert_eq!(
            finished,
            vec![
                ("toolu_fg".into(), false, "It lives in src/order.ts".into()),
                ("toolu_bg".into(), true, "Agent \"Fix the sort\" failed".into()),
                ("toolu_late".into(), true, "Agent type not found".into()),
            ]
        );
    }

    #[test]
    fn keeps_a_background_shell_running_until_its_task_notification() {
        let (events, _) = parse_all(Source::Live, BACKGROUND_SHELL);
        let backgrounded = AgentEvent::ShellBackgrounded { tool_use_id: "toolu_server".into() };
        let launched = AgentEvent::ToolFinished { tool_use_id: "toolu_server".into(), is_error: false };
        let finished = AgentEvent::ShellFinished { tool_use_id: "toolu_server".into() };
        let shell_events: Vec<_> = events
            .iter()
            .filter(|event| matches!(event, AgentEvent::ShellBackgrounded { .. } | AgentEvent::ShellFinished { .. }))
            .collect();
        assert_eq!(shell_events, vec![&backgrounded, &finished]);
        let position = |wanted: &AgentEvent| events.iter().position(|event| event == wanted);
        assert_eq!(position(&backgrounded).map(|at| at + 1), position(&launched));
        assert_eq!(describe_tool("TaskStop", &json!({"task_id": "bo545qe1c"})).verb, "Stopped");
    }

    #[test]
    fn takes_the_hand_back_report_as_the_summary_without_the_trailer() {
        let content =
            json!([{"type": "text", "text": "[Subagent hand-back] x. The report follows:\n  Done.\nagentId: a1"}]);
        assert_eq!(report_summary(&result_text(&content)), "Done.");
        assert_eq!(clipped("abcdef", 3), "abc…");
    }
}
