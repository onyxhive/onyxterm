use domain::{LayoutNode, MachineId, Panel, PanelId, PanelKind, Tab, TabId, TerminalSessionId, Workspace, WorkspaceId};
use persistence::{PanelSnapshot, Repository, TabSnapshot, WorkspaceSnapshot};
use std::path::{Path, PathBuf};
use tempfile::TempDir;

fn workspace_with_tab(name: &str, cwd: &str) -> (Workspace, TabSnapshot) {
    let mut workspace = Workspace::new(WorkspaceId::new(), name.to_string());
    let panel_id = PanelId::new();
    let tab = Tab::new(TabId::new(), workspace.id, LayoutNode::leaf(panel_id));
    workspace.tab_order = vec![tab.id];
    workspace.active_tab = Some(tab.id);
    let panel = Panel::new_terminal(panel_id, "Terminal".into(), TerminalSessionId::new());
    let panels = vec![PanelSnapshot { panel, cwd: PathBuf::from(cwd), name: Some(format!("{name} pane")), path: None, documents: Vec::new() }];
    (workspace, TabSnapshot { tab, panels })
}

#[test]
fn snapshot_roundtrip_replaces_previous_state() {
    let dir = TempDir::new().expect("tempdir");
    let repo = Repository::open(&dir.path().join("snap.db")).expect("open");
    let (first_ws, first_tab) = workspace_with_tab("First", "/first");
    let (second_ws, second_tab) = workspace_with_tab("Second", "/second");
    let full = WorkspaceSnapshot {
        workspaces: vec![first_ws.clone(), second_ws.clone()],
        tabs: vec![first_tab.clone(), second_tab],
        agents: Vec::new(),
        active_workspace: Some(second_ws.id),
    };
    repo.write_snapshot(&full).expect("write full");

    let trimmed = WorkspaceSnapshot {
        workspaces: vec![first_ws.clone()],
        tabs: vec![first_tab.clone()],
        agents: Vec::new(),
        active_workspace: Some(first_ws.id),
    };
    repo.write_snapshot(&trimmed).expect("write trimmed");

    let loaded = repo.load_snapshot(Path::new("/default")).expect("load");
    assert!(loaded.warnings.is_empty());
    assert_eq!(loaded.snapshot, trimmed);
}

#[test]
fn editor_panel_roundtrips_kind_and_path() {
    let dir = TempDir::new().expect("tempdir");
    let repo = Repository::open(&dir.path().join("snap.db")).expect("open");
    let mut workspace = Workspace::new(WorkspaceId::new(), "Code".to_string());
    let editor_id = PanelId::new();
    let tab = Tab::new(TabId::new(), workspace.id, LayoutNode::leaf(editor_id));
    workspace.tab_order = vec![tab.id];
    workspace.active_tab = Some(tab.id);
    let editor = PanelSnapshot {
        panel: Panel::new_editor(editor_id, "main.rs".into()),
        cwd: PathBuf::from("/code/src"),
        name: None,
        path: Some(PathBuf::from("/code/src/main.rs")),
        documents: Vec::new(),
    };
    let snapshot = WorkspaceSnapshot {
        workspaces: vec![workspace.clone()],
        tabs: vec![TabSnapshot { tab, panels: vec![editor.clone()] }],
        agents: Vec::new(),
        active_workspace: Some(workspace.id),
    };
    repo.write_snapshot(&snapshot).expect("write");

    let loaded = repo.load_snapshot(Path::new("/default")).expect("load");
    assert_eq!(loaded.snapshot.tabs[0].panels, vec![editor]);
}

fn editor_snapshot(documents: Vec<PathBuf>, active: &str) -> (WorkspaceSnapshot, PanelSnapshot) {
    let mut workspace = Workspace::new(WorkspaceId::new(), "Code".to_string());
    let editor_id = PanelId::new();
    let tab = Tab::new(TabId::new(), workspace.id, LayoutNode::leaf(editor_id));
    workspace.tab_order = vec![tab.id];
    workspace.active_tab = Some(tab.id);
    let editor = PanelSnapshot {
        panel: Panel::new_editor(editor_id, "lib.rs".into()),
        cwd: PathBuf::from("/code/src"),
        name: None,
        path: Some(PathBuf::from(active)),
        documents,
    };
    let snapshot = WorkspaceSnapshot {
        workspaces: vec![workspace.clone()],
        tabs: vec![TabSnapshot { tab, panels: vec![editor.clone()] }],
        agents: Vec::new(),
        active_workspace: Some(workspace.id),
    };
    (snapshot, editor)
}

#[test]
fn editor_panel_roundtrips_every_open_document_and_the_active_one() {
    let dir = TempDir::new().expect("tempdir");
    let repo = Repository::open(&dir.path().join("snap.db")).expect("open");
    let documents = vec![PathBuf::from("/code/src/main.rs"), PathBuf::from("/code/src/lib.rs")];
    let (snapshot, editor) = editor_snapshot(documents, "/code/src/lib.rs");
    repo.write_snapshot(&snapshot).expect("write");

    let loaded = repo.load_snapshot(Path::new("/default")).expect("load");
    assert_eq!(loaded.snapshot.tabs[0].panels, vec![editor]);
}

#[test]
fn editor_row_without_a_document_list_keeps_its_single_path() {
    let dir = TempDir::new().expect("tempdir");
    let repo = Repository::open(&dir.path().join("snap.db")).expect("open");
    let (snapshot, _) = editor_snapshot(vec![PathBuf::from("/code/src/main.rs")], "/code/src/main.rs");
    repo.write_snapshot(&snapshot).expect("write");
    repo.pool().with_conn(|conn| conn.execute("UPDATE panels SET documents = NULL", [])).expect("clear documents");

    let loaded = repo.load_snapshot(Path::new("/default")).expect("load");
    let panel = &loaded.snapshot.tabs[0].panels[0];
    assert_eq!(panel.path, Some(PathBuf::from("/code/src/main.rs")));
    assert!(panel.documents.is_empty());
}

#[test]
fn remote_panel_roundtrips_its_machine() {
    let dir = TempDir::new().expect("tempdir");
    let repo = Repository::open(&dir.path().join("snap.db")).expect("open");
    let mut workspace = Workspace::new(WorkspaceId::new(), "Fleet".to_string());
    let remote_id = PanelId::new();
    let tab = Tab::new(TabId::new(), workspace.id, LayoutNode::leaf(remote_id));
    workspace.tab_order = vec![tab.id];
    workspace.active_tab = Some(tab.id);
    let remote = PanelSnapshot {
        panel: Panel::new_terminal_on(
            remote_id,
            "nas".into(),
            TerminalSessionId::new(),
            MachineId::from_alias("nas"),
        ),
        cwd: PathBuf::from("/srv/app"),
        name: None,
        path: None,
        documents: Vec::new(),
    };
    let snapshot = WorkspaceSnapshot {
        workspaces: vec![workspace.clone()],
        tabs: vec![TabSnapshot { tab, panels: vec![remote.clone()] }],
        agents: Vec::new(),
        active_workspace: Some(workspace.id),
    };
    repo.write_snapshot(&snapshot).expect("write");

    let loaded = repo.load_snapshot(Path::new("/default")).expect("load");
    assert_eq!(loaded.snapshot.tabs[0].panels, vec![remote]);
}

#[test]
fn panel_saved_before_machines_stays_on_this_computer() {
    let dir = TempDir::new().expect("tempdir");
    let repo = Repository::open(&dir.path().join("snap.db")).expect("open");
    let (workspace, tab) = workspace_with_tab("Local", "/local");
    let snapshot = WorkspaceSnapshot {
        workspaces: vec![workspace.clone()],
        tabs: vec![tab],
        agents: Vec::new(),
        active_workspace: Some(workspace.id),
    };
    repo.write_snapshot(&snapshot).expect("write");
    repo.pool().with_conn(|conn| conn.execute("UPDATE panels SET host = NULL", [])).expect("clear host");

    let loaded = repo.load_snapshot(Path::new("/default")).expect("load");
    assert_eq!(loaded.snapshot.tabs[0].panels[0].panel.host, MachineId::local());
}

#[test]
fn machines_panel_kind_roundtrips() {
    let dir = TempDir::new().expect("tempdir");
    let repo = Repository::open(&dir.path().join("snap.db")).expect("open");
    let mut workspace = Workspace::new(WorkspaceId::new(), "Fleet".to_string());
    let panel_id = PanelId::new();
    let tab = Tab::new(TabId::new(), workspace.id, LayoutNode::leaf(panel_id));
    workspace.tab_order = vec![tab.id];
    workspace.active_tab = Some(tab.id);
    let machines = PanelSnapshot {
        panel: Panel::new_machines(panel_id, "Machines".into()),
        cwd: PathBuf::from("/default"),
        name: None,
        path: None,
        documents: Vec::new(),
    };
    let snapshot = WorkspaceSnapshot {
        workspaces: vec![workspace.clone()],
        tabs: vec![TabSnapshot { tab, panels: vec![machines.clone()] }],
        agents: Vec::new(),
        active_workspace: Some(workspace.id),
    };
    repo.write_snapshot(&snapshot).expect("write");

    let loaded = repo.load_snapshot(Path::new("/default")).expect("load");
    assert_eq!(loaded.snapshot.tabs[0].panels, vec![machines]);
    assert_eq!(loaded.snapshot.tabs[0].panels[0].panel.kind, PanelKind::Machines);
}

#[test]
fn git_graph_panel_kind_roundtrips() {
    let dir = TempDir::new().expect("tempdir");
    let repo = Repository::open(&dir.path().join("snap.db")).expect("open");
    let mut workspace = Workspace::new(WorkspaceId::new(), "Graphs".to_string());
    let panel_id = PanelId::new();
    let tab = Tab::new(TabId::new(), workspace.id, LayoutNode::leaf(panel_id));
    workspace.tab_order = vec![tab.id];
    workspace.active_tab = Some(tab.id);
    let graph = PanelSnapshot {
        panel: Panel::new_git_graph(panel_id, "Git graph".into()),
        cwd: PathBuf::from("/default"),
        name: None,
        path: None,
        documents: Vec::new(),
    };
    let snapshot = WorkspaceSnapshot {
        workspaces: vec![workspace.clone()],
        tabs: vec![TabSnapshot { tab, panels: vec![graph.clone()] }],
        agents: Vec::new(),
        active_workspace: Some(workspace.id),
    };
    repo.write_snapshot(&snapshot).expect("write");

    let loaded = repo.load_snapshot(Path::new("/default")).expect("load");
    assert_eq!(loaded.snapshot.tabs[0].panels, vec![graph]);
    assert_eq!(loaded.snapshot.tabs[0].panels[0].panel.kind, PanelKind::GitGraph);
}
