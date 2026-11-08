use std::io::Read;
use std::os::unix::process::CommandExt;
use std::process::{Child, Command, Stdio};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crate::error::{AppError, AppResult};

const EXIT_POLL_INTERVAL: Duration = Duration::from_millis(10);
const MAX_ERROR_OUTPUT: usize = 64 * 1024;

#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub timeout: Duration,
    pub max_output: usize,
    pub label: &'static str,
}

#[derive(Debug)]
pub struct Output {
    pub is_success: bool,
    pub stdout: String,
    pub stderr: String,
    pub is_truncated: bool,
}

struct Captured {
    bytes: Vec<u8>,
    is_truncated: bool,
}

fn capture(stream: impl Read + Send + 'static, max_output: usize) -> JoinHandle<Captured> {
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut limited = stream.take(max_output as u64);
        let _ = limited.read_to_end(&mut bytes);
        let overflow = std::io::copy(&mut limited.into_inner(), &mut std::io::sink()).unwrap_or(0);
        Captured { bytes, is_truncated: overflow > 0 }
    })
}

fn collected(handle: JoinHandle<Captured>) -> Captured {
    handle.join().unwrap_or(Captured { bytes: Vec::new(), is_truncated: false })
}

fn wait_until(child: &mut Child, deadline: Instant) -> AppResult<Option<std::process::ExitStatus>> {
    while Instant::now() < deadline {
        if let Some(status) = child.try_wait()? {
            return Ok(Some(status));
        }
        thread::sleep(EXIT_POLL_INTERVAL);
    }
    signal_group(child.id(), "-KILL");
    let _ = child.wait();
    Ok(None)
}

pub fn signal_group(process_group: u32, signal: &str) {
    let _ = Command::new("/bin/kill")
        .args([signal, "--", &format!("-{process_group}")])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

pub fn run(command: &mut Command, limits: Limits) -> AppResult<Output> {
    let mut child =
        command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).process_group(0).spawn()?;
    let stdout = child.stdout.take().ok_or(AppError::NotFound("process stdout"))?;
    let stderr = child.stderr.take().ok_or(AppError::NotFound("process stderr"))?;
    let stdout = capture(stdout, limits.max_output);
    let stderr = capture(stderr, MAX_ERROR_OUTPUT);
    let status = wait_until(&mut child, Instant::now() + limits.timeout)?;
    let stdout = collected(stdout);
    let stderr = collected(stderr);
    let status = status.ok_or(AppError::TimedOut(limits.label))?;
    Ok(Output {
        is_success: status.success(),
        stdout: String::from_utf8_lossy(&stdout.bytes).into_owned(),
        stderr: String::from_utf8_lossy(&stderr.bytes).trim().to_string(),
        is_truncated: stdout.is_truncated,
    })
}

pub async fn in_background<T: Send + 'static>(work: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|error| AppError::Agent(error.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    const QUICK: Limits = Limits { timeout: Duration::from_secs(5), max_output: 8, label: "test" };

    #[test]
    fn captures_output_and_caps_it() {
        let output = run(Command::new("/bin/echo").arg("hello world"), QUICK).unwrap();
        assert!(output.is_success);
        assert_eq!(output.stdout, "hello wo");
        assert!(output.is_truncated);
    }

    #[test]
    fn reports_failure_with_stderr() {
        let output = run(Command::new("/bin/sh").args(["-c", "echo nope >&2; exit 3"]), QUICK).unwrap();
        assert!(!output.is_success);
        assert_eq!(output.stderr, "nope");
    }

    #[test]
    fn kills_a_process_that_outlives_its_timeout() {
        let limits = Limits { timeout: Duration::from_millis(100), ..QUICK };
        let started = Instant::now();
        let outcome = run(Command::new("/bin/sh").args(["-c", "sleep 5 | cat"]), limits);
        assert!(matches!(outcome, Err(AppError::TimedOut("test"))));
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
