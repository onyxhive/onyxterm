use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

const ASK_USER_QUESTION: &str = "AskUserQuestion";
const DETAIL_LENGTH: usize = 160;
const SESSION_DESTINATION: &str = "session";
const TITLE_FIELD: &str = "title";

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
    pub file_path: Option<String>,
    pub added: usize,
    pub removed: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum AgentEvent {
    Session { session_id: String },
    UserText { text: String },
    TextDelta { message_id: String, index: u32, text: String },
    Text { message_id: String, text: String },
    ToolStarted { tool_use_id: String, parent_tool_use_id: Option<String>, summary: ToolSummary },
    ToolFinished { tool_use_id: String, is_error: bool },
    PermissionRequested { request_id: String, tool_use_id: Option<String>, summary: ToolSummary, reason: String },
    QuestionAsked { request_id: String, questions: Vec<Question> },
    PermissionCancelled { request_id: String },
    TurnEnded { is_error: bool, cost_usd: Option<f64>, message: Option<String> },
    Initialized { capabilities: Capabilities },
    TitleChanged { title: String },
    ProcessExited { message: String },
}

#[derive(Debug, Clone, PartialEq)]
pub struct PermissionRequest {
    pub request_id: String,
    pub tool_use_id: Option<String>,
    pub input: Value,
    pub suggestions: Vec<Value>,
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
    #[serde(other)]
    Other,
}

#[derive(Debug, Deserialize)]
struct SystemLine {
    #[serde(default)]
    subtype: String,
    session_id: Option<String>,
    title: Option<String>,
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
    },
    #[serde(other)]
    Other,
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
    response: Option<Value>,
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

pub struct StreamParser {
    source: Source,
    current_message_id: Option<String>,
    pending_permissions: Vec<PermissionRequest>,
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

fn text_field<'a>(input: &'a Value, key: &str) -> &'a str {
    input.get(key).and_then(Value::as_str).unwrap_or_default()
}

fn line_count(text: &str) -> usize {
    if text.is_empty() { 0 } else { text.lines().count() }
}

fn file_name(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path).to_string()
}

fn file_summary(verb: &str, path: &str, added: usize, removed: usize) -> ToolSummary {
    ToolSummary { verb: verb.into(), detail: file_name(path), file_path: Some(path.to_string()), added, removed }
}

fn plain_summary(verb: &str, detail: &str) -> ToolSummary {
    ToolSummary { verb: verb.into(), detail: truncated(detail), ..ToolSummary::default() }
}

fn multi_edit_lines(input: &Value) -> (usize, usize) {
    let edits = input.get("edits").and_then(Value::as_array).cloned().unwrap_or_default();
    edits.iter().fold((0, 0), |(added, removed), edit| {
        (added + line_count(text_field(edit, "new_string")), removed + line_count(text_field(edit, "old_string")))
    })
}

fn mcp_summary(name: &str) -> ToolSummary {
    let mut parts = name.trim_start_matches("mcp__").splitn(2, "__");
    let server = parts.next().unwrap_or_default();
    let tool = parts.next().unwrap_or_default();
    plain_summary("Used", &format!("{server} {tool}"))
}

pub fn describe_tool(name: &str, input: &Value) -> ToolSummary {
    match name {
        "Bash" => plain_summary("Ran", text_field(input, "command")),
        "Read" => file_summary("Read", text_field(input, "file_path"), 0, 0),
        "Edit" => file_summary(
            "Edited",
            text_field(input, "file_path"),
            line_count(text_field(input, "new_string")),
            line_count(text_field(input, "old_string")),
        ),
        "MultiEdit" => {
            let (added, removed) = multi_edit_lines(input);
            file_summary("Edited", text_field(input, "file_path"), added, removed)
        }
        "Write" => file_summary("Wrote", text_field(input, "file_path"), line_count(text_field(input, "content")), 0),
        "NotebookEdit" => file_summary("Edited", text_field(input, "notebook_path"), 0, 0),
        "Grep" => plain_summary("Searched", text_field(input, "pattern")),
        "Glob" => plain_summary("Listed", text_field(input, "pattern")),
        "Task" | "Agent" => plain_summary("Started", &format!("subagent {}", text_field(input, "subagent_type"))),
        "WebFetch" => plain_summary("Fetched", text_field(input, "url")),
        "WebSearch" => plain_summary("Searched the web for", text_field(input, "query")),
        "TodoWrite" => plain_summary("Updated", "the todo list"),
        ASK_USER_QUESTION => plain_summary("Asked", "you a question"),
        mcp if mcp.starts_with("mcp__") => mcp_summary(mcp),
        other => plain_summary("Used", other),
    }
}

fn questions_of(input: &Value) -> Vec<Question> {
    input.get("questions").cloned().and_then(|questions| serde_json::from_value(questions).ok()).unwrap_or_default()
}

impl StreamParser {
    pub fn new(source: Source) -> Self {
        StreamParser { source, current_message_id: None, pending_permissions: Vec::new() }
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
            Incoming::System(system) => Self::system_events(system),
            Incoming::StreamEvent(stream) => self.stream_events(stream),
            Incoming::Assistant(assistant) => Self::assistant_events(assistant),
            Incoming::User(user) => self.user_events(user),
            Incoming::Result(result) => vec![Self::turn_end(result)],
            Incoming::ControlRequest(request) => self.control_request_events(request),
            Incoming::ControlResponse(response) => Self::control_response_events(response),
            Incoming::ControlCancelRequest(cancel) => {
                vec![AgentEvent::PermissionCancelled { request_id: cancel.request_id }]
            }
            Incoming::Other => Vec::new(),
        }
    }

    fn system_events(system: SystemLine) -> Vec<AgentEvent> {
        match (system.subtype.as_str(), system.session_id, system.title) {
            ("init", Some(session_id), _) => vec![AgentEvent::Session { session_id }],
            ("session_title_changed", _, Some(title)) => vec![AgentEvent::TitleChanged { title }],
            _ => Vec::new(),
        }
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

    fn assistant_events(assistant: AssistantLine) -> Vec<AgentEvent> {
        let parent = assistant.parent_tool_use_id;
        let is_nested = parent.is_some() || assistant.is_sidechain;
        let message_id = assistant.message.id;
        assistant
            .message
            .content
            .into_iter()
            .filter_map(|block| match block {
                ContentBlock::Text { text } if !is_nested => {
                    Some(AgentEvent::Text { message_id: message_id.clone(), text })
                }
                ContentBlock::ToolUse { id, name, input } => Some(AgentEvent::ToolStarted {
                    tool_use_id: id,
                    parent_tool_use_id: parent.clone(),
                    summary: describe_tool(&name, &input),
                }),
                _ => None,
            })
            .collect()
    }

    fn user_events(&self, user: UserLine) -> Vec<AgentEvent> {
        let shows_text = self.source == Source::Transcript
            && user.parent_tool_use_id.is_none()
            && !user.is_meta
            && !user.is_sidechain;
        match user.message.content {
            UserContent::Text(text) if shows_text => vec![AgentEvent::UserText { text }],
            UserContent::Text(_) => Vec::new(),
            UserContent::Blocks(blocks) => blocks
                .into_iter()
                .filter_map(|block| match block {
                    ContentBlock::ToolResult { tool_use_id, is_error } => {
                        Some(AgentEvent::ToolFinished { tool_use_id, is_error: is_error.unwrap_or(false) })
                    }
                    ContentBlock::Text { text } if shows_text => Some(AgentEvent::UserText { text }),
                    _ => None,
                })
                .collect(),
        }
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
        } = request.request
        else {
            return Vec::new();
        };
        let event = if tool_name == ASK_USER_QUESTION {
            AgentEvent::QuestionAsked { request_id: request.request_id.clone(), questions: questions_of(&input) }
        } else {
            AgentEvent::PermissionRequested {
                request_id: request.request_id.clone(),
                tool_use_id: tool_use_id.clone(),
                summary: describe_tool(&tool_name, &input),
                reason: description.or(decision_reason).unwrap_or_default(),
            }
        };
        self.pending_permissions.push(PermissionRequest {
            request_id: request.request_id,
            tool_use_id,
            input,
            suggestions: permission_suggestions,
        });
        vec![event]
    }

    fn control_response_events(response: ControlResponseLine) -> Vec<AgentEvent> {
        let Some(payload) = response.response.response else {
            return Vec::new();
        };
        if let Some(title) = payload.get(TITLE_FIELD).and_then(Value::as_str) {
            return vec![AgentEvent::TitleChanged { title: title.to_string() }];
        }
        serde_json::from_value::<Capabilities>(payload)
            .map(|capabilities| vec![AgentEvent::Initialized { capabilities }])
            .unwrap_or_default()
    }
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

pub fn interrupt_request(request_id: &str) -> String {
    json!({"type": "control_request", "request_id": request_id, "request": {"subtype": "interrupt"}}).to_string()
}

pub fn user_message(text: &str) -> String {
    json!({"type": "user", "message": {"role": "user", "content": [{"type": "text", "text": text}]}}).to_string()
}

fn control_success(request_id: &str, response: Value) -> String {
    json!({"type": "control_response", "response": {"subtype": "success", "request_id": request_id, "response": response}})
        .to_string()
}

fn session_scoped(suggestions: &[Value]) -> Vec<Value> {
    suggestions
        .iter()
        .cloned()
        .map(|mut suggestion| {
            if let Some(fields) = suggestion.as_object_mut() {
                fields.insert("destination".into(), Value::from(SESSION_DESTINATION));
            }
            suggestion
        })
        .collect()
}

pub fn allow_once(request: &PermissionRequest) -> String {
    control_success(
        &request.request_id,
        json!({"behavior": "allow", "updatedInput": request.input, "toolUseID": request.tool_use_id}),
    )
}

pub fn allow_for_session(request: &PermissionRequest) -> String {
    control_success(
        &request.request_id,
        json!({
            "behavior": "allow",
            "updatedInput": request.input,
            "toolUseID": request.tool_use_id,
            "updatedPermissions": session_scoped(&request.suggestions),
        }),
    )
}

pub fn deny(request: &PermissionRequest, message: &str) -> String {
    control_success(&request.request_id, json!({"behavior": "deny", "message": message}))
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
        assert!(transcript.contains(&AgentEvent::UserText { text: "Now just say bye.".into() }));
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
        let reply: Value = serde_json::from_str(&allow_for_session(&permissions[0])).unwrap();
        let body = &reply["response"]["response"];
        assert_eq!(body["behavior"], "allow");
        assert_eq!(body["updatedInput"]["command"], "echo hi > f.txt");
        let destinations: Vec<_> =
            body["updatedPermissions"].as_array().unwrap().iter().map(|rule| &rule["destination"]).collect();
        assert!(destinations.iter().all(|destination| *destination == "session"));
        let denied: Value = serde_json::from_str(&deny(&permissions[0], "no")).unwrap();
        assert_eq!(denied["response"]["response"]["behavior"], "deny");
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
    fn asks_claude_to_generate_and_persist_a_title() {
        let request: Value = serde_json::from_str(&title_request("t1", "fix the sort")).unwrap();
        assert_eq!(request["request"]["subtype"], "generate_session_title");
        assert_eq!(request["request"]["description"], "fix the sort");
        assert_eq!(request["request"]["persist"], true);
    }

    #[test]
    fn summarises_file_edits_with_line_counts() {
        let input = json!({"file_path": "/repo/src/nearby.rs", "old_string": "a\nb", "new_string": "a\nb\nc"});
        let summary = describe_tool("Edit", &input);
        assert_eq!((summary.verb.as_str(), summary.detail.as_str()), ("Edited", "nearby.rs"));
        assert_eq!((summary.added, summary.removed), (3, 2));
        assert_eq!(describe_tool("mcp__github__create_pr", &json!({})).detail, "github create_pr");
    }
}
