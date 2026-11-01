use domain::{Machine, MachineId, MachineSource, SshHost};
use std::path::Path;

/// The machines onyxterm can put a pane on: this computer, everything in
/// `~/.ssh/config`, and anything added by hand.
#[derive(Debug, Clone, Default)]
pub struct MachineRegistry {
    added: Vec<Machine>,
}

impl MachineRegistry {
    pub fn new(added: Vec<Machine>) -> Self {
        Self { added }
    }

    pub fn added(&self) -> &[Machine] {
        &self.added
    }

    /// Machines added by hand, ready to be written back to settings.
    pub fn added_serializable(&self) -> Vec<Machine> {
        self.added.clone()
    }

    /// This computer, then ssh config hosts, then added machines.
    ///
    /// A hand-added machine whose alias matches an ssh config host replaces
    /// it, so a custom display name wins without the host disappearing.
    pub fn resolve(&self, ssh_config: &Path) -> Vec<Machine> {
        self.resolve_from(&domain::read_ssh_hosts(ssh_config))
    }

    pub fn resolve_from(&self, hosts: &[SshHost]) -> Vec<Machine> {
        let mut machines = Vec::with_capacity(hosts.len() + self.added.len() + 1);
        machines.push(Machine::local());
        let mut ids = std::collections::HashSet::from([MachineId::local()]);
        for host in hosts {
            let machine = Machine::remote(host.alias.clone(), host.alias.clone(), MachineSource::SshConfig);
            if ids.insert(machine.id.clone()) {
                machines.push(machine);
            }
        }
        for machine in &self.added {
            if ids.insert(machine.id.clone()) {
                machines.push(machine.clone());
            } else if let Some(existing) = machines.iter_mut().find(|other| other.id == machine.id) {
                // Same alias, added by hand: keep the machine, take the name.
                existing.name = machine.name.clone();
                existing.source = MachineSource::Added;
            }
        }
        machines
    }

    pub fn find(&self, ssh_config: &Path, id: &MachineId) -> Option<Machine> {
        self.resolve(ssh_config).into_iter().find(|machine| &machine.id == id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn host(alias: &str) -> SshHost {
        SshHost { alias: alias.to_string(), hostname: None, user: None, port: None, identity_file: None, options: Vec::new() }
    }

    fn temp_config() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::TempDir::new().expect("tempdir");
        let path = dir.path().join("config");
        std::fs::write(&path, "Host nas\n  HostName nas.local\n\nHost ci\n  HostName ci.local\n").expect("write");
        (dir, path)
    }

    #[test]
    fn this_computer_comes_first_then_hosts_in_config_order() {
        let registry = MachineRegistry::default();
        let machines = registry.resolve_from(&[host("nas"), host("ci")]);
        assert_eq!(machines.len(), 3);
        assert!(machines[0].is_local());
        assert_eq!(machines[0].name, "This Mac");
        assert_eq!(machines[1].alias, "nas");
        assert_eq!(machines[2].alias, "ci");
    }

    #[test]
    fn reads_hosts_out_of_a_real_ssh_config() {
        let (_dir, path) = temp_config();
        let machines = MachineRegistry::default().resolve(&path);
        assert_eq!(machines.len(), 3);
        assert_eq!(machines[1].alias, "nas");
        assert_eq!(machines[2].alias, "ci");
    }

    #[test]
    fn added_machines_appear_after_config_hosts() {
        let registry = MachineRegistry::new(vec![Machine::remote("Builder".to_string(), "builder".to_string(), MachineSource::Added)]);
        let machines = registry.resolve_from(&[host("nas")]);
        assert_eq!(machines.last().unwrap().alias, "builder");
        assert_eq!(machines.len(), 3);
    }

    #[test]
    fn adding_a_name_for_a_config_host_keeps_one_entry() {
        let registry = MachineRegistry::new(vec![Machine::remote("The NAS".to_string(), "nas".to_string(), MachineSource::Added)]);
        let machines = registry.resolve_from(&[host("nas")]);
        assert_eq!(machines.len(), 2);
        let nas = machines.iter().find(|m| m.alias == "nas").unwrap();
        assert_eq!(nas.name, "The NAS");
        assert_eq!(nas.source, MachineSource::Added);
    }

    #[test]
    fn a_missing_ssh_config_leaves_this_computer_alone() {
        let machines = MachineRegistry::default().resolve(Path::new("/nope/not/here"));
        assert_eq!(machines.len(), 1);
        assert!(machines[0].is_local());
    }

    #[test]
    fn a_host_twice_in_one_config_appears_once() {
        let machines = MachineRegistry::default().resolve_from(&[host("nas"), host("nas")]);
        assert_eq!(machines.len(), 2);
    }

    #[test]
    fn finds_a_machine_by_id() {
        let (_dir, path) = temp_config();
        let registry = MachineRegistry::default();
        let found = registry.find(&path, &MachineId::from_alias("ci")).expect("found");
        assert_eq!(found.alias, "ci");
        assert!(registry.find(&path, &MachineId::from_alias("nope")).is_none());
    }
}