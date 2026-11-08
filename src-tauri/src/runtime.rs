use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::branches::ProjectBranches;
use crate::chats::{self, AgentCommand, Chat, ChatState, Provider};
use crate::checkpoints;
use crate::db::{Db, new_id};
use crate::error::{AppError, AppResult};
use crate::process::{self, Launch, SessionFlag};
use crate::protocol::{self, AgentEvent, Capabilities, PermissionRequest, Source, StreamParser};
use crate::subprocess::in_background;
use crate::transcripts;
use crate::workspaces::project;

pub const CHAT_EVENT: &str = "chat-event";
pub const CHAT_UPDATED: &str = "chat-updated";
const IDLE_LIMIT: Duration = Duration::from_secs(10 * 60);
const REAP_INTERVAL: Duration = Duration::from_secs(30);
const DISCOVERY_TIMEOUT: Duration = Duration::from_secs(45);
const EXIT_WAIT: Duration = Duration::from_secs(5);
const EXIT_POLL_INTERVAL: Duration = Duration::from_millis(100);
const STDERR_TAIL_LENGTH: usize = 2000;
const MAX_MESSAGE_LENGTH: usize = 200_000;
const MAX_TITLE_DESCRIPTION_LENGTH: usize = 2_000;
const DENY_MESSAGE: &str = "The user denied this tool use.";
const CODEX_UNSUPPORTED: &str = "Codex support coming next";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatEventPayload<'a> {
    chat_id: &'a str,
    event: &'a AgentEvent,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PermissionDecision {
    Once,
    Always,
    Deny,
}

struct Activity {
    last_seen: Instant,
    is_turn_active: bool,
    was_interrupted: bool,
    is_closing: bool,
    has_requested_title: bool,
    checkpoint_turn: Option<u32>,
}

struct AgentProcess {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    activity: Mutex<Activity>,
    permissions: Mutex<HashMap<String, PermissionRequest>>,
    stderr_tail: Arc<Mutex<String>>,
}

fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl AgentProcess {
    fn write_line(&self, line: &str) -> AppResult<()> {
        let mut stdin = locked(&self.stdin);
        stdin.write_all(line.as_bytes())?;
        stdin.write_all(b"\n")?;
        stdin.flush()?;
        Ok(())
    }

    fn touch(&self) {
        locked(&self.activity).last_seen = Instant::now();
    }

    fn is_idle_for(&self, limit: Duration) -> bool {
        let activity = locked(&self.activity);
        !activity.is_turn_active && activity.last_seen.elapsed() >= limit
    }

    fn take_permission(&self, request_id: &str) -> AppResult<PermissionRequest> {
        locked(&self.permissions).remove(request_id).ok_or(AppError::NotFound("permission request"))
    }
}

#[derive(Default)]
pub struct AgentRuntime {
    processes: Mutex<HashMap<String, Arc<AgentProcess>>>,
    capabilities: Mutex<HashMap<(AgentCommand, String), Capabilities>>,
}

fn emit_event(app: &AppHandle, chat_id: &str, event: &AgentEvent) {
    let _ = app.emit(CHAT_EVENT, ChatEventPayload { chat_id, event });
}

fn change_state(app: &AppHandle, chat_id: &str, state: ChatState) {
    let db = app.state::<Db>();
    let connection = db.connection();
    if chats::update_state(&connection, chat_id, state).is_err() {
        return;
    }
    if let Ok(chat) = chats::chat(&connection, chat_id) {
        let _ = app.emit(CHAT_UPDATED, chat);
    }
}

pub fn rename_chat(app: &AppHandle, chat_id: &str, title: &str) {
    let db = app.state::<Db>();
    let connection = db.connection();
    if !matches!(chats::update_title(&connection, chat_id, title), Ok(true)) {
        return;
    }
    if let Ok(chat) = chats::chat(&connection, chat_id) {
        let _ = app.emit(CHAT_UPDATED, chat);
    }
}

fn forget_branch(app: &AppHandle, chat_id: &str) {
    if let Ok(chat) = chats::chat(&app.state::<Db>().connection(), chat_id) {
        app.state::<ProjectBranches>().forget(&chat.project_id);
    }
}

fn finish_checkpoint(app: &AppHandle, chat_id: &str, turn: Option<u32>) {
    let Some(turn) = turn else { return };
    if let Ok((_, cwd)) = chat_and_cwd(&app.state::<Db>(), chat_id) {
        checkpoints::end_turn(Path::new(&cwd), chat_id, turn);
    }
}

async fn start_checkpoint(chat_id: &str, cwd: &str) -> Option<u32> {
    let (chat_id, cwd) = (chat_id.to_string(), cwd.to_string());
    in_background(move || Ok(checkpoints::begin_turn(Path::new(&cwd), &chat_id))).await.ok().flatten()
}

fn remember_session(app: &AppHandle, chat_id: &str, session_id: &str) {
    let _ = chats::update_session_id(&app.state::<Db>().connection(), chat_id, session_id);
}

fn state_after_turn(activity: &mut Activity, is_error: bool) -> ChatState {
    activity.is_turn_active = false;
    let was_interrupted = std::mem::take(&mut activity.was_interrupted);
    if is_error && !was_interrupted { ChatState::Failed } else { ChatState::Review }
}

fn apply_event(app: &AppHandle, chat_id: &str, process: &AgentProcess, event: &AgentEvent) {
    match event {
        AgentEvent::Session { session_id } => remember_session(app, chat_id, session_id),
        AgentEvent::PermissionRequested { .. } => change_state(app, chat_id, ChatState::Permission),
        AgentEvent::QuestionAsked { .. } => change_state(app, chat_id, ChatState::Question),
        AgentEvent::TitleChanged { title } => rename_chat(app, chat_id, title),
        AgentEvent::PermissionCancelled { request_id } => {
            locked(&process.permissions).remove(request_id);
            change_state(app, chat_id, ChatState::Running);
        }
        AgentEvent::TurnEnded { is_error, .. } => {
            let (state, turn) = {
                let mut activity = locked(&process.activity);
                let turn = activity.checkpoint_turn.take();
                (state_after_turn(&mut activity, *is_error), turn)
            };
            finish_checkpoint(app, chat_id, turn);
            forget_branch(app, chat_id);
            change_state(app, chat_id, state);
        }
        _ => {}
    }
}

fn read_lines(stream: impl Read, mut on_line: impl FnMut(&str)) {
    let mut reader = BufReader::new(stream);
    let mut buffer = Vec::new();
    while matches!(reader.read_until(b'\n', &mut buffer), Ok(read) if read > 0) {
        on_line(String::from_utf8_lossy(&buffer).trim_end());
        buffer.clear();
    }
}

fn collect_stderr(stderr: impl Read + Send + 'static, tail: Arc<Mutex<String>>) {
    thread::spawn(move || {
        read_lines(stderr, |line| {
            let mut tail = locked(&tail);
            tail.push_str(line);
            tail.push('\n');
            if tail.len() > STDERR_TAIL_LENGTH {
                let cut = tail.len() - STDERR_TAIL_LENGTH;
                let boundary = (cut..tail.len()).find(|index| tail.is_char_boundary(*index)).unwrap_or(0);
                tail.drain(..boundary);
            }
        });
    });
}

fn exit_message(process: &AgentProcess) -> String {
    let tail = locked(&process.stderr_tail).trim().to_string();
    if tail.is_empty() { "The agent process exited unexpectedly.".to_string() } else { tail }
}

fn wait_for_exit(process: &AgentProcess) {
    let deadline = Instant::now() + EXIT_WAIT;
    while Instant::now() < deadline {
        if !matches!(locked(&process.child).try_wait(), Ok(None)) {
            return;
        }
        thread::sleep(EXIT_POLL_INTERVAL);
    }
}

fn pump_stdout(app: AppHandle, chat_id: String, process: Arc<AgentProcess>, stdout: ChildStdout) {
    thread::spawn(move || {
        let mut parser = StreamParser::new(Source::Live);
        read_lines(stdout, |line| {
            process.touch();
            let events = parser.parse_line(line);
            for request in parser.take_permission_requests() {
                locked(&process.permissions).insert(request.request_id.clone(), request);
            }
            for event in &events {
                apply_event(&app, &chat_id, &process, event);
                emit_event(&app, &chat_id, event);
            }
        });
        wait_for_exit(&process);
        app.state::<AgentRuntime>().forget(&chat_id, &process);
        let activity = locked(&process.activity);
        if activity.is_turn_active && !activity.is_closing {
            emit_event(&app, &chat_id, &AgentEvent::ProcessExited { message: exit_message(&process) });
            change_state(&app, &chat_id, ChatState::Failed);
        }
    });
}

fn session_flag(chat: &Chat) -> SessionFlag {
    if transcripts::find(&chat.session_id).is_some() {
        return SessionFlag::Resume(chat.session_id.clone());
    }
    SessionFlag::Start(chat.session_id.clone())
}

fn spawn_process(launch: &Launch<'_>) -> AppResult<(Arc<AgentProcess>, ChildStdout)> {
    let mut child = process::spawn(launch)?;
    let stdin = child.stdin.take().ok_or(AppError::NotFound("agent stdin"))?;
    let stdout = child.stdout.take().ok_or(AppError::NotFound("agent stdout"))?;
    let stderr = child.stderr.take().ok_or(AppError::NotFound("agent stderr"))?;
    let stderr_tail = Arc::new(Mutex::new(String::new()));
    collect_stderr(stderr, stderr_tail.clone());
    let process = Arc::new(AgentProcess {
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        activity: Mutex::new(Activity {
            last_seen: Instant::now(),
            is_turn_active: false,
            was_interrupted: false,
            is_closing: false,
            has_requested_title: false,
            checkpoint_turn: None,
        }),
        permissions: Mutex::new(HashMap::new()),
        stderr_tail,
    });
    process.write_line(&protocol::initialize_request(&new_id()))?;
    Ok((process, stdout))
}

fn close_processes(processes: Vec<Arc<AgentProcess>>) {
    for process in &processes {
        locked(&process.activity).is_closing = true;
    }
    let mut children: Vec<_> = processes.iter().map(|process| locked(&process.child)).collect();
    let mut handles: Vec<&mut Child> = children.iter_mut().map(|child| &mut **child).collect();
    process::terminate_all(&mut handles);
}

fn discover(command: AgentCommand, cwd: &Path) -> AppResult<Capabilities> {
    let launch = Launch { command, model: "", effort: "", session: SessionFlag::Discover, cwd };
    let (process, stdout) = spawn_process(&launch)?;
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let mut parser = StreamParser::new(Source::Live);
        read_lines(stdout, |line| {
            for event in parser.parse_line(line) {
                if let AgentEvent::Initialized { capabilities } = event {
                    let _ = sender.send(capabilities);
                }
            }
        });
    });
    let outcome = receiver.recv_timeout(DISCOVERY_TIMEOUT);
    close_processes(vec![process.clone()]);
    outcome.map_err(|_| {
        AppError::Agent(format!("{} did not answer the handshake: {}", command.as_str(), exit_message(&process)))
    })
}

impl AgentRuntime {
    fn process(&self, chat_id: &str) -> Option<Arc<AgentProcess>> {
        locked(&self.processes).get(chat_id).cloned()
    }

    fn running_process(&self, chat_id: &str) -> AppResult<Arc<AgentProcess>> {
        self.process(chat_id).ok_or(AppError::NotFound("running agent"))
    }

    fn forget(&self, chat_id: &str, process: &Arc<AgentProcess>) {
        let mut processes = locked(&self.processes);
        if processes.get(chat_id).is_some_and(|current| Arc::ptr_eq(current, process)) {
            processes.remove(chat_id);
        }
    }

    fn process_for(&self, app: &AppHandle, chat: &Chat, cwd: &Path) -> AppResult<Arc<AgentProcess>> {
        if let Some(existing) = self.process(&chat.id) {
            return Ok(existing);
        }
        let launch = Launch {
            command: chat.command,
            model: &chat.model,
            effort: &chat.effort,
            session: session_flag(chat),
            cwd,
        };
        let (process, stdout) = spawn_process(&launch)?;
        locked(&self.processes).insert(chat.id.clone(), process.clone());
        pump_stdout(app.clone(), chat.id.clone(), process.clone(), stdout);
        Ok(process)
    }

    fn reap_idle(&self) {
        let idle: Vec<_> = {
            let mut processes = locked(&self.processes);
            let idle_ids: Vec<String> = processes
                .iter()
                .filter(|(_, process)| process.is_idle_for(IDLE_LIMIT))
                .map(|(chat_id, _)| chat_id.clone())
                .collect();
            idle_ids.iter().filter_map(|chat_id| processes.remove(chat_id)).collect()
        };
        if !idle.is_empty() {
            close_processes(idle);
        }
    }

    pub fn shutdown(&self) {
        let all: Vec<_> = locked(&self.processes).drain().map(|(_, process)| process).collect();
        close_processes(all);
    }

    pub fn start_reaper(app: AppHandle) {
        thread::spawn(move || {
            loop {
                thread::sleep(REAP_INTERVAL);
                app.state::<AgentRuntime>().reap_idle();
            }
        });
    }
}

fn chat_and_cwd(db: &Db, chat_id: &str) -> AppResult<(Chat, String)> {
    let connection = db.connection();
    let chat = chats::chat(&connection, chat_id)?;
    let cwd = chats::chat_root(&connection, &chat)?.to_string_lossy().into_owned();
    Ok((chat, cwd))
}

fn resume_running(app: &AppHandle, chat_id: &str) {
    change_state(app, chat_id, ChatState::Running);
}

#[tauri::command]
pub async fn send_message(
    app: AppHandle,
    db: State<'_, Db>,
    runtime: State<'_, AgentRuntime>,
    chat_id: String,
    text: String,
) -> AppResult<()> {
    if text.trim().is_empty() || text.len() > MAX_MESSAGE_LENGTH {
        return Err(AppError::Invalid("message must be non-empty and under 200 KB".into()));
    }
    let (chat, cwd) = chat_and_cwd(&db, &chat_id)?;
    if chat.provider == Provider::Codex {
        return Err(AppError::Agent(CODEX_UNSUPPORTED.into()));
    }
    let process = runtime.process_for(&app, &chat, Path::new(&cwd))?;
    let (is_first_message, is_new_turn) = {
        let mut activity = locked(&process.activity);
        let is_new_turn = !std::mem::replace(&mut activity.is_turn_active, true);
        activity.last_seen = Instant::now();
        (!std::mem::replace(&mut activity.has_requested_title, true), is_new_turn)
    };
    if is_new_turn {
        let turn = start_checkpoint(&chat_id, &cwd).await;
        locked(&process.activity).checkpoint_turn = turn;
    }
    process.write_line(&protocol::user_message(&text))?;
    if is_first_message {
        let description: String = text.chars().take(MAX_TITLE_DESCRIPTION_LENGTH).collect();
        process.write_line(&protocol::title_request(&new_id(), &description))?;
    }
    resume_running(&app, &chat_id);
    Ok(())
}

#[tauri::command]
pub fn interrupt_chat(runtime: State<'_, AgentRuntime>, chat_id: String) -> AppResult<()> {
    let process = runtime.running_process(&chat_id)?;
    locked(&process.activity).was_interrupted = true;
    locked(&process.permissions).clear();
    process.write_line(&protocol::interrupt_request(&new_id()))
}

#[tauri::command]
pub fn answer_permission(
    app: AppHandle,
    runtime: State<'_, AgentRuntime>,
    chat_id: String,
    request_id: String,
    decision: PermissionDecision,
) -> AppResult<()> {
    let process = runtime.running_process(&chat_id)?;
    let request = process.take_permission(&request_id)?;
    let reply = match decision {
        PermissionDecision::Once => protocol::allow_once(&request),
        PermissionDecision::Always => protocol::allow_for_session(&request),
        PermissionDecision::Deny => protocol::deny(&request, DENY_MESSAGE),
    };
    process.write_line(&reply)?;
    resume_running(&app, &chat_id);
    Ok(())
}

#[tauri::command]
pub fn answer_question(
    app: AppHandle,
    runtime: State<'_, AgentRuntime>,
    chat_id: String,
    request_id: String,
    answers: HashMap<String, String>,
) -> AppResult<()> {
    let process = runtime.running_process(&chat_id)?;
    let request = process.take_permission(&request_id)?;
    process.write_line(&protocol::answer_questions(&request, &answers))?;
    resume_running(&app, &chat_id);
    Ok(())
}

#[tauri::command]
pub async fn discover_capabilities(
    db: State<'_, Db>,
    runtime: State<'_, AgentRuntime>,
    command: AgentCommand,
    project_id: String,
) -> AppResult<Capabilities> {
    if command == AgentCommand::Codex {
        return Err(AppError::Agent(CODEX_UNSUPPORTED.into()));
    }
    let cwd = project(&db.connection(), &project_id)?.path;
    let key = (command, cwd.clone());
    if let Some(cached) = locked(&runtime.capabilities).get(&key) {
        return Ok(cached.clone());
    }
    let capabilities = tauri::async_runtime::spawn_blocking(move || discover(command, Path::new(&cwd)))
        .await
        .map_err(|error| AppError::Agent(error.to_string()))??;
    if capabilities.account.is_logged_in() {
        locked(&runtime.capabilities).insert(key, capabilities.clone());
    }
    Ok(capabilities)
}

#[cfg(test)]
mod live_tests {
    use super::*;

    const MODEL: &str = "haiku";
    const TURN_TIMEOUT: Duration = Duration::from_secs(120);

    struct LiveChat {
        process: Arc<AgentProcess>,
        events: mpsc::Receiver<(AgentEvent, Vec<PermissionRequest>)>,
    }

    fn scratch_dir() -> std::path::PathBuf {
        let root = std::env::var("ONYX_LIVE_DIR").unwrap_or_else(|_| std::env::temp_dir().display().to_string());
        let dir = Path::new(&root).join(format!("live-{}", new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn start(command: AgentCommand, session: SessionFlag, cwd: &Path) -> LiveChat {
        let launch = Launch { command, model: MODEL, effort: "", session, cwd };
        let (process, stdout) = spawn_process(&launch).unwrap();
        let (sender, events) = mpsc::channel();
        thread::spawn(move || {
            let mut parser = StreamParser::new(Source::Live);
            read_lines(stdout, |line| {
                for event in parser.parse_line(line) {
                    let _ = sender.send((event, parser.take_permission_requests()));
                }
            });
        });
        LiveChat { process, events }
    }

    fn run_turn(
        chat: &LiveChat,
        text: &str,
        mut on_permission: impl FnMut(&PermissionRequest) -> String,
    ) -> Vec<AgentEvent> {
        chat.process.write_line(&protocol::user_message(text)).unwrap();
        let mut seen = Vec::new();
        let deadline = Instant::now() + TURN_TIMEOUT;
        while Instant::now() < deadline {
            let Ok((event, requests)) = chat.events.recv_timeout(TURN_TIMEOUT) else { break };
            eprintln!("event: {}", serde_json::to_string(&event).unwrap());
            for request in &requests {
                chat.process.write_line(&on_permission(request)).unwrap();
            }
            let is_end = matches!(event, AgentEvent::TurnEnded { .. });
            seen.push(event);
            if is_end {
                break;
            }
        }
        seen
    }

    fn streamed_text(events: &[AgentEvent]) -> String {
        events
            .iter()
            .filter_map(|event| match event {
                AgentEvent::TextDelta { text, .. } => Some(text.as_str()),
                _ => None,
            })
            .collect()
    }

    #[test]
    #[ignore = "spawns real claude processes"]
    fn live_handshake_reports_a_subscription_account() {
        for command in [AgentCommand::Claude, AgentCommand::ClaudeLyxaTeam] {
            let capabilities = discover(command, &scratch_dir()).unwrap();
            eprintln!("{} account: {:?}", command.as_str(), capabilities.account);
            eprintln!(
                "{} models: {:?}",
                command.as_str(),
                capabilities.models.iter().map(|m| &m.value).collect::<Vec<_>>()
            );
            assert!(capabilities.account.subscription_type.is_some());
        }
    }

    #[test]
    #[ignore = "spawns real claude processes"]
    fn live_reply_streams_then_resumes_by_session_id() {
        let cwd = scratch_dir();
        let session_id = new_id();
        let chat = start(AgentCommand::Claude, SessionFlag::Start(session_id.clone()), &cwd);
        let events = run_turn(&chat, "Reply with the word ok and nothing else.", |_| unreachable!());
        assert!(streamed_text(&events).to_lowercase().contains("ok"), "{events:?}");
        assert!(events.contains(&AgentEvent::Session { session_id: session_id.clone() }));
        close_processes(vec![chat.process]);
        assert!(transcripts::find(&session_id).is_some());
        let resumed = start(AgentCommand::Claude, SessionFlag::Resume(session_id.clone()), &cwd);
        let events =
            run_turn(&resumed, "Which single word did you reply with before? Answer with just it.", |_| unreachable!());
        assert!(streamed_text(&events).to_lowercase().contains("ok"), "{events:?}");
        close_processes(vec![resumed.process]);
    }

    #[test]
    #[ignore = "spawns real claude processes"]
    fn live_permission_round_trip_runs_the_allowed_command() {
        let cwd = scratch_dir();
        let chat = start(AgentCommand::Claude, SessionFlag::Start(new_id()), &cwd);
        let mut asked = 0;
        let events =
            run_turn(&chat, "Use the Bash tool to run exactly: echo hi > f.txt . Then reply done.", |request| {
                asked += 1;
                protocol::allow_once(request)
            });
        close_processes(vec![chat.process]);
        assert!(asked >= 1, "{events:?}");
        assert!(events.iter().any(|event| matches!(event, AgentEvent::ToolFinished { is_error: false, .. })));
        assert_eq!(std::fs::read_to_string(cwd.join("f.txt")).unwrap().trim(), "hi");
    }

    #[test]
    #[ignore = "spawns real claude processes"]
    fn live_interrupt_ends_the_turn() {
        let cwd = scratch_dir();
        let chat = start(AgentCommand::Claude, SessionFlag::Start(new_id()), &cwd);
        chat.process.write_line(&protocol::user_message("Count from 1 to 300, one number per line.")).unwrap();
        let mut seen = Vec::new();
        while let Ok((event, _)) = chat.events.recv_timeout(TURN_TIMEOUT) {
            eprintln!("event: {}", serde_json::to_string(&event).unwrap());
            if matches!(event, AgentEvent::TextDelta { .. })
                && !seen.iter().any(|e| matches!(e, AgentEvent::TextDelta { .. }))
            {
                chat.process.write_line(&protocol::interrupt_request(&new_id())).unwrap();
            }
            let is_end = matches!(event, AgentEvent::TurnEnded { .. });
            seen.push(event);
            if is_end {
                break;
            }
        }
        let after = run_turn(&chat, "Reply with the word ok and nothing else.", |_| unreachable!());
        close_processes(vec![chat.process]);
        assert!(seen.iter().any(|event| matches!(event, AgentEvent::TurnEnded { .. })));
        assert!(streamed_text(&after).to_lowercase().contains("ok"));
    }
}
