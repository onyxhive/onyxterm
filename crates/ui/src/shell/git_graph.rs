use super::file_tree_input::reveal_strategy;
use super::text_input::FieldTarget;
use super::toast::ToastTone;
use super::{Shell, DOWN_KEY, ENTER_KEY, ESCAPE_KEY, UP_KEY};
use crate::git_graph::{
    derive_graph_owner, graph_key, moved_position, read_commit_details, read_graph, read_repo_probe,
    reconcile_selection, resolve_graph_toggle, should_load_more, visible_commits, Commit, CommitDetails, GraphKey,
    GraphSnapshot, GraphToggle, GraphToggleSource, LaneRow, RepoProbe, COMMIT_LIMIT_STEP, INITIAL_COMMIT_LIMIT,
};
use crate::git_status::{read_git_summary, GitSummary};
use crate::text_field::TextField;
use domain::{Panel, PanelId};
use gpui::{point, px, Context, Keystroke, ScrollHandle, ScrollStrategy, Task, UniformListScrollHandle};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use workspace_service::PanelSnapshot;

pub(super) const GIT_GRAPH_TITLE: &str = "Git graph";
const LOCAL_TERMINALS_ONLY: &str = "Git graph is available for local terminals";
const OWNER_WIDTH_RATIO: f32 = 2.0 / 3.0;
const FINGERPRINT_CHECK_INTERVAL: Duration = Duration::from_secs(5);
const PANE_GIT_DEBOUNCE: Duration = Duration::from_millis(250);
const DETAILS_DEBOUNCE: Duration = Duration::from_millis(120);

pub(super) struct GitGraphPane {
    pub owner: PanelId,
    pub commits: Arc<Vec<Commit>>,
    pub rows: Arc<Vec<LaneRow>>,
    pub visible: Arc<Vec<usize>>,
    pub repo: Option<RepoProbe>,
    pub has_loaded: bool,
    pub filter: TextField,
    pub is_filtering: bool,
    pub selected: Option<String>,
    pub details: Option<CommitDetails>,
    pub scroll: UniformListScrollHandle,
    pub details_scroll: ScrollHandle,
    dir: PathBuf,
    limit: usize,
    load: Option<Task<()>>,
    probe_check: Option<Task<()>>,
    details_load: Option<Task<()>>,
}

impl GitGraphPane {
    fn new(owner: PanelId, dir: PathBuf) -> Self {
        Self {
            owner,
            commits: Arc::default(),
            rows: Arc::default(),
            visible: Arc::default(),
            repo: None,
            has_loaded: false,
            filter: TextField::default(),
            is_filtering: false,
            selected: None,
            details: None,
            scroll: UniformListScrollHandle::new(),
            details_scroll: ScrollHandle::new(),
            dir,
            limit: INITIAL_COMMIT_LIMIT,
            load: None,
            probe_check: None,
            details_load: None,
        }
    }

    pub(super) fn selected_commit(&self) -> Option<&Commit> {
        let hash = self.selected.as_deref()?;
        self.commits.iter().find(|commit| commit.hash == hash)
    }

    pub(super) fn selected_details(&self) -> Option<&CommitDetails> {
        self.details.as_ref().filter(|details| Some(details.hash.as_str()) == self.selected.as_deref())
    }

    pub(super) fn selected_position(&self) -> Option<usize> {
        let hash = self.selected.as_deref()?;
        self.visible.iter().position(|index| self.commits.get(*index).is_some_and(|commit| commit.hash == hash))
    }

    fn root(&self) -> Option<&Path> {
        self.repo.as_ref().map(|repo| repo.root.as_path())
    }

    fn is_current(&self, probe: &Option<RepoProbe>) -> bool {
        self.has_loaded && self.repo == *probe
    }

    fn apply_filter(&mut self) {
        self.visible = Arc::new(visible_commits(&self.commits, self.filter.text()));
        self.selected = reconcile_selection(&self.commits, &self.visible, self.selected.as_deref());
    }

    fn apply_snapshot(&mut self, snapshot: GraphSnapshot) {
        let is_other_repo = self.root() != snapshot.probe.as_ref().map(|probe| probe.root.as_path());
        if is_other_repo {
            self.selected = None;
            self.details = None;
            self.filter.clear();
            self.is_filtering = false;
            self.scroll.scroll_to_item(0, ScrollStrategy::Top);
        }
        self.repo = snapshot.probe;
        self.commits = snapshot.commits;
        self.rows = snapshot.rows;
        self.has_loaded = true;
        self.load = None;
        self.apply_filter();
    }
}

pub(super) fn poll_git_graphs(cx: &mut Context<Shell>) -> Task<()> {
    cx.spawn(async move |shell, cx| loop {
        cx.background_executor().timer(FINGERPRINT_CHECK_INTERVAL).await;
        if shell.update(cx, |shell, cx| shell.refresh_visible_git_graphs(cx)).is_err() {
            break;
        }
    })
}

impl Shell {
    pub(super) fn git_graph_of(&self, owner: PanelId) -> Option<PanelId> {
        self.git_graph_panes.iter().find(|(_, pane)| pane.owner == owner).map(|(graph, _)| *graph)
    }

    pub(super) fn focused_git_graph(&self) -> Option<PanelId> {
        self.focused_panel().filter(|panel| self.git_graph_panes.contains_key(panel))
    }

    pub(super) fn focused_git_graph_filter(&self) -> Option<&TextField> {
        self.git_graph_panes.get(&self.focused_git_graph()?).map(|pane| &pane.filter)
    }

    pub(super) fn focused_git_graph_filter_mut(&mut self) -> Option<&mut TextField> {
        let graph = self.focused_git_graph()?;
        self.git_graph_panes.get_mut(&graph).map(|pane| &mut pane.filter)
    }

    pub(super) fn is_git_graph_filter_active(&self) -> bool {
        let pane = self.focused_git_graph().and_then(|graph| self.git_graph_panes.get(&graph));
        pane.is_some_and(|pane| pane.is_filtering)
    }

    pub(super) fn git_graph_title(&self, panel: PanelId) -> Option<String> {
        let pane = self.git_graph_panes.get(&panel)?;
        let explicit = self.model.panel(panel).and_then(|record| record.name.clone());
        let repo = pane.repo.as_ref().map(RepoProbe::repo_name);
        Some(explicit.or(repo).unwrap_or_else(|| GIT_GRAPH_TITLE.to_string()))
    }

    pub(super) fn git_graph_summary(&self, panel: PanelId) -> Option<&GitSummary> {
        let owner = self.git_graph_panes.get(&panel)?.owner;
        self.panes.get(&owner)?.git.as_ref()
    }

    pub(super) fn toggle_focused_git_graph(&mut self, cx: &mut Context<Self>) {
        let Some(focused) = self.focused_panel() else {
            return;
        };
        match resolve_graph_toggle(self.git_graph_toggle_source(focused)) {
            GraphToggle::Open { owner } => {
                if let Some(graph) = self.open_git_graph(owner, cx) {
                    self.focus_pane(graph);
                }
            }
            GraphToggle::Close { graph } => self.close_pane(graph, cx),
            GraphToggle::Unavailable => self.show_toast(LOCAL_TERMINALS_ONLY, ToastTone::Info, cx),
        }
    }

    pub(super) fn toggle_git_graph_of(&mut self, owner: PanelId, cx: &mut Context<Self>) {
        match self.git_graph_of(owner) {
            Some(graph) => self.close_pane(graph, cx),
            None => {
                self.open_git_graph(owner, cx);
            }
        }
        self.persist();
    }

    fn git_graph_toggle_source(&self, focused: PanelId) -> GraphToggleSource {
        if self.git_graph_panes.contains_key(&focused) {
            return GraphToggleSource::Graph { panel: focused };
        }
        if self.model.is_local_terminal(focused) {
            return GraphToggleSource::LocalTerminal { panel: focused, graph: self.git_graph_of(focused) };
        }
        GraphToggleSource::Other
    }

    fn open_git_graph(&mut self, owner: PanelId, cx: &mut Context<Self>) -> Option<PanelId> {
        let graph = PanelId::new();
        let cwd = self.panel_cwd(owner);
        self.model.add_panel(PanelSnapshot {
            panel: Panel::new_git_graph(graph, GIT_GRAPH_TITLE.to_string()),
            cwd: cwd.clone(),
            name: None,
            path: None,
            documents: Vec::new(),
        });
        let tab = self.model.tabs_mut().active_mut()?;
        if let Err(err) = tab.attach_right_of(owner, graph, OWNER_WIDTH_RATIO) {
            tracing::warn!(?err, "open git graph failed");
            return None;
        }
        self.git_graph_panes.insert(graph, GitGraphPane::new(owner, cwd));
        self.load_git_graph(graph, cx);
        Some(graph)
    }

    pub(super) fn restore_git_graph_pane(&mut self, graph: PanelId, cx: &mut Context<Self>) {
        if self.git_graph_panes.contains_key(&graph) {
            return;
        }
        let Some(owner) = self.derive_restored_owner(graph) else {
            tracing::debug!(%graph, "closing a restored git graph with no terminal to follow");
            self.close_pane(graph, cx);
            return;
        };
        let cwd = self.panel_cwd(owner);
        self.git_graph_panes.insert(graph, GitGraphPane::new(owner, cwd));
        self.load_git_graph(graph, cx);
    }

    fn derive_restored_owner(&self, graph: PanelId) -> Option<PanelId> {
        let layout = self.model.tab_layout_of(graph)?;
        derive_graph_owner(layout, graph, |panel| {
            self.model.is_local_terminal(panel) && self.git_graph_of(panel).is_none()
        })
    }

    pub(super) fn close_separated_git_graphs(&mut self, cx: &mut Context<Self>) {
        let separated: Vec<PanelId> = self
            .git_graph_panes
            .iter()
            .filter(|(graph, pane)| self.model.locate(**graph) != self.model.locate(pane.owner))
            .map(|(graph, _)| *graph)
            .collect();
        for graph in separated {
            self.close_pane(graph, cx);
        }
    }

    fn load_git_graph(&mut self, graph: PanelId, cx: &mut Context<Self>) {
        let Some(pane) = self.git_graph_panes.get_mut(&graph) else {
            return;
        };
        let dir = pane.dir.clone();
        let limit = pane.limit;
        pane.load = Some(cx.spawn(async move |shell, cx| {
            let snapshot = cx.background_executor().spawn(async move { read_graph(&dir, limit) }).await;
            let updated = shell.update(cx, |shell, cx| shell.apply_git_graph_snapshot(graph, snapshot, cx));
            if let Err(err) = updated {
                tracing::debug!(?err, "shell dropped before the git graph loaded");
            }
        }));
    }

    fn apply_git_graph_snapshot(&mut self, graph: PanelId, snapshot: GraphSnapshot, cx: &mut Context<Self>) {
        if let Some(pane) = self.git_graph_panes.get_mut(&graph) {
            pane.apply_snapshot(snapshot);
        }
        self.schedule_git_commit_details(graph, cx);
        cx.notify();
    }

    fn refresh_git_graph(&mut self, graph: PanelId, cx: &mut Context<Self>) {
        let Some(pane) = self.git_graph_panes.get_mut(&graph) else {
            return;
        };
        if pane.load.is_some() || pane.probe_check.is_some() {
            return;
        }
        let dir = pane.dir.clone();
        pane.probe_check = Some(cx.spawn(async move |shell, cx| {
            let probe = cx.background_executor().spawn(async move { read_repo_probe(&dir) }).await;
            let updated = shell.update(cx, |shell, cx| shell.apply_git_graph_probe(graph, probe, cx));
            if let Err(err) = updated {
                tracing::debug!(?err, "shell dropped before the git fingerprint check finished");
            }
        }));
    }

    fn apply_git_graph_probe(&mut self, graph: PanelId, probe: Option<RepoProbe>, cx: &mut Context<Self>) {
        let Some(pane) = self.git_graph_panes.get_mut(&graph) else {
            return;
        };
        pane.probe_check = None;
        if pane.is_current(&probe) {
            return;
        }
        if pane.root() != probe.as_ref().map(|probe| probe.root.as_path()) {
            pane.limit = INITIAL_COMMIT_LIMIT;
        }
        self.load_git_graph(graph, cx);
    }

    fn retarget_git_graph(&mut self, graph: PanelId, dir: PathBuf, cx: &mut Context<Self>) {
        if let Some(record) = self.model.panel_mut(graph) {
            record.cwd = dir.clone();
        }
        if let Some(pane) = self.git_graph_panes.get_mut(&graph) {
            pane.dir = dir;
            pane.load = None;
            pane.probe_check = None;
        }
        self.refresh_git_graph(graph, cx);
    }

    pub(super) fn refresh_visible_git_graphs(&mut self, cx: &mut Context<Self>) {
        if !self.is_window_active {
            return;
        }
        let Some(tab) = self.model.tabs().active() else {
            return;
        };
        let is_covered = |panel: &PanelId| tab.is_maximized() && tab.focused() != *panel;
        let shown = tab.layout().leaves().into_iter().filter(|panel| !is_covered(panel));
        let graphs: Vec<PanelId> = shown.filter(|panel| self.git_graph_panes.contains_key(panel)).collect();
        for graph in graphs {
            self.refresh_git_graph(graph, cx);
        }
    }

    pub(super) fn refresh_pane_git(&mut self, panel: PanelId, cx: &mut Context<Self>) {
        self.schedule_pane_git_read(panel, cx);
        if let Some(graph) = self.git_graph_of(panel) {
            self.refresh_git_graph(graph, cx);
        }
    }

    pub(super) fn refresh_shown_pane_git(&mut self, cx: &mut Context<Self>) {
        let leaves = self.model.tabs().active().map(|tab| tab.layout().leaves()).unwrap_or_default();
        for panel in leaves {
            self.refresh_pane_git(panel, cx);
        }
    }

    pub(super) fn on_pane_cwd_changed(&mut self, panel: PanelId, dir: PathBuf, cx: &mut Context<Self>) {
        self.schedule_pane_git_read(panel, cx);
        if let Some(graph) = self.git_graph_of(panel) {
            self.retarget_git_graph(graph, dir, cx);
        }
    }

    pub(super) fn sync_git_focus(&mut self, cx: &mut Context<Self>) {
        let focused = self.focused_panel();
        if focused == self.git_focus {
            return;
        }
        self.git_focus = focused;
        let Some(panel) = focused else {
            return;
        };
        let owner = self.git_graph_panes.get(&panel).map_or(panel, |pane| pane.owner);
        self.refresh_pane_git(owner, cx);
    }

    fn schedule_pane_git_read(&mut self, panel: PanelId, cx: &mut Context<Self>) {
        let dir = self.panel_cwd(panel);
        let Some(pane) = self.panes.get_mut(&panel).filter(|pane| pane.host.is_local()) else {
            return;
        };
        pane.git_refresh = Some(cx.spawn(async move |shell, cx| {
            cx.background_executor().timer(PANE_GIT_DEBOUNCE).await;
            let summary = cx.background_executor().spawn(async move { read_git_summary(&dir) }).await;
            let updated = shell.update(cx, |shell, cx| shell.apply_pane_git(panel, summary, cx));
            if let Err(err) = updated {
                tracing::debug!(?err, "shell dropped before the pane git read finished");
            }
        }));
    }

    fn apply_pane_git(&mut self, panel: PanelId, summary: Option<GitSummary>, cx: &mut Context<Self>) {
        let Some(pane) = self.panes.get_mut(&panel) else {
            return;
        };
        pane.git_refresh = None;
        if pane.git != summary {
            pane.git = summary;
            cx.notify();
        }
    }

    pub(super) fn handle_git_graph_key(
        &mut self,
        graph: PanelId,
        keystroke: &Keystroke,
        cx: &mut Context<Self>,
    ) -> bool {
        if self.git_graph_panes.get(&graph).is_some_and(|pane| pane.is_filtering) {
            return self.handle_git_graph_filter_key(graph, keystroke, cx);
        }
        match graph_key(keystroke) {
            Some(GraphKey::Move(delta)) => self.move_git_graph_selection(graph, delta, cx),
            Some(GraphKey::StartFilter) => self.start_git_graph_filter(graph),
            Some(GraphKey::ClearFilter) => return self.clear_git_graph_filter(graph, cx),
            None => return false,
        }
        cx.notify();
        true
    }

    fn handle_git_graph_filter_key(&mut self, graph: PanelId, keystroke: &Keystroke, cx: &mut Context<Self>) -> bool {
        match keystroke.key.as_str() {
            ESCAPE_KEY => {
                self.clear_git_graph_filter(graph, cx);
            }
            ENTER_KEY => self.stop_git_graph_filter(graph),
            UP_KEY => self.move_git_graph_selection(graph, -1, cx),
            DOWN_KEY => self.move_git_graph_selection(graph, 1, cx),
            _ => return self.edit_field(FieldTarget::GitGraphQuery, keystroke, cx),
        }
        cx.notify();
        true
    }

    fn start_git_graph_filter(&mut self, graph: PanelId) {
        if let Some(pane) = self.git_graph_panes.get_mut(&graph) {
            pane.is_filtering = true;
        }
    }

    fn stop_git_graph_filter(&mut self, graph: PanelId) {
        if let Some(pane) = self.git_graph_panes.get_mut(&graph) {
            pane.is_filtering = false;
        }
    }

    fn clear_git_graph_filter(&mut self, graph: PanelId, cx: &mut Context<Self>) -> bool {
        let Some(pane) = self.git_graph_panes.get_mut(&graph) else {
            return false;
        };
        let had_filter = pane.is_filtering || !pane.filter.is_empty();
        pane.is_filtering = false;
        pane.filter.clear();
        pane.apply_filter();
        if let Some(position) = pane.selected_position() {
            pane.scroll.scroll_to_item(position, ScrollStrategy::Center);
        }
        self.schedule_git_commit_details(graph, cx);
        cx.notify();
        had_filter
    }

    pub(super) fn on_git_graph_query_edited(&mut self, cx: &mut Context<Self>) {
        let Some(graph) = self.focused_git_graph() else {
            return;
        };
        if let Some(pane) = self.git_graph_panes.get_mut(&graph) {
            pane.apply_filter();
            pane.scroll.scroll_to_item(pane.selected_position().unwrap_or(0), ScrollStrategy::Top);
        }
        self.schedule_git_commit_details(graph, cx);
    }

    fn move_git_graph_selection(&mut self, graph: PanelId, delta: isize, cx: &mut Context<Self>) {
        let Some(pane) = self.git_graph_panes.get_mut(&graph) else {
            return;
        };
        let Some(position) = moved_position(pane.selected_position(), delta, pane.visible.len()) else {
            return;
        };
        pane.scroll.scroll_to_item(position, reveal_strategy(delta));
        let commit = pane.visible.get(position).and_then(|index| pane.commits.get(*index));
        if let Some(hash) = commit.map(|commit| commit.hash.clone()) {
            self.select_git_graph_commit(graph, hash, cx);
        }
    }

    pub(super) fn select_git_graph_commit(&mut self, graph: PanelId, hash: String, cx: &mut Context<Self>) {
        let Some(pane) = self.git_graph_panes.get_mut(&graph) else {
            return;
        };
        if pane.selected.as_deref() != Some(hash.as_str()) {
            pane.selected = Some(hash);
            pane.details_scroll.set_offset(point(px(0.0), px(0.0)));
        }
        self.schedule_git_commit_details(graph, cx);
        cx.notify();
    }

    fn schedule_git_commit_details(&mut self, graph: PanelId, cx: &mut Context<Self>) {
        let Some(pane) = self.git_graph_panes.get_mut(&graph) else {
            return;
        };
        let Some(hash) = pane.selected.clone() else {
            pane.details_load = None;
            return;
        };
        if pane.selected_details().is_some() {
            pane.details_load = None;
            return;
        }
        let dir = pane.root().map_or_else(|| pane.dir.clone(), Path::to_path_buf);
        pane.details_load = Some(cx.spawn(async move |shell, cx| {
            cx.background_executor().timer(DETAILS_DEBOUNCE).await;
            let details = cx.background_executor().spawn(async move { read_commit_details(&dir, &hash) }).await;
            let updated = shell.update(cx, |shell, cx| shell.apply_git_commit_details(graph, details, cx));
            if let Err(err) = updated {
                tracing::debug!(?err, "shell dropped before commit details loaded");
            }
        }));
    }

    fn apply_git_commit_details(&mut self, graph: PanelId, details: Option<CommitDetails>, cx: &mut Context<Self>) {
        let Some(pane) = self.git_graph_panes.get_mut(&graph) else {
            return;
        };
        pane.details_load = None;
        let Some(details) = details.filter(|details| pane.selected.as_deref() == Some(details.hash.as_str())) else {
            return;
        };
        pane.details = Some(details);
        cx.notify();
    }

    pub(super) fn load_more_git_commits_near(&mut self, graph: PanelId, visible_end: usize, cx: &mut Context<Self>) {
        let Some(pane) = self.git_graph_panes.get_mut(&graph) else {
            return;
        };
        let is_idle = pane.load.is_none() && pane.filter.is_empty();
        if !is_idle || !should_load_more(visible_end, pane.commits.len(), pane.limit) {
            return;
        }
        pane.limit += COMMIT_LIMIT_STEP;
        self.load_git_graph(graph, cx);
    }

    pub(super) fn open_git_graph_file(&mut self, graph: PanelId, file: &str, cx: &mut Context<Self>) {
        let Some(root) = self.git_graph_panes.get(&graph).and_then(|pane| pane.root()).map(Path::to_path_buf) else {
            return;
        };
        self.open_file(root.join(file), cx);
    }
}
