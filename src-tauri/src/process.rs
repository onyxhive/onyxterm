use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{Map, Value};

use crate::chats::{AgentCommand, PermissionMode};

pub const STRIPPED_ENV: &[&str] = &[
    "CLAUDECODE",
    "CLAUDE_CODE_CHILD_SESSION",
    "CLAUDE_CODE_SESSION_ID",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_MESSAGING_SOCKET",
    "CLAUDE_CODE_MESSAGING_TOKEN",
    "CLAUDE_CODE_SESSION_ATTENDED",
    "CLAUDE_CODE_EXECPATH",
    "CLAUDE_PID",
    "CLAUDE_EFFORT",
    "CLAUDE_AGENT_SDK_VERSION",
    "ANTHROPIC_API_KEY",
    "CLAUDE_CONFIG_DIR",
];
const FALLBACK_SHELL: &str = "/bin/zsh";
pub const DEFAULT_MODEL: &str = "default";
const GRACE_PERIOD: Duration = Duration::from_secs(3);
const EXIT_POLL_INTERVAL: Duration = Duration::from_millis(50);
const STREAM_FLAGS: &[&str] = &[
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--permission-prompt-tool",
    "stdio",
];

pub enum SessionFlag {
    Start(String),
    Resume(String),
    Discover,
}

pub struct Launch<'a> {
    pub command: AgentCommand,
    pub model: &'a str,
    pub effort: &'a str,
    pub permission_mode: PermissionMode,
    pub is_fast_mode: bool,
    pub is_ultracode: bool,
    pub session: SessionFlag,
    pub cwd: &'a Path,
}

pub fn shell_quote(argument: &str) -> String {
    let is_plain = !argument.is_empty()
        && argument.chars().all(|character| character.is_ascii_alphanumeric() || "-_./=:@".contains(character));
    if is_plain {
        return argument.to_string();
    }
    format!("'{}'", argument.replace('\'', r"'\''"))
}

fn flag_settings(launch: &Launch<'_>) -> Option<String> {
    let mut settings = Map::new();
    if launch.is_fast_mode {
        settings.insert("fastMode".into(), Value::Bool(true));
    }
    if launch.is_ultracode {
        settings.insert("ultracode".into(), Value::Bool(true));
    }
    (!settings.is_empty()).then(|| Value::Object(settings).to_string())
}

fn arguments(launch: &Launch<'_>) -> Vec<String> {
    let mut arguments: Vec<String> =
        std::iter::once(launch.command.as_str()).chain(STREAM_FLAGS.iter().copied()).map(String::from).collect();
    if !launch.model.is_empty() && launch.model != DEFAULT_MODEL {
        arguments.extend(["--model".to_string(), launch.model.to_string()]);
    }
    if !launch.effort.is_empty() {
        arguments.extend(["--effort".to_string(), launch.effort.to_string()]);
    }
    arguments.extend(["--permission-mode".to_string(), launch.permission_mode.as_str().to_string()]);
    if let Some(settings) = flag_settings(launch) {
        arguments.extend(["--settings".to_string(), settings]);
    }
    match &launch.session {
        SessionFlag::Start(session_id) => arguments.extend(["--session-id".to_string(), session_id.clone()]),
        SessionFlag::Resume(session_id) => arguments.extend(["--resume".to_string(), session_id.clone()]),
        SessionFlag::Discover => {}
    }
    arguments
}

pub fn command_line(launch: &Launch<'_>) -> String {
    arguments(launch).iter().map(|argument| shell_quote(argument)).collect::<Vec<_>>().join(" ")
}

pub fn login_shell() -> String {
    std::env::var("SHELL").ok().filter(|shell| shell.starts_with('/')).unwrap_or_else(|| FALLBACK_SHELL.to_string())
}

pub fn spawn(launch: &Launch<'_>) -> std::io::Result<Child> {
    let mut command = Command::new(login_shell());
    command
        .args(["-l", "-i", "-c", &command_line(launch)])
        .current_dir(launch.cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0);
    for name in STRIPPED_ENV {
        command.env_remove(name);
    }
    command.spawn()
}

fn signal_group(process_group: u32, signal: &str) {
    let _ = Command::new("/bin/kill")
        .args([signal, "--", &format!("-{process_group}")])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

fn has_exited(child: &mut Child) -> bool {
    !matches!(child.try_wait(), Ok(None))
}

pub fn terminate_all(children: &mut [&mut Child]) {
    for child in children.iter() {
        signal_group(child.id(), "-TERM");
    }
    let deadline = Instant::now() + GRACE_PERIOD;
    while Instant::now() < deadline && !children.iter_mut().all(|child| has_exited(child)) {
        thread::sleep(EXIT_POLL_INTERVAL);
    }
    for child in children.iter_mut() {
        if !has_exited(child) {
            signal_group(child.id(), "-KILL");
            let _ = child.wait();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_only_what_the_shell_would_split() {
        assert_eq!(shell_quote("claude-lyxa-team"), "claude-lyxa-team");
        assert_eq!(shell_quote("it's"), r"'it'\''s'");
        assert_eq!(shell_quote("a b"), "'a b'");
        assert_eq!(shell_quote(""), "''");
    }

    #[test]
    fn starts_new_sessions_with_an_id_and_resumes_later_ones() {
        let cwd = Path::new("/tmp");
        let start = Launch {
            command: AgentCommand::ClaudeLyxaTeam,
            model: "haiku",
            effort: "low",
            permission_mode: PermissionMode::AcceptEdits,
            is_fast_mode: false,
            is_ultracode: false,
            session: SessionFlag::Start("abc".into()),
            cwd,
        };
        assert_eq!(
            command_line(&start),
            "claude-lyxa-team -p --input-format stream-json --output-format stream-json --verbose \
             --include-partial-messages --permission-prompt-tool stdio --model haiku --effort low \
             --permission-mode acceptEdits --session-id abc"
        );
        let resume = Launch {
            command: AgentCommand::Claude,
            model: "default",
            effort: "",
            permission_mode: PermissionMode::BypassPermissions,
            is_fast_mode: false,
            is_ultracode: false,
            session: SessionFlag::Resume("abc".into()),
            cwd,
        };
        assert!(command_line(&resume).ends_with("stdio --permission-mode bypassPermissions --resume abc"));
        assert!(!command_line(&resume).contains("exec"));
        let auto = Launch { permission_mode: PermissionMode::Auto, ..resume };
        assert!(command_line(&auto).contains(" --permission-mode auto --resume abc"));
        let fast = Launch { is_fast_mode: true, ..auto };
        assert!(command_line(&fast).ends_with(r#"auto --settings '{"fastMode":true}' --resume abc"#));
        let both = Launch { is_ultracode: true, ..fast };
        assert!(command_line(&both).contains(r#"--settings '{"fastMode":true,"ultracode":true}'"#));
    }
}
