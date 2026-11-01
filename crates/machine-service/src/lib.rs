#![deny(warnings)]
#![forbid(unsafe_code)]

//! Machines a pane can run on, and whether they're answering.
//!
//! Every machine is probed with the same small `sh` script — locally and over
//! ssh — so a fleet list reads the same whether a box is one hop away or not.

mod health;
mod probe;
mod registry;
mod service;

pub use health::{DiskUsage, MachineHealth, MachineStatus, MachineSnapshot, Unreachable};
pub use probe::{parse_probe_output, probe_argv, run_probe, ProbeError, PROBE_SCRIPT, PROBE_TIMEOUT};
pub use registry::MachineRegistry;
pub use service::{default_ssh_config, default_ssh_program, MachineService};