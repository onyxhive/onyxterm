use std::process::Command;
use std::time::Duration;

use tauri::State;

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::git::{GitTarget, workdir};
use crate::subprocess::{self, Limits, in_background};

const QUICK_LIMITS: Limits = Limits { timeout: Duration::from_secs(5), max_output: 4096, label: "system command" };
const SCUTIL: &str = "/usr/sbin/scutil";
const HOSTNAME: &str = "/bin/hostname";
pub const OPEN: &str = "/usr/bin/open";
const UNKNOWN_MACHINE: &str = "This Mac";

fn first_line_of(command: &mut Command) -> Option<String> {
    let output = subprocess::run(command, QUICK_LIMITS).ok().filter(|output| output.is_success)?;
    let line = output.stdout.lines().next()?.trim().to_string();
    (!line.is_empty()).then_some(line)
}

pub fn computer_name() -> String {
    first_line_of(Command::new(SCUTIL).args(["--get", "ComputerName"]))
        .or_else(|| first_line_of(&mut Command::new(HOSTNAME)))
        .unwrap_or_else(|| UNKNOWN_MACHINE.to_string())
}

pub fn open_with(arguments: &[&std::ffi::OsStr]) -> AppResult<()> {
    let output = subprocess::run(Command::new(OPEN).args(arguments), QUICK_LIMITS)?;
    if !output.is_success {
        return Err(AppError::Agent(format!("open failed: {}", output.stderr)));
    }
    Ok(())
}

#[tauri::command]
pub async fn machine_name() -> AppResult<String> {
    in_background(|| Ok(computer_name())).await
}

#[tauri::command]
pub async fn reveal_project(db: State<'_, Db>, target: GitTarget) -> AppResult<()> {
    let root = workdir(&db, &target)?.root;
    if !root.is_dir() {
        return Err(AppError::NotFound("project folder"));
    }
    in_background(move || open_with(&[root.as_os_str()])).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn always_names_the_machine() {
        assert!(!computer_name().trim().is_empty());
    }
}
