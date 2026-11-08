use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::db::{Db, new_id};
use crate::error::{AppError, AppResult};
use crate::git::validated_id;
use crate::process::login_shell;
use crate::subprocess::signal_group;
use crate::workspaces::project;

pub const SCRIPT_OUTPUT: &str = "script-output";
pub const SCRIPT_EXITED: &str = "script-exited";
const MAX_NAME_LENGTH: usize = 80;
const MAX_COMMAND_LENGTH: usize = 4000;
const MAX_LINE_LENGTH: usize = 16_384;
const STOP_GRACE: Duration = Duration::from_secs(3);
const SCRIPT_COLUMNS: &str = "id, project_id, name, command, position";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScript {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub command: String,
    pub position: i64,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ScriptStream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptOutput {
    pub script_id: String,
    pub run_id: String,
    pub line: String,
    pub stream: ScriptStream,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptExited {
    pub script_id: String,
    pub run_id: String,
    pub code: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScriptEvent {
    Output(ScriptOutput),
    Exited(ScriptExited),
}

type Sink = Arc<dyn Fn(ScriptEvent) + Send + Sync>;

#[derive(Debug, Clone)]
pub struct ScriptRun {
    pub script_id: String,
    pub run_id: String,
    pub program: String,
    pub arguments: Vec<String>,
    pub cwd: PathBuf,
}

#[derive(Default, Clone)]
pub struct ScriptRuns(Arc<Mutex<HashMap<String, u32>>>);

fn script_from_row(row: &Row<'_>) -> rusqlite::Result<ProjectScript> {
    Ok(ProjectScript {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        command: row.get(3)?,
        position: row.get(4)?,
    })
}

pub fn scripts(connection: &Connection, project_id: &str) -> AppResult<Vec<ProjectScript>> {
    let mut statement = connection
        .prepare(&format!("SELECT {SCRIPT_COLUMNS} FROM project_scripts WHERE project_id = ?1 ORDER BY position"))?;
    let all = statement.query_map([project_id], script_from_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(all)
}

pub fn script(connection: &Connection, script_id: &str) -> AppResult<ProjectScript> {
    connection
        .query_row(&format!("SELECT {SCRIPT_COLUMNS} FROM project_scripts WHERE id = ?1"), [script_id], script_from_row)
        .optional()?
        .ok_or(AppError::NotFound("script"))
}

fn validated_text(text: &str, max_length: usize, what: &str) -> AppResult<String> {
    let trimmed = text.trim();
    let is_valid = !trimmed.is_empty() && trimmed.chars().count() <= max_length && !trimmed.contains('\0');
    if !is_valid {
        return Err(AppError::Invalid(format!("{what} must be 1 to {max_length} characters")));
    }
    Ok(trimmed.to_string())
}

fn validated_name(name: &str) -> AppResult<String> {
    let name = validated_text(name, MAX_NAME_LENGTH, "script name")?;
    if name.chars().any(char::is_control) {
        return Err(AppError::Invalid("script name must be a single line".into()));
    }
    Ok(name)
}

pub fn insert_script(connection: &Connection, project_id: &str, name: &str, command: &str) -> AppResult<ProjectScript> {
    let owner = project(connection, project_id)?;
    let position: i64 = connection.query_row(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM project_scripts WHERE project_id = ?1",
        [&owner.id],
        |row| row.get(0),
    )?;
    let created = ProjectScript {
        id: new_id(),
        project_id: owner.id,
        name: validated_name(name)?,
        command: validated_text(command, MAX_COMMAND_LENGTH, "script command")?,
        position,
    };
    connection.execute(
        &format!("INSERT INTO project_scripts ({SCRIPT_COLUMNS}) VALUES (?1, ?2, ?3, ?4, ?5)"),
        params![created.id, created.project_id, created.name, created.command, created.position],
    )?;
    Ok(created)
}

pub fn delete_script(connection: &Connection, script_id: &str) -> AppResult<()> {
    if connection.execute("DELETE FROM project_scripts WHERE id = ?1", [script_id])? == 0 {
        return Err(AppError::NotFound("script"));
    }
    Ok(())
}

fn clipped_line(line: &str) -> String {
    line.chars().take(MAX_LINE_LENGTH).collect()
}

fn pump(stream: impl Read + Send + 'static, kind: ScriptStream, run: &ScriptRun, sink: Sink) -> JoinHandle<()> {
    let (script_id, run_id) = (run.script_id.clone(), run.run_id.clone());
    thread::spawn(move || {
        let mut reader = BufReader::new(stream);
        let mut buffer = Vec::new();
        while matches!(reader.read_until(b'\n', &mut buffer), Ok(read) if read > 0) {
            let line = clipped_line(String::from_utf8_lossy(&buffer).trim_end_matches(['\n', '\r']));
            sink(ScriptEvent::Output(ScriptOutput {
                script_id: script_id.clone(),
                run_id: run_id.clone(),
                line,
                stream: kind,
            }));
            buffer.clear();
        }
    })
}

fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl ScriptRuns {
    fn pid_of(&self, run_id: &str) -> Option<u32> {
        locked(&self.0).get(run_id).copied()
    }

    pub fn start(&self, run: ScriptRun, sink: Sink) -> AppResult<()> {
        let mut child: Child = Command::new(&run.program)
            .args(&run.arguments)
            .current_dir(&run.cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .process_group(0)
            .spawn()?;
        let stdout = child.stdout.take().ok_or(AppError::NotFound("script stdout"))?;
        let stderr = child.stderr.take().ok_or(AppError::NotFound("script stderr"))?;
        let readers = [
            pump(stdout, ScriptStream::Stdout, &run, sink.clone()),
            pump(stderr, ScriptStream::Stderr, &run, sink.clone()),
        ];
        locked(&self.0).insert(run.run_id.clone(), child.id());
        let runs = self.clone();
        thread::spawn(move || {
            readers.into_iter().for_each(|reader| {
                let _ = reader.join();
            });
            let code = child.wait().ok().and_then(|status| status.code());
            locked(&runs.0).remove(&run.run_id);
            sink(ScriptEvent::Exited(ScriptExited { script_id: run.script_id, run_id: run.run_id, code }));
        });
        Ok(())
    }

    pub fn stop(&self, run_id: &str) -> AppResult<()> {
        let pid = self.pid_of(run_id).ok_or(AppError::NotFound("running script"))?;
        signal_group(pid, "-TERM");
        let (runs, run_id) = (self.clone(), run_id.to_string());
        thread::spawn(move || {
            thread::sleep(STOP_GRACE);
            if runs.pid_of(&run_id) == Some(pid) {
                signal_group(pid, "-KILL");
            }
        });
        Ok(())
    }

    pub fn stop_all(&self) {
        for pid in locked(&self.0).values() {
            signal_group(*pid, "-KILL");
        }
    }
}

fn emit_to(app: AppHandle) -> Sink {
    Arc::new(move |event| {
        let _ = match event {
            ScriptEvent::Output(output) => app.emit(SCRIPT_OUTPUT, output),
            ScriptEvent::Exited(exited) => app.emit(SCRIPT_EXITED, exited),
        };
    })
}

#[tauri::command]
pub fn list_scripts(db: State<'_, Db>, project_id: String) -> AppResult<Vec<ProjectScript>> {
    validated_id(&project_id, "project")?;
    scripts(&db.connection(), &project_id)
}

#[tauri::command]
pub fn add_script(db: State<'_, Db>, project_id: String, name: String, command: String) -> AppResult<ProjectScript> {
    validated_id(&project_id, "project")?;
    insert_script(&db.connection(), &project_id, &name, &command)
}

#[tauri::command]
pub fn remove_script(db: State<'_, Db>, script_id: String) -> AppResult<()> {
    validated_id(&script_id, "script")?;
    delete_script(&db.connection(), &script_id)
}

#[tauri::command]
pub fn run_script(
    app: AppHandle,
    db: State<'_, Db>,
    runs: State<'_, ScriptRuns>,
    script_id: String,
) -> AppResult<String> {
    validated_id(&script_id, "script")?;
    let (saved, cwd) = {
        let connection = db.connection();
        let saved = script(&connection, &script_id)?;
        let cwd = project(&connection, &saved.project_id)?.path;
        (saved, cwd)
    };
    let run = ScriptRun {
        script_id: saved.id,
        run_id: new_id(),
        program: login_shell(),
        arguments: vec!["-l".into(), "-i".into(), "-c".into(), saved.command],
        cwd: PathBuf::from(cwd),
    };
    let run_id = run.run_id.clone();
    runs.start(run, emit_to(app))?;
    Ok(run_id)
}

#[tauri::command]
pub fn stop_script(runs: State<'_, ScriptRuns>, run_id: String) -> AppResult<()> {
    validated_id(&run_id, "run")?;
    runs.stop(&run_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspaces::{ensure_default_workspace, workspaces};
    use std::sync::mpsc;

    const WAIT: Duration = Duration::from_secs(10);

    fn project_id(connection: &Connection) -> String {
        ensure_default_workspace(connection).unwrap();
        let workspace_id = workspaces(connection).unwrap()[0].id.clone();
        connection
            .execute(
                "INSERT INTO projects (id, workspace_id, path, name) VALUES ('p1', ?1, '/tmp', 'p1')",
                [workspace_id],
            )
            .unwrap();
        "p1".into()
    }

    fn shell_run(command: &str) -> ScriptRun {
        ScriptRun {
            script_id: "s1".into(),
            run_id: new_id(),
            program: "/bin/sh".into(),
            arguments: vec!["-c".into(), command.into()],
            cwd: std::env::temp_dir(),
        }
    }

    fn collecting() -> (Sink, mpsc::Receiver<ScriptEvent>) {
        let (sender, receiver) = mpsc::channel();
        let sender = Mutex::new(sender);
        (Arc::new(move |event| drop(locked(&sender).send(event))), receiver)
    }

    fn until_exit(receiver: &mpsc::Receiver<ScriptEvent>) -> Vec<ScriptEvent> {
        let mut seen = Vec::new();
        while let Ok(event) = receiver.recv_timeout(WAIT) {
            let is_exit = matches!(event, ScriptEvent::Exited(_));
            seen.push(event);
            if is_exit {
                break;
            }
        }
        seen
    }

    #[test]
    fn stores_scripts_in_order_and_caps_their_fields() {
        let db = Db::open_in_memory().unwrap();
        let connection = db.connection();
        let project_id = project_id(&connection);
        let first = insert_script(&connection, &project_id, " Dev ", "npm run dev").unwrap();
        let second = insert_script(&connection, &project_id, "Test", "cargo test").unwrap();
        assert_eq!((first.name.as_str(), first.position, second.position), ("Dev", 0, 1));
        assert!(insert_script(&connection, &project_id, &"n".repeat(MAX_NAME_LENGTH + 1), "echo").is_err());
        assert!(insert_script(&connection, &project_id, "Long", &"x".repeat(MAX_COMMAND_LENGTH + 1)).is_err());
        assert!(insert_script(&connection, &project_id, "two\nlines", "echo").is_err());
        delete_script(&connection, &first.id).unwrap();
        assert_eq!(scripts(&connection, &project_id).unwrap(), vec![second]);
        assert!(delete_script(&connection, &first.id).is_err());
    }

    #[test]
    fn streams_both_outputs_and_reports_the_exit_code() {
        let runs = ScriptRuns::default();
        let (sink, receiver) = collecting();
        let run = shell_run("echo out; echo err >&2; exit 3");
        let run_id = run.run_id.clone();
        runs.start(run, sink).unwrap();
        let events = until_exit(&receiver);
        let lines: Vec<_> = events
            .iter()
            .filter_map(|event| match event {
                ScriptEvent::Output(output) => Some((output.line.as_str(), output.stream)),
                ScriptEvent::Exited(_) => None,
            })
            .collect();
        assert!(lines.contains(&("out", ScriptStream::Stdout)));
        assert!(lines.contains(&("err", ScriptStream::Stderr)));
        assert_eq!(
            events.last(),
            Some(&ScriptEvent::Exited(ScriptExited { script_id: "s1".into(), run_id: run_id.clone(), code: Some(3) }))
        );
        assert!(runs.pid_of(&run_id).is_none());
    }

    #[test]
    fn stops_a_running_script_by_its_process_group() {
        let runs = ScriptRuns::default();
        let (sink, receiver) = collecting();
        let run = shell_run("echo started; sleep 30 | cat");
        let run_id = run.run_id.clone();
        runs.start(run, sink).unwrap();
        assert!(matches!(receiver.recv_timeout(WAIT), Ok(ScriptEvent::Output(_))));
        runs.stop(&run_id).unwrap();
        let events = until_exit(&receiver);
        assert!(matches!(events.last(), Some(ScriptEvent::Exited(exited)) if exited.code.is_none()));
        assert!(runs.stop(&run_id).is_err());
    }
}
