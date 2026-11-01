use serde::{Deserialize, Serialize};

/// What a probe found on a machine.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct MachineHealth {
    pub os: String,
    pub arch: String,
    pub cpu_percent: Option<u8>,
    pub cpu_count: Option<u32>,
    pub load: Option<[f32; 3]>,
    pub uptime_secs: Option<u64>,
    pub memory: Option<DiskUsage>,
    pub disk: Option<DiskUsage>,
}

impl MachineHealth {
    /// 0.0 - 1.0 share of memory in use, when the machine reports it.
    pub fn memory_used_fraction(&self) -> Option<f32> {
        self.memory.map(|usage| usage.used_fraction())
    }

    pub fn disk_used_fraction(&self) -> Option<f32> {
        self.disk.map(|usage| usage.used_fraction())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiskUsage {
    pub total_kb: u64,
    pub used_kb: u64,
}

impl DiskUsage {
    pub fn used_fraction(&self) -> f32 {
        if self.total_kb == 0 {
            return 0.0;
        }
        (self.used_kb as f32 / self.total_kb as f32).clamp(0.0, 1.0)
    }
}

/// Why a machine couldn't be reached, in words a human can act on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Unreachable {
    UnknownKeys,
    HostKey,
    HostnameNotFound,
    Refused,
    TimedOut,
    NoRoute,
    Offline,
    Unknown,
}

impl Unreachable {
    pub fn reason(self) -> &'static str {
        match self {
            Unreachable::UnknownKeys => "SSH keys aren't set up for this machine",
            Unreachable::HostKey => "Host key isn't in your known_hosts",
            Unreachable::HostnameNotFound => "Couldn't resolve that hostname",
            Unreachable::Refused => "Nothing is listening on that port",
            Unreachable::TimedOut => "Timed out",
            Unreachable::NoRoute => "No route to that machine",
            Unreachable::Offline => "Machine is offline",
            Unreachable::Unknown => "Unreachable",
        }
    }

    /// Maps ssh's stderr onto a reason. Checked most-specific first.
    pub fn from_stderr(stderr: &str) -> Self {
        let lowered = stderr.to_ascii_lowercase();
        let needles: &[(Unreachable, &[&str])] = &[
            (Unreachable::UnknownKeys, &["permission denied", "too many authentication failures", "no supported authentication"]),
            (Unreachable::HostKey, &["host key verification failed", "remote host identification has changed"]),
            (Unreachable::HostnameNotFound, &["could not resolve hostname", "name or service not known", "nodename nor servname"]),
            (Unreachable::Refused, &["connection refused"]),
            (Unreachable::TimedOut, &["connection timed out", "operation timed out", "timed out"]),
            (Unreachable::NoRoute, &["no route to host", "network is unreachable", "host is down", "no route"]),
            (Unreachable::Offline, &["network is down"]),
        ];
        for (reason, needles) in needles {
            if needles.iter().any(|needle| lowered.contains(needle)) {
                return *reason;
            }
        }
        Unreachable::Unknown
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum MachineStatus {
    /// Never probed yet.
    Unknown,
    /// Answering, with what it said.
    Online(MachineHealth),
    /// Not answering, with why.
    Offline(Unreachable),
}

impl MachineStatus {
    pub fn is_online(&self) -> bool {
        matches!(self, MachineStatus::Online(_))
    }

    pub fn health(&self) -> Option<&MachineHealth> {
        match self {
            MachineStatus::Online(health) => Some(health),
            _ => None,
        }
    }

    /// The one-line reason shown next to a machine.
    pub fn summary(&self) -> String {
        match self {
            MachineStatus::Unknown => "Not checked yet".to_string(),
            MachineStatus::Offline(reason) => reason.reason().to_string(),
            MachineStatus::Online(health) => health_summary(health),
        }
    }
}

fn health_summary(health: &MachineHealth) -> String {
    let mut parts = Vec::new();
    if let Some(fraction) = health.memory_used_fraction() {
        parts.push(format!("{}% mem", (fraction * 100.0).round() as u8));
    }
    if let Some(fraction) = health.disk_used_fraction() {
        parts.push(format!("{}% disk", (fraction * 100.0).round() as u8));
    }
    if parts.is_empty() {
        health.os.clone()
    } else {
        parts.join(" · ")
    }
}

/// A machine plus the latest probe result, ready for a row in the list.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MachineSnapshot {
    pub id: domain::MachineId,
    pub name: String,
    pub alias: String,
    pub status: MachineStatus,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stderr_maps_to_actionable_reasons() {
        let cases = [
            ("root@nas: Permission denied (publickey).", Unreachable::UnknownKeys),
            ("Host key verification failed.", Unreachable::HostKey),
            ("ssh: Could not resolve hostname nas: nodename nor servname provided", Unreachable::HostnameNotFound),
            ("ssh: connect to host nas port 22: Connection refused", Unreachable::Refused),
            ("ssh: connect to host nas port 22: Operation timed out", Unreachable::TimedOut),
            ("ssh: connect to host nas port 22: No route to host", Unreachable::NoRoute),
            ("ssh: something entirely new", Unreachable::Unknown),
        ];
        for (stderr, expected) in cases {
            assert_eq!(Unreachable::from_stderr(stderr), expected, "stderr: {stderr}");
        }
    }

    #[test]
    fn used_fraction_is_clamped_and_safe_at_zero() {
        assert_eq!(DiskUsage { total_kb: 0, used_kb: 5 }.used_fraction(), 0.0);
        assert_eq!(DiskUsage { total_kb: 100, used_kb: 25 }.used_fraction(), 0.25);
        assert_eq!(DiskUsage { total_kb: 100, used_kb: 500 }.used_fraction(), 1.0);
    }

    #[test]
    fn summaries_read_like_a_status_line() {
        let health = MachineHealth {
            os: "Mac OS 15".into(),
            memory: Some(DiskUsage { total_kb: 1_000, used_kb: 500 }),
            disk: Some(DiskUsage { total_kb: 1_000, used_kb: 250 }),
            ..MachineHealth::default()
        };
        assert_eq!(MachineStatus::Online(health).summary(), "50% mem · 25% disk");
        assert_eq!(MachineStatus::Offline(Unreachable::Refused).summary(), "Nothing is listening on that port");
        assert_eq!(MachineStatus::Unknown.summary(), "Not checked yet");
    }
}