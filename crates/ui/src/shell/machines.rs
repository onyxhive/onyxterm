use super::toast::ToastTone;
use super::{Shell, DOWN_KEY, ENTER_KEY, ESCAPE_KEY, UP_KEY};
use super::text_input::FieldTarget;
use crate::theme::Theme;
use crate::text_field::TextField;
use domain::{DropZone, Machine, MachineId, MachineSource, Panel, PanelId};
use gpui::{
    div, prelude::*, px, uniform_list, AnyElement, App, Context, Div, FontWeight, Hsla, IntoElement, Keystroke,
    MouseButton, SharedString, UniformListScrollHandle, Window,
};
use machine_service::{MachineRegistry, MachineSnapshot, MachineService, MachineStatus};
use std::ops::Range;
use std::sync::Arc;
use workspace_service::PanelSnapshot;

pub const MACHINES_TITLE: &str = "Machines";
pub const MACHINES_ADDED_KEY: &str = "machines.added";
const FILTER_HINT: &str = "Type to filter  \u{2022}  \u{21b5} opens a shell there";
const EMPTY_MESSAGE: &str = "No machines match";
const LOCAL_DETAIL: &str = "this computer";
const NOT_CHECKED: &str = "not checked yet";
const ROW_GAP_PX: f32 = 8.0;
const ROW_PADDING_X_PX: f32 = 10.0;
const ROW_PADDING_Y_PX: f32 = 7.0;
const ROW_RADIUS_PX: f32 = 7.0;
const DOT_PX: f32 = 7.0;
const NAME_PX: f32 = 13.0;
const DETAIL_PX: f32 = 11.5;
const METER_WIDTH_PX: f32 = 40.0;
const METER_HEIGHT_PX: f32 = 3.0;
const METER_GAP_PX: f32 = 6.0;
const BUSY_WARNING: f32 = 0.75;
const BUSY_ALARM: f32 = 0.9;
const ADD_MACHINE_TITLE: &str = "Add machine";
const ADD_MACHINE_HINT: &str =
    "Any host you can reach with ssh. Hosts in your ssh config already show up on their own.";
const DIALOG_GAP_PX: f32 = 8.0;
const DIALOG_PADDING_TOP_PX: f32 = 20.0;
const DIALOG_PADDING_X_PX: f32 = 16.0;
const DIALOG_PADDING_BOTTOM_PX: f32 = 16.0;
const ADD_MACHINE_FOOTER: &str = "\u{21b5} add  \u{2022}  esc cancel";

#[derive(Default)]
pub(super) struct MachinePane {
    pub query: TextField,
    pub selection: usize,
    pub scroll: UniformListScrollHandle,
}

impl MachinePane {
    fn matches(&self, row: &MachineSnapshot) -> bool {
        let needle = self.query.text().trim().to_ascii_lowercase();
        if needle.is_empty() {
            return true;
        }
        row.name.to_ascii_lowercase().contains(&needle) || row.alias.to_ascii_lowercase().contains(&needle)
    }
}

/// Everything a row needs, copied out of the theme so list rows can outlive it.
#[derive(Clone, Copy)]
struct RowPaint {
    scale: f32,
    selected_fill: Hsla,
    raised: Hsla,
    accent: Hsla,
    name: Hsla,
    muted: Hsla,
    subtle: Hsla,
    warning: Hsla,
    running: Hsla,
    failed: Hsla,
    idle: Hsla,
    track: Hsla,
}

impl RowPaint {
    fn from_theme(theme: &Theme, scale: f32) -> Self {
        Self {
            scale,
            selected_fill: theme.chrome.control_fill,
            raised: theme.surface.raised,
            accent: theme.accent.primary,
            name: theme.text.default,
            muted: theme.text.muted,
            subtle: theme.text.subtle,
            warning: theme.chrome.warning,
            running: theme.status.running,
            failed: theme.status.failed,
            idle: theme.status.idle,
            track: theme.chrome.control_fill,
        }
    }
}

impl Shell {
    /// Focuses the machines pane, or opens one beside the focused pane.
    pub(super) fn open_machines_pane(&mut self, cx: &mut Context<Self>) {
        if let Some(panel) = self.model.machines_pane() {
            self.focus_pane(panel);
            cx.notify();
            return;
        }
        let panel = PanelId::new();
        let record = Panel::new_machines(panel, MACHINES_TITLE.to_string());
        self.model.add_panel(PanelSnapshot {
            panel: record,
            cwd: self.model.active_root(),
            name: None,
            path: None,
            documents: Vec::new(),
        });
        self.restore_document(panel, cx);
        let Some(tab) = self.model.tabs_mut().active_mut() else {
            self.discard_pane(panel, cx);
            return;
        };
        if let Err(err) = tab.insert_beside_focused(panel, DropZone::Left) {
            tracing::warn!(?err, "open machines pane failed");
            self.discard_pane(panel, cx);
            return;
        }
        self.focus_pane(panel);
        self.persist();
        cx.notify();
    }

    pub(super) fn restore_machines_pane(&mut self, panel: PanelId, cx: &mut Context<Self>) {
        self.machine_panes.entry(panel).or_default();
        self.machines.reload();
        cx.notify();
    }

    /// Opens the small "add a machine" prompt.
    pub(super) fn start_add_machine(&mut self, cx: &mut Context<Self>) {
        self.machine_dialog = Some(TextField::default());
        cx.notify();
    }

    pub(super) fn close_add_machine(&mut self, cx: &mut Context<Self>) {
        self.machine_dialog = None;
        cx.notify();
    }

    /// Adds the typed alias to the machine list and remembers it.
    pub(super) fn accept_add_machine(&mut self, cx: &mut Context<Self>) {
        let alias = self.machine_dialog.as_ref().map(|field| field.text().trim().to_string()).unwrap_or_default();
        self.machine_dialog = None;
        if alias.is_empty() {
            cx.notify();
            return;
        }
        let machine = Machine::remote(alias.clone(), alias.clone(), MachineSource::Added);
        let mut machines = self.machines.registry().added_serializable();
        machines.retain(|existing| existing.alias != machine.alias);
        machines.push(machine);
        self.machines.set_added(machines.clone());
        if let Err(err) = self.store.set_setting(MACHINES_ADDED_KEY, &added_to_settings(&machines)) {
            tracing::warn!(?err, "could not save added machines");
        }
        self.show_toast(format!("Added {alias}"), ToastTone::Success, cx);
        cx.notify();
    }

    /// Enter commits the alias; anything else types into it.
    pub(super) fn handle_add_machine_key(&mut self, keystroke: &Keystroke, cx: &mut Context<Self>) -> bool {
        match keystroke.key.as_str() {
            ESCAPE_KEY => self.close_add_machine(cx),
            ENTER_KEY => self.accept_add_machine(cx),
            _ => {
                self.edit_field(FieldTarget::MachineAlias, keystroke, cx);
            }
        }
        cx.notify();
        true
    }

    pub(super) fn render_add_machine_dialog(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = &self.state.theme;
        let dialog = theme.dialog;
        let alias = self.machine_dialog.as_ref().map(|field| field.text().to_string()).unwrap_or_default();
        let shown = if alias.is_empty() { "user@host or an ssh alias".to_string() } else { alias.clone() };
        let field_row = div()
            .w_full()
            .mt(px(DIALOG_GAP_PX))
            .h(px(dialog.button_height_px))
            .px(px(DIALOG_PADDING_X_PX))
            .flex()
            .items_center()
            .rounded(px(dialog.button_radius_px))
            .bg(theme.surface.sunken)
            .border(px(theme.palette.border_px))
            .border_color(theme.border.focus)
            .text_size(px(theme.ui_font.dialog_body_px))
            .text_color(if alias.is_empty() { theme.text.subtle } else { theme.text.default })
            .child(shown);
        div()
            .absolute()
            .inset_0()
            .occlude()
            .bg(theme.chrome.backdrop)
            .flex()
            .items_center()
            .justify_center()
            .on_mouse_down(MouseButton::Left, cx.listener(|shell, _event, _window, cx| shell.close_add_machine(cx)))
            .child(
                div()
                    .w(px(dialog.width_px))
                    .pt(px(DIALOG_PADDING_TOP_PX))
                    .px(px(DIALOG_PADDING_X_PX))
                    .pb(px(DIALOG_PADDING_BOTTOM_PX))
                    .font_family(SharedString::from(theme.ui_font.family.clone()))
                    .bg(theme.chrome.menu_fill)
                    .border(px(theme.palette.border_px))
                    .border_color(theme.border.default)
                    .rounded(px(dialog.radius_px))
                    .shadow(crate::theme::box_shadows(&theme.shadow.palette))
                    .flex()
                    .flex_col()
                    .gap(px(DIALOG_GAP_PX))
                    .child(
                        div()
                            .text_size(px(theme.ui_font.dialog_title_px))
                            .font_weight(FontWeight::BOLD)
                            .text_color(theme.text.default)
                            .child(ADD_MACHINE_TITLE),
                    )
                    .child(
                        div()
                            .text_size(px(theme.ui_font.dialog_body_px))
                            .text_color(theme.text.muted)
                            .child(ADD_MACHINE_HINT),
                    )
                    .child(field_row)
                    .child(
                        div()
                            .text_size(px(theme.ui_font.hint_px))
                            .text_color(theme.text.subtle)
                            .child(ADD_MACHINE_FOOTER),
                    ),
            )
    }

    pub(super) fn focused_machines_pane(&self) -> Option<PanelId> {
        let focused = self.model.tabs().active().map(|tab| tab.focused())?;
        self.model.is_machines(focused).then_some(focused)
    }

    fn machine_rows(&self, panel: PanelId) -> Vec<MachineSnapshot> {
        let Some(state) = self.machine_panes.get(&panel) else {
            return Vec::new();
        };
        self.machines.snapshot().into_iter().filter(|row| state.matches(row)).collect()
    }

    pub(super) fn open_machine_selection(&mut self, panel: PanelId, cx: &mut Context<Self>) {
        let rows = self.machine_rows(panel);
        let Some(selection) = self.machine_panes.get(&panel).map(|state| state.selection) else {
            return;
        };
        let Some(row) = rows.get(selection.min(rows.len().saturating_sub(1))).cloned() else {
            return;
        };
        self.open_machine_shell(row.id, cx);
    }

    /// Opens a pane on that machine, or a local shell for this computer.
    pub(super) fn open_machine_shell(&mut self, id: MachineId, cx: &mut Context<Self>) {
        let Some(machine) = self.machines.machine(&id) else {
            self.show_toast("That machine is no longer in your list", ToastTone::Failure, cx);
            return;
        };
        let is_local = machine.is_local();
        let name = machine.name.clone();
        let cwd = self.model.active_root();
        let Some(panel) = self.spawn_shell_panel_on(id, cwd, cx) else {
            return;
        };
        let Some(tab) = self.model.tabs_mut().active_mut() else {
            self.discard_pane(panel, cx);
            return;
        };
        if let Err(err) = tab.insert_beside_focused(panel, DropZone::Right) {
            tracing::warn!(?err, "open machine shell failed");
            self.discard_pane(panel, cx);
            return;
        }
        self.focus_pane(panel);
        self.persist();
        if !is_local {
            self.show_toast(format!("Connected to {name}"), ToastTone::Success, cx);
        }
    }

    /// Keeps the list in step with the focused pane: arrows move, \u{21b5} opens,
    /// anything else filters.
    pub(super) fn handle_machine_key(&mut self, panel: PanelId, keystroke: &Keystroke, cx: &mut Context<Self>) -> bool {
        let count = self.machine_rows(panel).len();
        self.machine_panes.entry(panel).or_default();
        let key = keystroke.key.clone();
        match key.as_str() {
            UP_KEY => {
                let state = self.machine_panes.entry(panel).or_default();
                state.selection = state.selection.saturating_sub(1);
            }
            DOWN_KEY => {
                let state = self.machine_panes.entry(panel).or_default();
                state.selection = if count == 0 { 0 } else { (state.selection + 1).min(count - 1) };
            }
            ENTER_KEY => {
                self.open_machine_selection(panel, cx);
                return true;
            }
            ESCAPE_KEY => {
                let state = self.machine_panes.entry(panel).or_default();
                if state.query.is_empty() {
                    return false;
                }
                state.query.clear();
                state.selection = 0;
            }
            _ => {
                if !self.edit_field(FieldTarget::MachineQuery, keystroke, cx) {
                    return false;
                }
                self.machine_panes.entry(panel).or_default().selection = 0;
            }
        }
        cx.notify();
        true
    }

    pub(super) fn on_machine_query_edited(&mut self, panel: PanelId) {
        if let Some(state) = self.machine_panes.get_mut(&panel) {
            state.selection = 0;
        }
    }

    pub(super) fn render_machines_pane(&self, panel: PanelId, _cx: &mut Context<Self>) -> impl IntoElement {
        let theme = &self.state.theme;
        let scale = self.state.settings.ui_scale;
        let paint = RowPaint::from_theme(theme, scale);
        let state = self.machine_panes.get(&panel);
        let query = state.map(|state| state.query.text().to_string()).unwrap_or_default();
        let selection = state.map(|state| state.selection).unwrap_or(0);
        let scroll = state.map(|state| state.scroll.clone()).unwrap_or_default();
        let rows = self.machine_rows(panel);
        let count = rows.len();
        let family = SharedString::from(theme.ui_font.family.clone());
        let list: AnyElement = if rows.is_empty() {
            empty_row(paint)
        } else {
            let rows = Arc::new(rows);
            uniform_list(
                SharedString::from(format!("machines-{panel}")),
                count,
                move |range: Range<usize>, _window: &mut Window, _app: &mut App| {
                    let mut out = Vec::with_capacity(range.len());
                    for index in range {
                        let Some(row) = rows.get(index) else { continue };
                        out.push(machine_row(row, index == selection, paint));
                    }
                    out
                },
            )
            .flex_1()
            .min_h(px(0.0))
            .track_scroll(scroll)
            .into_any_element()
        };
        div()
            .size_full()
            .flex()
            .flex_col()
            .gap(px(ROW_GAP_PX * scale))
            .p(px(ROW_PADDING_X_PX * scale))
            .font_family(family)
            .child(query_line(paint, query))
            .child(list)
            .child(footer(paint, count))
    }
}

fn machine_row(row: &MachineSnapshot, selected: bool, paint: RowPaint) -> Div {
    let scale = paint.scale;
    let health = row.status.health();
    let detail = if row.alias.is_empty() {
        LOCAL_DETAIL.to_string()
    } else {
        match health {
            Some(health) if !health.os.is_empty() => health.os.clone(),
            _ => row.alias.clone(),
        }
    };
    let reason = status_reason(row);
    let dot = status_color(&row.status, &paint);
    let memory = health.and_then(|health| health.memory_used_fraction());
    let disk = health.and_then(|health| health.disk_used_fraction());
    let name_color = if selected { paint.accent } else { paint.name };
    let weight = if selected { FontWeight::SEMIBOLD } else { FontWeight::NORMAL };
    div()
        .flex()
        .flex_col()
        .gap(px(2.0 * scale))
        .px(px(ROW_PADDING_X_PX * scale))
        .py(px(ROW_PADDING_Y_PX * scale))
        .rounded(px(ROW_RADIUS_PX * scale))
        .bg(if selected { paint.selected_fill } else { paint.raised })
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap(px(METER_GAP_PX * scale))
                .child(div().flex_none().size(px(DOT_PX)).rounded_full().bg(dot))
                .child(
                    div()
                        .flex_1()
                        .min_w(px(0.0))
                        .text_size(px(NAME_PX * scale))
                        .font_weight(weight)
                        .text_color(name_color)
                        .child(row.name.clone()),
                )
                .child(div().flex_none().text_color(paint.muted).text_size(px(DETAIL_PX * scale)).child(detail)),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap(px(METER_GAP_PX * scale))
                .pl(px((DOT_PX + METER_GAP_PX) * scale))
                .text_color(paint.subtle)
                .text_size(px(DETAIL_PX * scale))
                .child(reason)
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(METER_GAP_PX * scale))
                        .child(meter("mem", memory, paint))
                        .child(meter("disk", disk, paint)),
                ),
        )
}

fn meter(label: &'static str, fraction: Option<f32>, paint: RowPaint) -> Div {
    let scale = paint.scale;
    div()
        .flex()
        .flex_row()
        .items_center()
        .gap(px(METER_GAP_PX * scale))
        .child(div().text_color(paint.subtle).text_size(px(DETAIL_PX * scale)).child(label))
        .child(
            div()
                .flex_none()
                .w(px(METER_WIDTH_PX * scale))
                .h(px(METER_HEIGHT_PX * scale))
                .rounded_full()
                .bg(paint.track)
                .child(
                    div()
                        .h_full()
                        .w(px(METER_WIDTH_PX * scale * fraction.unwrap_or(0.0)))
                        .rounded_full()
                        .bg(meter_color(fraction, &paint)),
                ),
        )
}

fn meter_color(fraction: Option<f32>, paint: &RowPaint) -> Hsla {
    match fraction {
        Some(value) if value >= BUSY_ALARM => paint.failed,
        Some(value) if value >= BUSY_WARNING => paint.warning,
        Some(_) => paint.running,
        None => paint.idle,
    }
}

fn status_color(status: &MachineStatus, paint: &RowPaint) -> Hsla {
    match status {
        MachineStatus::Online(_) => paint.running,
        MachineStatus::Offline(_) => paint.failed,
        MachineStatus::Unknown => paint.idle,
    }
}

fn status_reason(row: &MachineSnapshot) -> String {
    match &row.status {
        MachineStatus::Online(health) => match (health.cpu_percent, health.cpu_count) {
            (Some(cpu), Some(count)) => format!("{cpu}% cpu of {count}"),
            _ => "online".to_string(),
        },
        MachineStatus::Offline(reason) => reason.reason().to_string(),
        MachineStatus::Unknown => NOT_CHECKED.to_string(),
    }
}

fn query_line(paint: RowPaint, query: String) -> AnyElement {
    let (text, color) = if query.is_empty() {
        (FILTER_HINT.to_string(), paint.subtle)
    } else {
        (query, paint.name)
    };
    div()
        .flex_none()
        .text_color(color)
        .text_size(px(DETAIL_PX * paint.scale))
        .child(SharedString::from(text))
        .into_any_element()
}

fn footer(paint: RowPaint, count: usize) -> AnyElement {
    div()
        .flex_none()
        .text_color(paint.subtle)
        .text_size(px(DETAIL_PX * paint.scale))
        .child(format!("{count} machine{}", if count == 1 { "" } else { "s" }))
        .into_any_element()
}

fn empty_row(paint: RowPaint) -> AnyElement {
    div()
        .flex_none()
        .px(px(ROW_PADDING_X_PX * paint.scale))
        .py(px(ROW_PADDING_Y_PX * paint.scale))
        .text_color(paint.muted)
        .text_size(px(NAME_PX * paint.scale))
        .child(EMPTY_MESSAGE)
        .into_any_element()
}

/// The machines a user added by hand, as stored in settings.
pub(super) fn added_from_settings(settings: &[(String, String)]) -> Vec<Machine> {
    let Some((_, raw)) = settings.iter().find(|(key, _)| key == MACHINES_ADDED_KEY) else {
        return Vec::new();
    };
    let Ok(machines) = serde_json::from_str::<Vec<Machine>>(raw) else {
        tracing::debug!("could not read saved machines; starting from ssh config");
        return Vec::new();
    };
    machines.into_iter().filter(|machine| !machine.is_local()).collect()
}

pub(super) fn added_to_settings(machines: &[Machine]) -> String {
    let added: Vec<Machine> =
        machines.iter().filter(|machine| machine.source == MachineSource::Added).cloned().collect();
    serde_json::to_string(&added).unwrap_or_else(|_| "[]".to_string())
}

pub(super) fn build_machine_service(settings: &[(String, String)]) -> Arc<MachineService> {
    Arc::new(MachineService::new(MachineRegistry::new(added_from_settings(settings))))
}
#[cfg(test)]
mod tests {
    use super::*;
    use domain::MachineSource;
    use machine_service::Unreachable;

    fn row(name: &str, alias: &str, status: MachineStatus) -> MachineSnapshot {
        MachineSnapshot {
            id: MachineId::from_alias(if alias.is_empty() { name } else { alias }),
            name: name.to_string(),
            alias: alias.to_string(),
            status,
        }
    }

    #[test]
    fn hand_added_machines_round_trip_through_settings() {
        let machines = vec![Machine::remote("Builder".to_string(), "builder".to_string(), MachineSource::Added)];
        let settings = vec![(MACHINES_ADDED_KEY.to_string(), added_to_settings(&machines))];
        assert_eq!(added_from_settings(&settings), machines);
    }

    #[test]
    fn this_computer_is_never_saved_as_an_added_machine() {
        let machines =
            vec![Machine::local(), Machine::remote("Builder".to_string(), "builder".to_string(), MachineSource::Added)];
        let settings = vec![(MACHINES_ADDED_KEY.to_string(), added_to_settings(&machines))];
        let restored = added_from_settings(&settings);
        assert_eq!(restored.len(), 1);
        assert_eq!(restored[0].alias, "builder");
    }

    #[test]
    fn unreadable_saved_machines_start_from_the_ssh_config_instead() {
        assert!(added_from_settings(&[]).is_empty());
        assert!(added_from_settings(&[(MACHINES_ADDED_KEY.to_string(), "{not json".to_string())]).is_empty());
    }

    #[test]
    fn the_filter_matches_a_name_or_an_alias() {
        let machine = row("The NAS", "nas", MachineStatus::Unknown);
        let mut pane = MachinePane::default();
        assert!(pane.matches(&machine), "an empty filter keeps everything");

        pane.query.insert("nas");
        assert!(pane.matches(&machine), "alias matches");

        pane.query.clear();
        pane.query.insert("THE");
        assert!(pane.matches(&machine), "name matches, ignoring case");

        pane.query.clear();
        pane.query.insert("zzz");
        assert!(!pane.matches(&machine));
    }

    #[test]
    fn this_computer_filters_on_its_own_name() {
        let mut pane = MachinePane::default();
        let local = row("This Mac", "", MachineStatus::Unknown);
        pane.query.insert("this");
        assert!(pane.matches(&local));
    }

    #[test]
    fn an_unreachable_machine_shows_the_reason_in_its_row() {
        let offline = row("NAS", "nas", MachineStatus::Offline(Unreachable::UnknownKeys));
        assert_eq!(status_reason(&offline), "SSH keys aren't set up for this machine");
        let unchecked = row("NAS", "nas", MachineStatus::Unknown);
        assert_eq!(status_reason(&unchecked), NOT_CHECKED);
    }

    #[test]
    fn an_online_machine_shows_its_processor_load() {
        let online = row(
            "NAS",
            "nas",
            MachineStatus::Online(machine_service::MachineHealth {
                cpu_percent: Some(37),
                cpu_count: Some(8),
                ..machine_service::MachineHealth::default()
            }),
        );
        assert_eq!(status_reason(&online), "37% cpu of 8");
    }
}
