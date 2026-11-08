use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::db::{Db, new_id};
use crate::error::{AppError, AppResult};
use crate::git::{GitTarget, validated_id, workdir};
use crate::process::{STRIPPED_ENV, login_shell};
use crate::subprocess::signal_group;

pub const TERMINAL_OUTPUT: &str = "terminal-output";
pub const TERMINAL_EXITED: &str = "terminal-exited";
const AGENT_SESSION_PREFIX: &str = "CLAUDE_CODE_";
const TERMINAL_TYPE: &str = "xterm-256color";
const BATCH_WINDOW: Duration = Duration::from_millis(16);
const READ_CHUNK_BYTES: usize = 16 * 1024;
const MAX_WRITE_BYTES: usize = 64 * 1024;
const MAX_DIMENSION: u16 = 1000;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutput {
    pub terminal_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExited {
    pub terminal_id: String,
    pub code: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TerminalEvent {
    Output(TerminalOutput),
    Exited(TerminalExited),
}

type Sink = Arc<dyn Fn(TerminalEvent) + Send + Sync>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GridSize {
    pub cols: u16,
    pub rows: u16,
}

pub struct TerminalLaunch {
    pub program: String,
    pub arguments: Vec<String>,
    pub cwd: PathBuf,
    pub size: GridSize,
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    process_group: Option<u32>,
}

impl Session {
    fn terminate(mut self) {
        if let Some(process_group) = self.process_group {
            signal_group(process_group, "-KILL");
        }
        let _ = self.killer.kill();
    }
}

#[derive(Default, Clone)]
pub struct Terminals(Arc<Mutex<HashMap<String, Session>>>);

fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn terminal_error(error: impl std::fmt::Display) -> AppError {
    AppError::Terminal(error.to_string())
}

fn validated_size(cols: u16, rows: u16) -> AppResult<GridSize> {
    let is_valid = (1..=MAX_DIMENSION).contains(&cols) && (1..=MAX_DIMENSION).contains(&rows);
    if !is_valid {
        return Err(AppError::Invalid(format!("terminal size must be 1 to {MAX_DIMENSION} columns and rows")));
    }
    Ok(GridSize { cols, rows })
}

fn pty_size(size: GridSize) -> PtySize {
    PtySize { rows: size.rows, cols: size.cols, pixel_width: 0, pixel_height: 0 }
}

fn is_agent_session_variable(name: &str) -> bool {
    STRIPPED_ENV.contains(&name) || name.starts_with(AGENT_SESSION_PREFIX)
}

fn command_for(launch: &TerminalLaunch) -> CommandBuilder {
    let mut command = CommandBuilder::new(&launch.program);
    command.args(&launch.arguments);
    command.cwd(&launch.cwd);
    for (name, _) in std::env::vars_os() {
        if is_agent_session_variable(&name.to_string_lossy()) {
            command.env_remove(name);
        }
    }
    command.env("TERM", TERMINAL_TYPE);
    command
}

pub fn complete_utf8_length(bytes: &[u8]) -> usize {
    let tail_start = bytes.len().saturating_sub(3);
    for start in (tail_start..bytes.len()).rev() {
        let lead = bytes[start];
        if lead & 0b1100_0000 == 0b1000_0000 {
            continue;
        }
        let needed = match lead {
            0xF0.. => 4,
            0xE0.. => 3,
            0xC0.. => 2,
            _ => 1,
        };
        return if bytes.len() - start < needed { start } else { bytes.len() };
    }
    bytes.len()
}

fn read_chunks(mut reader: Box<dyn Read + Send>) -> Receiver<Vec<u8>> {
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let mut buffer = vec![0; READ_CHUNK_BYTES];
        while let Ok(read) = reader.read(&mut buffer) {
            if read == 0 || sender.send(buffer[..read].to_vec()).is_err() {
                break;
            }
        }
    });
    receiver
}

fn collect_batch(chunks: &Receiver<Vec<u8>>, pending: &mut Vec<u8>) -> bool {
    let Ok(first) = chunks.recv() else { return false };
    pending.extend(first);
    let deadline = Instant::now() + BATCH_WINDOW;
    loop {
        match chunks.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
            Ok(more) => pending.extend(more),
            Err(RecvTimeoutError::Timeout) => return true,
            Err(RecvTimeoutError::Disconnected) => return false,
        }
    }
}

fn emit_output(sink: &Sink, terminal_id: &str, bytes: &[u8]) {
    if bytes.is_empty() {
        return;
    }
    let data = String::from_utf8_lossy(bytes).into_owned();
    sink(TerminalEvent::Output(TerminalOutput { terminal_id: terminal_id.to_string(), data }));
}

fn stream_output(chunks: Receiver<Vec<u8>>, terminal_id: &str, sink: &Sink) {
    let mut pending = Vec::new();
    loop {
        let is_open = collect_batch(&chunks, &mut pending);
        let complete = if is_open { complete_utf8_length(&pending) } else { pending.len() };
        emit_output(sink, terminal_id, &pending[..complete]);
        pending.drain(..complete);
        if !is_open {
            return;
        }
    }
}

impl Terminals {
    pub fn open(&self, launch: TerminalLaunch, sink: Sink) -> AppResult<String> {
        let pair = native_pty_system().openpty(pty_size(launch.size)).map_err(terminal_error)?;
        let mut child = pair.slave.spawn_command(command_for(&launch)).map_err(terminal_error)?;
        drop(pair.slave);
        let reader = pair.master.try_clone_reader().map_err(terminal_error)?;
        let writer = pair.master.take_writer().map_err(terminal_error)?;
        let terminal_id = new_id();
        let session =
            Session { master: pair.master, writer, killer: child.clone_killer(), process_group: child.process_id() };
        locked(&self.0).insert(terminal_id.clone(), session);
        let (terminals, id) = (self.clone(), terminal_id.clone());
        thread::spawn(move || {
            stream_output(read_chunks(reader), &id, &sink);
            let code = child.wait().ok().map(|status| status.exit_code());
            locked(&terminals.0).remove(&id);
            sink(TerminalEvent::Exited(TerminalExited { terminal_id: id, code }));
        });
        Ok(terminal_id)
    }

    pub fn write(&self, terminal_id: &str, data: &str) -> AppResult<()> {
        if data.len() > MAX_WRITE_BYTES {
            return Err(AppError::Invalid(format!("terminal input is capped at {MAX_WRITE_BYTES} bytes")));
        }
        let mut sessions = locked(&self.0);
        let session = sessions.get_mut(terminal_id).ok_or(AppError::NotFound("terminal"))?;
        session.writer.write_all(data.as_bytes())?;
        session.writer.flush()?;
        Ok(())
    }

    pub fn resize(&self, terminal_id: &str, size: GridSize) -> AppResult<()> {
        let sessions = locked(&self.0);
        let session = sessions.get(terminal_id).ok_or(AppError::NotFound("terminal"))?;
        session.master.resize(pty_size(size)).map_err(terminal_error)
    }

    pub fn close(&self, terminal_id: &str) -> AppResult<()> {
        let session = locked(&self.0).remove(terminal_id).ok_or(AppError::NotFound("terminal"))?;
        session.terminate();
        Ok(())
    }

    pub fn close_all(&self) {
        let sessions: Vec<Session> = locked(&self.0).drain().map(|(_, session)| session).collect();
        sessions.into_iter().for_each(Session::terminate);
    }
}

fn emit_to(app: AppHandle) -> Sink {
    Arc::new(move |event| {
        let _ = match event {
            TerminalEvent::Output(output) => app.emit(TERMINAL_OUTPUT, output),
            TerminalEvent::Exited(exited) => app.emit(TERMINAL_EXITED, exited),
        };
    })
}

#[tauri::command]
pub fn terminal_open(
    app: AppHandle,
    db: State<'_, Db>,
    terminals: State<'_, Terminals>,
    target: GitTarget,
    cols: u16,
    rows: u16,
) -> AppResult<String> {
    let launch = TerminalLaunch {
        program: login_shell(),
        arguments: vec!["-l".into()],
        cwd: workdir(&db, &target)?.root,
        size: validated_size(cols, rows)?,
    };
    terminals.open(launch, emit_to(app))
}

#[tauri::command]
pub fn terminal_write(terminals: State<'_, Terminals>, terminal_id: String, data: String) -> AppResult<()> {
    validated_id(&terminal_id, "terminal")?;
    terminals.write(&terminal_id, &data)
}

#[tauri::command]
pub fn terminal_resize(terminals: State<'_, Terminals>, terminal_id: String, cols: u16, rows: u16) -> AppResult<()> {
    validated_id(&terminal_id, "terminal")?;
    terminals.resize(&terminal_id, validated_size(cols, rows)?)
}

#[tauri::command]
pub fn terminal_close(terminals: State<'_, Terminals>, terminal_id: String) -> AppResult<()> {
    validated_id(&terminal_id, "terminal")?;
    terminals.close(&terminal_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const WAIT: Duration = Duration::from_secs(10);
    const SIZE: GridSize = GridSize { cols: 80, rows: 24 };

    fn collecting() -> (Sink, Receiver<TerminalEvent>) {
        let (sender, receiver) = mpsc::channel();
        let sender = Mutex::new(sender);
        (Arc::new(move |event| drop(locked(&sender).send(event))), receiver)
    }

    fn cat_launch() -> TerminalLaunch {
        TerminalLaunch {
            program: "/bin/sh".into(),
            arguments: vec!["-c".into(), "cat".into()],
            cwd: std::env::temp_dir(),
            size: SIZE,
        }
    }

    fn output_until(receiver: &Receiver<TerminalEvent>, expected: &str) -> String {
        let mut seen = String::new();
        let deadline = Instant::now() + WAIT;
        while !seen.contains(expected) && Instant::now() < deadline {
            if let Ok(TerminalEvent::Output(output)) = receiver.recv_timeout(WAIT) {
                seen.push_str(&output.data);
            }
        }
        seen
    }

    fn exit_of(receiver: &Receiver<TerminalEvent>) -> Option<TerminalExited> {
        let deadline = Instant::now() + WAIT;
        while Instant::now() < deadline {
            if let Ok(TerminalEvent::Exited(exited)) = receiver.recv_timeout(WAIT) {
                return Some(exited);
            }
        }
        None
    }

    #[test]
    fn echoes_written_input_and_closes_the_shell() {
        let terminals = Terminals::default();
        let (sink, receiver) = collecting();
        let terminal_id = terminals.open(cat_launch(), sink).unwrap();
        terminals.resize(&terminal_id, GridSize { cols: 120, rows: 40 }).unwrap();
        terminals.write(&terminal_id, "hello onyx\n").unwrap();
        assert!(output_until(&receiver, "hello onyx").contains("hello onyx"));
        terminals.close(&terminal_id).unwrap();
        assert_eq!(exit_of(&receiver).map(|exited| exited.terminal_id), Some(terminal_id.clone()));
        assert!(terminals.write(&terminal_id, "late\n").is_err());
        assert!(terminals.close(&terminal_id).is_err());
    }

    #[test]
    fn caps_writes_and_rejects_bad_sizes() {
        let terminals = Terminals::default();
        let (sink, receiver) = collecting();
        let terminal_id = terminals.open(cat_launch(), sink).unwrap();
        assert!(terminals.write(&terminal_id, &"x".repeat(MAX_WRITE_BYTES + 1)).is_err());
        assert!(validated_size(0, 24).is_err());
        assert!(validated_size(80, MAX_DIMENSION + 1).is_err());
        terminals.close_all();
        assert!(exit_of(&receiver).is_some());
    }

    #[test]
    fn strips_agent_session_variables() {
        assert!(is_agent_session_variable("CLAUDECODE"));
        assert!(is_agent_session_variable("CLAUDE_CODE_SOMETHING_NEW"));
        assert!(!is_agent_session_variable("PATH"));
    }

    #[test]
    fn holds_back_a_character_split_across_reads() {
        let text = "aé€😀".as_bytes();
        assert_eq!(complete_utf8_length(text), text.len());
        assert_eq!(complete_utf8_length(&text[..text.len() - 1]), text.len() - 4);
        assert_eq!(complete_utf8_length(&text[..2]), 1);
        assert_eq!(complete_utf8_length(b""), 0);
    }
}
