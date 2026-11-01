use crate::id::{AgentId, DocumentId, PanelId, TerminalSessionId};
use crate::machine::MachineId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PanelKind {
    Terminal,
    Agent,
    Editor,
    FileTree,
    Machines,
    GitGraph,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ResourceRef {
    Terminal(TerminalSessionId),
    Agent(AgentId),
    Document(DocumentId),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Panel {
    pub id: PanelId,
    pub kind: PanelKind,
    pub title: String,
    pub resource: ResourceRef,
    /// The machine this panel runs on: this computer, or a remote one.
    pub host: MachineId,
}

impl Panel {
    pub fn new_terminal(id: PanelId, title: String, session: TerminalSessionId) -> Self {
        Self::new_terminal_on(id, title, session, MachineId::local())
    }

    pub fn new_terminal_on(
        id: PanelId,
        title: String,
        session: TerminalSessionId,
        host: MachineId,
    ) -> Self {
        Self { id, kind: PanelKind::Terminal, title, resource: ResourceRef::Terminal(session), host }
    }

    pub fn new_agent(id: PanelId, title: String, agent: AgentId) -> Self {
        Self { id, kind: PanelKind::Agent, title, resource: ResourceRef::Agent(agent), host: MachineId::local() }
    }

    pub fn new_machines(id: PanelId, title: String) -> Self {
        Self::new_document(id, PanelKind::Machines, title)
    }

    pub fn new_git_graph(id: PanelId, title: String) -> Self {
        Self::new_document(id, PanelKind::GitGraph, title)
    }

    pub fn new_editor(id: PanelId, title: String) -> Self {
        Self::new_document(id, PanelKind::Editor, title)
    }

    pub fn new_file_tree(id: PanelId, title: String) -> Self {
        Self::new_document(id, PanelKind::FileTree, title)
    }

    pub fn is_document(&self) -> bool {
        matches!(self.kind, PanelKind::Editor | PanelKind::FileTree)
    }

    /// True for panes that own a PTY, local or remote.
    pub fn is_terminal_like(&self) -> bool {
        matches!(self.kind, PanelKind::Terminal | PanelKind::Agent)
    }

    fn new_document(id: PanelId, kind: PanelKind, title: String) -> Self {
        Self {
            id,
            kind,
            title,
            resource: ResourceRef::Document(DocumentId::new()),
            host: MachineId::local(),
        }
    }
}
