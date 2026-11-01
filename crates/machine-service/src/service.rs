use crate::health::{MachineSnapshot, MachineStatus, Unreachable};
use crate::probe::{run_probe, ProbeError};
use crate::registry::MachineRegistry;
use domain::{Machine, MachineId};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// Where ssh lives. `/usr/bin/ssh` on macOS and Linux; PATH otherwise.
pub fn default_ssh_program() -> PathBuf {
    let standard = PathBuf::from("/usr/bin/ssh");
    if standard.exists() {
        return standard;
    }
    PathBuf::from("ssh")
}

pub fn default_ssh_config() -> PathBuf {
    match std::env::var_os("HOME") {
        Some(home) if !home.is_empty() => PathBuf::from(home).join(".ssh/config"),
        _ => PathBuf::from(".ssh/config"),
    }
}

struct Inner {
    registry: RwLock<MachineRegistry>,
    machines: RwLock<Vec<Machine>>,
    statuses: RwLock<HashMap<MachineId, MachineStatus>>,
    ssh_config: PathBuf,
    ssh_program: PathBuf,
    refreshes: AtomicU64,
    polling: AtomicBool,
}

/// Keeps the machine list and each machine's reachability fresh.
///
/// Cloning is cheap and shares one set of results, so every machines pane
/// sees the same numbers.
#[derive(Clone)]
pub struct MachineService {
    inner: Arc<Inner>,
}

impl MachineService {
    pub fn new(registry: MachineRegistry) -> Self {
        let ssh_config = default_ssh_config();
        let machines = registry.resolve(&ssh_config);
        Self {
            inner: Arc::new(Inner {
                registry: RwLock::new(registry),
                machines: RwLock::new(machines),
                statuses: RwLock::new(HashMap::new()),
                ssh_config,
                ssh_program: default_ssh_program(),
                refreshes: AtomicU64::new(0),
                polling: AtomicBool::new(false),
            }),
        }
    }

    pub fn with_paths(registry: MachineRegistry, ssh_config: PathBuf, ssh_program: PathBuf) -> Self {
        let machines = registry.resolve(&ssh_config);
        Self {
            inner: Arc::new(Inner {
                registry: RwLock::new(registry),
                machines: RwLock::new(machines),
                statuses: RwLock::new(HashMap::new()),
                ssh_config,
                ssh_program,
                refreshes: AtomicU64::new(0),
                polling: AtomicBool::new(false),
            }),
        }
    }

    pub fn machines(&self) -> Vec<Machine> {
        self.inner.machines.read().clone()
    }

    pub fn machine(&self, id: &MachineId) -> Option<Machine> {
        self.inner.machines.read().iter().find(|machine| &machine.id == id).cloned()
    }

    pub fn registry(&self) -> MachineRegistry {
        self.inner.registry.read().clone()
    }

    pub fn ssh_program(&self) -> PathBuf {
        self.inner.ssh_program.clone()
    }

    pub fn status(&self, id: &MachineId) -> MachineStatus {
        self.inner.statuses.read().get(id).cloned().unwrap_or(MachineStatus::Unknown)
    }

    /// Every machine with its latest status, in list order.
    pub fn snapshot(&self) -> Vec<MachineSnapshot> {
        let machines = self.inner.machines.read();
        let statuses = self.inner.statuses.read();
        machines
            .iter()
            .map(|machine| MachineSnapshot {
                id: machine.id.clone(),
                name: machine.name.clone(),
                alias: machine.alias.clone(),
                status: statuses.get(&machine.id).cloned().unwrap_or(MachineStatus::Unknown),
            })
            .collect()
    }

    /// Bumped after every completed probe, so a UI can cheaply notice new
    /// numbers without diffing the whole snapshot.
    pub fn refresh_count(&self) -> u64 {
        self.inner.refreshes.load(Ordering::Relaxed)
    }

    /// Re-reads ssh config and the hand-added list.
    pub fn reload(&self) {
        let machines = self.inner.registry.read().resolve(&self.inner.ssh_config);
        let known: Vec<MachineId> = machines.iter().map(|machine| machine.id.clone()).collect();
        *self.inner.machines.write() = machines;
        self.inner.statuses.write().retain(|id, _| known.contains(id));
    }

    pub fn set_added(&self, added: Vec<Machine>) {
        *self.inner.registry.write() = MachineRegistry::new(added);
        self.reload();
    }

    /// Probes every machine on this thread. Used at startup and by tests.
    pub fn refresh_blocking(&self) {
        let machines = self.machines();
        let mut statuses = self.inner.statuses.write();
        for machine in &machines {
            let status = match run_probe(machine, self.inner.ssh_program.clone()) {
                Ok(health) => MachineStatus::Online(health),
                Err(ProbeError::Unreachable(reason)) => MachineStatus::Offline(reason),
                Err(ProbeError::Timeout) => MachineStatus::Offline(Unreachable::TimedOut),
                Err(ProbeError::Spawn(err)) => {
                    tracing::warn!(machine = %machine.name, %err, "probe could not start");
                    MachineStatus::Offline(Unreachable::Unknown)
                }
            };
            statuses.insert(machine.id.clone(), status);
        }
        drop(statuses);
        self.inner.refreshes.fetch_add(1, Ordering::Relaxed);
    }

    /// Starts a background loop that keeps statuses warm. Idempotent.
    pub fn start_polling(self: &Arc<Self>, interval: Duration) {
        if self.inner.polling.swap(true, Ordering::SeqCst) {
            return;
        }
        let service = Arc::clone(self);
        std::thread::Builder::new()
            .name("machine-probe".to_string())
            .spawn(move || loop {
                service.reload();
                service.refresh_blocking();
                std::thread::sleep(interval);
            })
            .map(|_| ())
            .unwrap_or_else(|err| tracing::warn!(%err, "machine probe loop could not start"));
    }
}

impl MachineService {
    /// Convenience for the common "just give me the machines" case.
    pub fn discover(ssh_config: &Path) -> Self {
        Self::with_paths(MachineRegistry::default(), ssh_config.to_path_buf(), default_ssh_program())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::health::MachineHealth;
    use domain::MachineSource;

    #[test]
    fn a_fresh_service_lists_this_computer_first() {
        let service = MachineService::with_paths(MachineRegistry::default(), PathBuf::from("/nope"), PathBuf::from("/usr/bin/ssh"));
        let snapshot = service.snapshot();
        assert_eq!(snapshot.len(), 1);
        assert_eq!(snapshot[0].id, MachineId::local());
        assert_eq!(snapshot[0].status, MachineStatus::Unknown);
    }

    #[test]
    fn refreshing_finds_this_computer_online() {
        let service = MachineService::with_paths(MachineRegistry::default(), PathBuf::from("/nope"), PathBuf::from("/usr/bin/ssh"));
        service.refresh_blocking();
        let snapshot = service.snapshot();
        assert!(snapshot[0].status.is_online(), "{:?}", snapshot[0].status);
        assert_eq!(service.refresh_count(), 1);
    }

    #[test]
    fn probing_this_computer_reports_a_real_machine() {
        let service = MachineService::with_paths(MachineRegistry::default(), PathBuf::from("/nope"), PathBuf::from("/usr/bin/ssh"));
        service.refresh_blocking();
        match service.status(&MachineId::local()) {
            MachineStatus::Online(health) => {
                assert!(!health.os.is_empty());
                assert!(health.disk.is_some() || health.memory.is_some());
            }
            other => panic!("expected this computer to answer, got {other:?}"),
        }
    }

    #[test]
    fn a_machine_that_cannot_be_reached_reports_why() {
        // No ssh binary at all: probing a remote machine can't even start.
        let service = MachineService::with_paths(
            MachineRegistry::new(vec![Machine::remote("Ghost".to_string(), "ghost".to_string(), MachineSource::Added)]),
            PathBuf::from("/nope"),
            PathBuf::from("/nonexistent/ssh-binary"),
        );
        service.refresh_blocking();
        assert_eq!(service.status(&MachineId::from_alias("ghost")), MachineStatus::Offline(Unreachable::Unknown));
        // This computer is probed over a plain shell, so it still answers.
        assert!(service.status(&MachineId::local()).is_online());
    }

    #[test]
    fn reload_picks_up_hand_added_machines() {
        let service = MachineService::with_paths(MachineRegistry::default(), PathBuf::from("/nope"), PathBuf::from("/usr/bin/ssh"));
        assert_eq!(service.machines().len(), 1);
        service.set_added(vec![Machine::remote("Builder".to_string(), "builder".to_string(), MachineSource::Added)]);
        let machines = service.machines();
        assert_eq!(machines.len(), 2);
        assert_eq!(machines[1].alias, "builder");
        assert!(service.machine(&MachineId::from_alias("builder")).is_some());
    }

    #[test]
    fn statuses_are_dropped_for_machines_that_go_away() {
        let service = MachineService::with_paths(MachineRegistry::default(), PathBuf::from("/nope"), PathBuf::from("/usr/bin/ssh"));
        service.set_added(vec![Machine::remote("Builder".to_string(), "builder".to_string(), MachineSource::Added)]);
        service.inner.statuses.write().insert(
            MachineId::from_alias("builder"),
            MachineStatus::Online(MachineHealth::default()),
        );
        service.set_added(Vec::new());
        assert!(!service.status(&MachineId::from_alias("builder")).is_online());
        assert_eq!(service.status(&MachineId::from_alias("builder")), MachineStatus::Unknown);
    }

    #[test]
    fn cloning_shares_one_set_of_results() {
        let service = MachineService::with_paths(MachineRegistry::default(), PathBuf::from("/nope"), PathBuf::from("/usr/bin/ssh"));
        let clone = service.clone();
        clone.refresh_blocking();
        assert_eq!(service.refresh_count(), clone.refresh_count());
        assert!(service.status(&MachineId::local()).is_online());
    }

    #[test]
    fn polling_starts_only_once() {
        let service = Arc::new(MachineService::with_paths(
            MachineRegistry::default(),
            PathBuf::from("/nope"),
            PathBuf::from("/usr/bin/ssh"),
        ));
        service.start_polling(Duration::from_secs(3600));
        service.start_polling(Duration::from_secs(3600));
        assert!(service.inner.polling.load(Ordering::SeqCst));
    }
}