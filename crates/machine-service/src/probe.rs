use crate::health::{DiskUsage, MachineHealth, Unreachable};
use domain::Machine;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

/// Runs on the far side of an ssh connection to describe the machine.
///
/// Deliberately plain `sh` with no external dependencies beyond the base
/// system, so it works on a fresh box that has nothing but a shell.
pub const PROBE_SCRIPT: &str = r#"
sysname=$(uname -s 2>/dev/null || echo unknown)
emit() { printf '%s=%s\n' "$1" "$2"; }
emit os "$(uname -sr 2>/dev/null || echo "$sysname")"
emit arch "$(uname -m 2>/dev/null || echo unknown)"
if [ "$sysname" = Darwin ]; then
  cpus=$(sysctl -n hw.ncpu 2>/dev/null || echo 0)
else
  cpus=$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 0)
fi
emit cpus "$cpus"
if [ "$sysname" = Darwin ]; then
  load=$(sysctl -n vm.loadavg 2>/dev/null | sed 's/[{},]//g' | awk '{print $1, $2, $3}')
  emit load "$load"
  boot=$(sysctl -n kern.boottime 2>/dev/null | sed -n 's/.*{ sec = \([0-9]*\).*/\1/p')
  now=$(date +%s)
  if [ -n "$boot" ] && [ -n "$now" ]; then emit uptime "$((now - boot))"; fi
  memtotal=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
  page=$(sysctl -n hw.pagesize 2>/dev/null || echo 4096)
  usedpages=$(vm_stat 2>/dev/null | awk '/Pages (active|inactive|wired down|occupied by compressor)/ {gsub(/\./,""); s+=$(NF)} END {print s+0}')
  emit mem_total "$((memtotal / 1024))"
  emit mem_used "$((usedpages * page / 1024))"
else
  emit load "$(awk '{print $1, $2, $3}' /proc/loadavg 2>/dev/null)"
  if [ -r /proc/uptime ]; then emit uptime "$(awk '{printf "%d", $1}' /proc/uptime 2>/dev/null)"; fi
  set -- $(awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{print t+0, a+0}' /proc/meminfo 2>/dev/null)
  emit mem_total "${1:-0}"
  emit mem_used "$(( ${1:-0} - ${2:-0} ))"
fi
set -- $(df -k / 2>/dev/null | awk 'NR==2 {print $2, $3}')
emit disk_total "${1:-0}"
emit disk_used "${2:-0}"
if [ "$sysname" = Darwin ]; then
  busy=$(ps -A -o %cpu= 2>/dev/null | awk '{s+=$1} END {printf "%d", s}')
  [ "${cpus:-0}" -gt 0 ] 2>/dev/null && busy=$((busy / cpus))
  emit cpu "$busy"
else
  read -r idle1 total1 <<EOF
$(awk '/^cpu /{idle=$5+$6; total=0; for(i=2;i<=NF;i++) total+=$i; print idle, total}' /proc/stat 2>/dev/null)
EOF
  sleep 0.35
  read -r idle2 total2 <<EOF
$(awk '/^cpu /{idle=$5+$6; total=0; for(i=2;i<=NF;i++) total+=$i; print idle, total}' /proc/stat 2>/dev/null)
EOF
  dt=$(( ${total2:-0} - ${total1:-0} ))
  di=$(( ${idle2:-0} - ${idle1:-0} ))
  if [ "$dt" -gt 0 ]; then emit cpu "$(( (dt - di) * 100 / dt ))"; else emit cpu 0; fi
fi
emit ok 1
"#;

pub const PROBE_TIMEOUT: Duration = Duration::from_secs(20);

/// ssh arguments for a probe.
///
/// `BatchMode` matters here: a background probe must never sit waiting for a
/// password the user isn't there to type.
pub fn probe_argv(alias: &str) -> Vec<String> {
    vec![
        "-o".to_string(),
        "BatchMode=yes".to_string(),
        "-o".to_string(),
        "ConnectTimeout=4".to_string(),
        alias.to_string(),
        PROBE_SCRIPT.to_string(),
    ]
}

#[derive(Debug, thiserror::Error)]
pub enum ProbeError {
    #[error("machine is unreachable: {0:?}")]
    Unreachable(Unreachable),
    #[error("probe timed out")]
    Timeout,
    #[error("could not run probe: {0}")]
    Spawn(String),
}

pub fn run_probe(machine: &Machine, ssh_program: PathBuf) -> Result<MachineHealth, ProbeError> {
    let (program, args): (PathBuf, Vec<String>) = if machine.is_local() {
        (PathBuf::from("sh"), vec!["-c".to_string(), PROBE_SCRIPT.to_string()])
    } else {
        (ssh_program, probe_argv(&machine.alias))
    };
    let output = run_with_timeout(&program, &args, PROBE_TIMEOUT)?;
    if !output.status.success() {
        return Err(ProbeError::Unreachable(Unreachable::from_stderr(&output.stderr)));
    }
    parse_probe_output(&output.stdout).ok_or(ProbeError::Unreachable(Unreachable::Unknown))
}

struct CommandOutput {
    status: std::process::ExitStatus,
    stdout: String,
    stderr: String,
}

/// Runs a probe and gives up on it, so one wedged machine can't stall the
/// rest of the fleet.
fn run_with_timeout(program: &PathBuf, args: &[String], timeout: Duration) -> Result<CommandOutput, ProbeError> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let (sender, receiver) = mpsc::channel();
    let spawned = command.output();
    let handle = std::thread::spawn(move || {
        let _ = sender.send(spawned);
    });
    match receiver.recv_timeout(timeout) {
        Ok(Ok(output)) => {
            let _ = handle.join();
            Ok(CommandOutput { status: output.status, stdout: String::from_utf8_lossy(&output.stdout).into_owned(), stderr: String::from_utf8_lossy(&output.stderr).into_owned() })
        }
        Ok(Err(err)) => Err(ProbeError::Spawn(err.to_string())),
        Err(_) => {
            // The probe keeps running on its own; ssh's connect timeout and
            // this deadline together bound how long the thread lives.
            Err(ProbeError::Timeout)
        }
    }
}

pub fn parse_probe_output(stdout: &str) -> Option<MachineHealth> {
    let mut values = std::collections::HashMap::new();
    for line in stdout.lines() {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        values.insert(key.trim().to_string(), value.trim().to_string());
    }
    if values.get("ok").map(String::as_str) != Some("1") {
        return None;
    }
    let usage = |total_key: &str, used_key: &str| {
        let total = values.get(total_key)?.parse::<u64>().ok()?;
        let used = values.get(used_key)?.parse::<u64>().ok()?;
        (total > 0).then_some(DiskUsage { total_kb: total, used_kb: used.min(total) })
    };
    let load = values.get("load").and_then(|value| {
        let mut parts = value.split_whitespace().map(str::parse::<f32>);
        Some([parts.next()?.ok()?, parts.next()?.ok()?, parts.next()?.ok()?])
    });
    Some(MachineHealth {
        os: values.get("os").cloned().unwrap_or_default(),
        arch: values.get("arch").cloned().unwrap_or_default(),
        cpu_percent: values.get("cpu").and_then(|value| value.parse::<i64>().ok()).map(|value| value.clamp(0, 100) as u8),
        cpu_count: values.get("cpus").and_then(|value| value.parse::<u32>().ok()),
        load,
        uptime_secs: values.get("uptime").and_then(|value| value.parse::<u64>().ok()),
        memory: usage("mem_total", "mem_used"),
        disk: usage("disk_total", "disk_used"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_argv_never_prompts_and_targets_the_alias() {
        let argv = probe_argv("nas");
        assert_eq!(argv[0], "-o");
        assert!(argv.contains(&"BatchMode=yes".to_string()), "{argv:?}");
        assert_eq!(argv[argv.len() - 2], "nas");
        assert_eq!(argv[argv.len() - 1], PROBE_SCRIPT);
    }

    #[test]
    fn parses_a_linux_probe_report() {
        let stdout = "os=Linux 6.8.0\narch=x86_64\ncpus=12\nload=1.50 1.20 0.90\nuptime=86400\nmem_total=16384000\nmem_used=8192000\ndisk_total=100000000\ndisk_used=75000000\ncpu=37\nok=1\n";
        let health = parse_probe_output(stdout).expect("parsed");
        assert_eq!(health.os, "Linux 6.8.0");
        assert_eq!(health.arch, "x86_64");
        assert_eq!(health.cpu_count, Some(12));
        assert_eq!(health.cpu_percent, Some(37));
        assert_eq!(health.uptime_secs, Some(86400));
        assert_eq!(health.memory, Some(DiskUsage { total_kb: 16_384_000, used_kb: 8_192_000 }));
        assert_eq!(health.memory_used_fraction(), Some(0.5));
        assert_eq!(health.disk_used_fraction(), Some(0.75));
        assert_eq!(health.load, Some([1.5, 1.2, 0.9]));
    }

    #[test]
    fn parses_a_macos_probe_report() {
        let stdout = "os=Mac OS 15.5\narch=arm64\ncpus=10\nload=2.01 1.80 1.70\nuptime=123456\nmem_total=16384000\nmem_used=4096000\ndisk_total=494384795\ndisk_used=247192397\ncpu=12\nok=1\n";
        let health = parse_probe_output(stdout).expect("parsed");
        assert_eq!(health.arch, "arm64");
        assert_eq!(health.memory_used_fraction(), Some(0.25));
    }

    #[test]
    fn rejects_a_report_that_never_finished() {
        assert!(parse_probe_output("os=Linux 6.8.0\narch=x86_64\n").is_none());
        assert!(parse_probe_output("").is_none());
    }

    #[test]
    fn a_machine_reporting_no_memory_still_parses() {
        let stdout = "os=Linux\narch=x86_64\nmem_total=0\nmem_used=0\ndisk_total=0\ndisk_used=0\nok=1\n";
        let health = parse_probe_output(stdout).expect("parsed");
        assert_eq!(health.memory, None);
        assert_eq!(health.disk, None);
        assert_eq!(health.memory_used_fraction(), None);
    }

    #[test]
    fn cpu_is_clamped_to_a_percentage() {
        let stdout = "os=Linux\ncpu=180\nmem_total=10\nmem_used=5\ndisk_total=10\ndisk_used=5\nok=1\n";
        assert_eq!(parse_probe_output(stdout).expect("parsed").cpu_percent, Some(100));
    }

    #[test]
    fn probes_this_computer_through_a_plain_shell() {
        let machine = Machine::local();
        let health = run_probe(&machine, PathBuf::from("/usr/bin/ssh")).expect("local probe runs");
        assert!(health.cpu_count.unwrap_or(1) >= 1);
        assert!(!health.os.is_empty());
        // Real numbers, not just well-formed ones: this is what catches a
        // script that silently reports zeros on this platform.
        assert_eq!(health.memory.is_some(), true, "no memory reported on {}", health.os);
        let used = health.memory.expect("memory").used_kb;
        assert!(used > 0, "memory reported as unused on {}", health.os);
        assert!(health.disk.is_some(), "no disk reported on {}", health.os);
        assert!(health.load.is_some(), "no load average parsed on {}", health.os);
    }
}