use serde::{Deserialize, Serialize};
use std::fmt;
use std::path::Path;

/// Identifier for a machine a panel can run on.
///
/// Local shells use [`LOCAL_MACHINE`]; remote machines use the slug of their
/// ssh alias, so an id stays stable while a display name changes.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct MachineId(String);

impl MachineId {
    pub fn local() -> Self {
        Self(LOCAL_MACHINE.to_string())
    }

    pub fn from_alias(alias: &str) -> Self {
        let slug = slugify(alias);
        if slug.is_empty() {
            Self(LOCAL_MACHINE.to_string())
        } else {
            Self(slug)
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn is_local(&self) -> bool {
        self.0 == LOCAL_MACHINE
    }
}

impl Default for MachineId {
    fn default() -> Self {
        Self::local()
    }
}

impl fmt::Display for MachineId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl From<&str> for MachineId {
    fn from(value: &str) -> Self {
        Self::from_alias(value)
    }
}

pub const LOCAL_MACHINE: &str = "local";
pub const LOCAL_MACHINE_NAME: &str = "This Mac";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MachineSource {
    /// This computer.
    Local,
    /// Found in `~/.ssh/config`.
    SshConfig,
    /// Added by hand in the app.
    Added,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Machine {
    pub id: MachineId,
    pub name: String,
    /// ssh target for remote machines; empty for this computer.
    pub alias: String,
    pub source: MachineSource,
}

impl Machine {
    pub fn local() -> Self {
        Self { id: MachineId::local(), name: LOCAL_MACHINE_NAME.to_string(), alias: String::new(), source: MachineSource::Local }
    }

    pub fn remote(name: String, alias: String, source: MachineSource) -> Self {
        Self { id: MachineId::from_alias(&alias), name, alias, source }
    }

    pub fn is_local(&self) -> bool {
        self.source == MachineSource::Local
    }

    /// The argv a remote pane runs inside its PTY.
    ///
    /// `-t` asks for a pty on the far side so full-screen programs and the
    /// login shell's job control behave the same as they do locally. The
    /// remote command falls back to the home directory when the requested one
    /// isn't there, so a pane never dies on a moved directory.
    pub fn ssh_argv(&self, cwd: Option<&Path>) -> Vec<String> {
        let mut argv = vec![SSH_FORCE_TTY.to_string(), self.alias.clone()];
        if let Some(dir) = cwd {
            argv.push(remote_login_command(dir));
        }
        argv
    }
}

const SSH_FORCE_TTY: &str = "-t";

fn remote_login_command(dir: &Path) -> String {
    format!("cd {quoted} 2>/dev/null || cd \"$HOME\"; exec \"$SHELL\" -l", quoted = single_quote(&dir.to_string_lossy()))
}

fn single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

pub fn slugify(value: &str) -> String {
    let mut slug = String::with_capacity(value.len());
    let mut last_was_separator = true;
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            last_was_separator = false;
        } else if !last_was_separator {
            slug.push('-');
            last_was_separator = true;
        }
    }
    slug.trim_end_matches('-').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn local_machine_has_a_fixed_id() {
        let machine = Machine::local();
        assert!(machine.is_local());
        assert_eq!(machine.id, MachineId::local());
        assert_eq!(machine.id.as_str(), "local");
        assert_eq!(MachineId::default(), MachineId::local());
    }

    #[test]
    fn remote_ids_are_slugs_of_the_ssh_alias() {
        let machine = Machine::remote("Mac Studio".to_string(), "mac-studio.local".to_string(), MachineSource::SshConfig);
        assert_eq!(machine.id.as_str(), "mac-studio-local");
        assert!(!machine.is_local());
        assert_eq!(machine.name, "Mac Studio");
    }

    #[test]
    fn slugify_collapses_separators_and_trims() {
        assert_eq!(slugify("Mac Studio"), "mac-studio");
        assert_eq!(slugify("  build__01 (nuc) "), "build-01-nuc");
        assert_eq!(slugify("///"), "");
        assert_eq!(MachineId::from_alias("///"), MachineId::local());
    }

    #[test]
    fn remote_argv_forces_a_pty_and_runs_the_login_shell() {
        let machine = Machine::remote("NAS".to_string(), "nas".to_string(), MachineSource::Added);
        let argv = machine.ssh_argv(None);
        assert_eq!(argv, vec!["-t".to_string(), "nas".to_string()]);
    }

    #[test]
    fn remote_argv_starts_in_the_requested_directory() {
        let machine = Machine::remote("NAS".to_string(), "nas".to_string(), MachineSource::Added);
        let argv = machine.ssh_argv(Some(&PathBuf::from("/srv/app")));
        assert_eq!(argv[0], "-t");
        assert_eq!(argv[1], "nas");
        assert!(argv[2].starts_with("cd '/srv/app'"), "got {}", argv[2]);
        assert!(argv[2].contains("exec \"$SHELL\" -l"), "got {}", argv[2]);
        assert!(argv[2].contains("|| cd \"$HOME\""), "falls back home: {}", argv[2]);
    }

    #[test]
    fn remote_argv_quotes_paths_with_quotes_in_them() {
        let machine = Machine::remote("NAS".to_string(), "nas".to_string(), MachineSource::Added);
        let argv = machine.ssh_argv(Some(&PathBuf::from("/srv/it's here")));
        assert_eq!(argv[2], r#"cd '/srv/it'\''s here' 2>/dev/null || cd "$HOME"; exec "$SHELL" -l"#);
    }

    #[test]
    fn machine_ids_round_trip_through_serde() {
        let machine = Machine::remote("NAS".to_string(), "nas".to_string(), MachineSource::Added);
        let json = serde_json::to_string(&machine).unwrap();
        assert_eq!(serde_json::from_str::<Machine>(&json).unwrap(), machine);
        assert_eq!(serde_json::to_string(&machine.id).unwrap(), "\"nas\"");
        assert_eq!(serde_json::from_str::<MachineId>("\"nas\"").unwrap(), machine.id);
    }
}