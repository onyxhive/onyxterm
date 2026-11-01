use super::Shell;
use crate::git_graph::{
    lane_count, pills_that_fit, relative_time, Commit, CommitDetails, CommitRef, LaneRow, LaneSegment, RefKind,
    PILL_MAX_WIDTH_PX,
};
use super::git_graph::GitGraphPane;
use crate::pixel_grid::{snap_bounds, snap_to_device};
use crate::theme::menu_chrome::field_text;
use crate::theme::Theme;
use domain::PanelId;
use gpui::{
    canvas, div, fill, point, prelude::*, px, size, uniform_list, AnyElement, Bounds, Context, ContentMask, Div,
    FontWeight, Hsla, MouseButton, PathBuilder, Pixels, Point, SharedString, Window,
};
use std::ops::Range;
use std::time::{SystemTime, UNIX_EPOCH};

const NOT_A_REPOSITORY: &str = "Not a git repository";
const NO_COMMITS: &str = "No commits yet";
const NO_MATCHES: &str = "No matching commits";
const FILTER_PLACEHOLDER: &str = "Filter by subject, author or ref";
const CHANGED_FILES_LABEL: &str = "Changed files";
const META_SEPARATOR: &str = "  \u{2022}  ";
const ROW_HEIGHT_PX: f32 = 46.0;
const ROW_PADDING_RIGHT_PX: f32 = 10.0;
const ROW_LINE_GAP_PX: f32 = 2.0;
const SUBJECT_PX: f32 = 13.0;
const META_PX: f32 = 11.5;
const MIN_SUBJECT_WIDTH_PX: f32 = 120.0;
const LANE_WIDTH_PX: f32 = 13.0;
const LANE_INSET_PX: f32 = 12.0;
const LANE_COLUMN_MAX_SHARE: f32 = 0.35;
const LANE_STROKE_PX: f32 = 1.5;
const NODE_DIAMETER_PX: f32 = 9.0;
const PILL_GAP_PX: f32 = 4.0;
const PILL_PADDING_X_PX: f32 = 6.0;
const PILL_RADIUS_PX: f32 = 8.0;
const PILL_TEXT_PX: f32 = 10.5;
const PILL_FILL_OPACITY: f32 = 0.18;
const FILTER_HEIGHT_PX: f32 = 26.0;
const FILTER_PADDING_X_PX: f32 = 12.0;
const QUIET_PADDING_PX: f32 = 12.0;
const DETAILS_HEIGHT_PX: f32 = 230.0;
const DETAILS_MAX_SHARE: f32 = 0.45;
const DETAILS_PADDING_PX: f32 = 12.0;
const DETAILS_GAP_PX: f32 = 8.0;
const CHIP_PADDING_X_PX: f32 = 6.0;
const CHIP_PADDING_Y_PX: f32 = 2.0;
const CHIP_RADIUS_PX: f32 = 5.0;
const FILE_ROW_PADDING_X_PX: f32 = 6.0;
const FILE_ROW_PADDING_Y_PX: f32 = 3.0;
const FILE_ROW_RADIUS_PX: f32 = 5.0;
const HEADER_SYNC_MAX_WIDTH_PX: f32 = 180.0;

#[derive(Clone, Copy)]
struct LanePaint {
    palette: [Hsla; 6],
    scale: f32,
}

impl LanePaint {
    fn from_theme(theme: &Theme, scale: f32) -> Self {
        let ansi = theme.ansi;
        Self {
            palette: [theme.accent.primary, ansi.green, ansi.magenta, ansi.yellow, ansi.cyan, ansi.red],
            scale,
        }
    }

    fn color(&self, index: usize) -> Hsla {
        self.palette[index % self.palette.len()]
    }

    fn lane_x(&self, bounds: &Bounds<Pixels>, lane: usize) -> Pixels {
        bounds.left() + px((LANE_INSET_PX + LANE_WIDTH_PX * lane as f32) * self.scale)
    }

    fn draw_node(&self, center: Point<Pixels>, color: usize, window: &mut Window) {
        let diameter = px(NODE_DIAMETER_PX * self.scale);
        let corner = point(center.x - diameter / 2.0, center.y - diameter / 2.0);
        let bounds = snap_bounds(Bounds::new(corner, size(diameter, diameter)), window.scale_factor());
        window.paint_quad(fill(bounds, self.color(color)).corner_radii(diameter / 2.0));
    }
}

struct LaneBand<'a> {
    bounds: Bounds<Pixels>,
    paint: &'a LanePaint,
    top: Pixels,
    bottom: Pixels,
}

impl LaneBand<'_> {
    fn draw(&self, segment: LaneSegment, window: &mut Window) {
        let device_scale = window.scale_factor();
        let start_x = snap_to_device(self.paint.lane_x(&self.bounds, segment.from), device_scale);
        let end_x = snap_to_device(self.paint.lane_x(&self.bounds, segment.to), device_scale);
        let mut path = PathBuilder::stroke(px(LANE_STROKE_PX * self.paint.scale));
        path.move_to(point(start_x, self.top));
        if segment.from == segment.to {
            path.line_to(point(end_x, self.bottom));
        } else {
            let middle = self.top + (self.bottom - self.top) / 2.0;
            path.cubic_bezier_to(point(end_x, self.bottom), point(start_x, middle), point(end_x, middle));
        }
        if let Ok(path) = path.build() {
            window.paint_path(path, self.paint.color(segment.color));
        }
    }
}

struct RowText {
    subject: String,
    meta: String,
    refs: Vec<CommitRef>,
}

impl RowText {
    fn from_commit(commit: &Commit, now: i64, visible_refs: usize) -> Self {
        let when = relative_time(now, commit.author_time);
        Self {
            subject: commit.subject.clone(),
            meta: format!("{}{META_SEPARATOR}{}{META_SEPARATOR}{when}", commit.short_hash(), commit.author),
            refs: commit.refs.iter().take(visible_refs).cloned().collect(),
        }
    }
}

fn unix_now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_secs() as i64)
}

fn lane_column_lanes(total_lanes: usize, pane_width: Option<f32>, scale: f32) -> usize {
    let Some(width) = pane_width else {
        return total_lanes;
    };
    let room = width * LANE_COLUMN_MAX_SHARE - LANE_INSET_PX * scale;
    let fitting = (room / (LANE_WIDTH_PX * scale)).floor().max(1.0) as usize;
    total_lanes.min(fitting)
}

fn lane_column_width(lanes: usize, scale: f32) -> f32 {
    (LANE_INSET_PX * 2.0 + LANE_WIDTH_PX * lanes.saturating_sub(1) as f32) * scale
}

fn paint_lanes(bounds: Bounds<Pixels>, row: &LaneRow, paint: &LanePaint, window: &mut Window) {
    let device_scale = window.scale_factor();
    let top = snap_to_device(bounds.top(), device_scale);
    let bottom = snap_to_device(bounds.bottom(), device_scale);
    let middle = snap_to_device(bounds.top() + bounds.size.height / 2.0, device_scale);
    let upper = LaneBand { bounds, paint, top, bottom: middle };
    let lower = LaneBand { bounds, paint, top: middle, bottom };
    window.with_content_mask(Some(ContentMask { bounds }), |window| {
        row.above.iter().for_each(|segment| upper.draw(*segment, window));
        row.below.iter().for_each(|segment| lower.draw(*segment, window));
        let center = point(snap_to_device(paint.lane_x(&bounds, row.lane), device_scale), middle);
        paint.draw_node(center, row.color, window);
    });
}

fn lane_canvas(row: LaneRow, paint: LanePaint, width: f32) -> impl IntoElement {
    canvas(|_bounds, _window, _cx| {}, move |bounds, (), window, _cx| paint_lanes(bounds, &row, &paint, window))
        .flex_none()
        .w(px(width))
        .h_full()
}

fn ref_color(kind: RefKind, theme: &Theme) -> Hsla {
    match kind {
        RefKind::CurrentBranch => theme.accent.primary,
        RefKind::LocalBranch => theme.ansi.green,
        RefKind::RemoteBranch => theme.ansi.blue,
        RefKind::Tag => theme.ansi.yellow,
    }
}

fn ref_pill(item: &CommitRef, theme: &Theme, scale: f32) -> Div {
    let color = ref_color(item.kind, theme);
    div()
        .flex_none()
        .max_w(px(PILL_MAX_WIDTH_PX * scale))
        .truncate()
        .px(px(PILL_PADDING_X_PX * scale))
        .rounded(px(PILL_RADIUS_PX * scale))
        .bg(color.opacity(PILL_FILL_OPACITY))
        .text_color(color)
        .text_size(px(PILL_TEXT_PX * scale))
        .child(item.name.clone())
}

fn subject_line(text: &RowText, theme: &Theme, scale: f32) -> Div {
    div()
        .w_full()
        .flex()
        .flex_row()
        .items_center()
        .gap(px(PILL_GAP_PX * scale))
        .child(
            div()
                .flex_1()
                .min_w(px(0.0))
                .truncate()
                .text_size(px(SUBJECT_PX * scale))
                .text_color(theme.text.default)
                .child(text.subject.clone()),
        )
        .children(text.refs.iter().map(|item| ref_pill(item, theme, scale)))
}

fn row_text_column(text: &RowText, theme: &Theme, scale: f32) -> Div {
    div()
        .flex_1()
        .min_w(px(0.0))
        .flex()
        .flex_col()
        .gap(px(ROW_LINE_GAP_PX * scale))
        .pr(px(ROW_PADDING_RIGHT_PX * scale))
        .child(subject_line(text, theme, scale))
        .child(div().truncate().text_size(px(META_PX * scale)).text_color(theme.text.muted).child(text.meta.clone()))
}

fn quiet_line(message: &'static str, theme: &Theme, scale: f32) -> AnyElement {
    div()
        .flex_1()
        .min_h(px(0.0))
        .p(px(QUIET_PADDING_PX * scale))
        .text_size(px(META_PX * scale))
        .text_color(theme.text.subtle)
        .child(message)
        .into_any_element()
}

fn details_summary(commit: &Commit, theme: &Theme, scale: f32) -> Div {
    let chip = div()
        .flex_none()
        .px(px(CHIP_PADDING_X_PX * scale))
        .py(px(CHIP_PADDING_Y_PX * scale))
        .rounded(px(CHIP_RADIUS_PX * scale))
        .bg(theme.chrome.control_fill)
        .text_color(theme.text.muted)
        .text_size(px(META_PX * scale))
        .child(commit.short_hash().to_string());
    let subject = div()
        .flex_1()
        .min_w(px(0.0))
        .text_size(px(SUBJECT_PX * scale))
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(theme.text.default)
        .child(commit.subject.clone());
    div()
        .flex_none()
        .w_full()
        .flex()
        .flex_row()
        .items_start()
        .gap(px(DETAILS_GAP_PX * scale))
        .child(chip)
        .child(subject)
}

fn author_line_text(commit: &Commit, details: Option<&CommitDetails>) -> String {
    let email = details.filter(|details| !details.email.is_empty()).map(|details| format!(" <{}>", details.email));
    let when = relative_time(unix_now(), commit.author_time);
    format!("{}{}{META_SEPARATOR}{when}", commit.author, email.unwrap_or_default())
}

fn details_author_line(text: String, theme: &Theme, scale: f32) -> Div {
    div()
        .flex_none()
        .w_full()
        .truncate()
        .text_size(px(META_PX * scale))
        .text_color(theme.text.muted)
        .child(text)
}

fn details_message(details: &CommitDetails, theme: &Theme, scale: f32) -> Option<Div> {
    (!details.message.is_empty()).then(|| {
        div()
            .flex_none()
            .w_full()
            .text_size(px(META_PX * scale))
            .text_color(theme.text.default)
            .child(details.message.clone())
    })
}

fn quiet_message(pane: &GitGraphPane) -> Option<&'static str> {
    if !pane.has_loaded {
        return Some("");
    }
    if pane.repo.is_none() {
        return Some(NOT_A_REPOSITORY);
    }
    if pane.commits.is_empty() {
        return Some(NO_COMMITS);
    }
    pane.visible.is_empty().then_some(NO_MATCHES)
}

struct GraphRowView {
    hash: String,
    text: RowText,
    lanes: LaneRow,
    lane_width: f32,
    is_selected: bool,
    paint: LanePaint,
}

impl Shell {
    pub(super) fn render_git_graph_pane(&self, panel: PanelId, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = &self.state.theme;
        let scale = self.state.settings.ui_scale;
        let root = div()
            .size_full()
            .flex()
            .flex_col()
            .pt(px(theme.layout.pane_header_height_px))
            .font_family(SharedString::from(theme.ui_font.family.clone()));
        let Some(pane) = self.git_graph_panes.get(&panel) else {
            return root;
        };
        let body = match quiet_message(pane) {
            Some(message) => quiet_line(message, theme, scale),
            None => {
                let render_rows = cx.processor(move |shell: &mut Shell, range: Range<usize>, _window, cx| {
                    shell.git_graph_rows(panel, range, cx)
                });
                uniform_list(SharedString::from(format!("git-graph-{panel}")), pane.visible.len(), render_rows)
                    .flex_1()
                    .min_h(px(0.0))
                    .track_scroll(pane.scroll.clone())
                    .into_any_element()
            }
        };
        root.children(self.git_graph_filter_line(panel))
            .child(body)
            .children(self.git_graph_details(panel, cx))
    }

    fn git_graph_filter_line(&self, panel: PanelId) -> Option<Div> {
        let pane = self.git_graph_panes.get(&panel)?;
        if !pane.is_filtering && pane.filter.is_empty() {
            return None;
        }
        let theme = &self.state.theme;
        let scale = self.state.settings.ui_scale;
        Some(
            div()
                .flex_none()
                .w_full()
                .h(px(FILTER_HEIGHT_PX * scale))
                .px(px(FILTER_PADDING_X_PX * scale))
                .flex()
                .items_center()
                .overflow_hidden()
                .bg(theme.surface.sunken)
                .text_size(px(META_PX * scale))
                .text_color(theme.text.default)
                .child(field_text(&pane.filter, FILTER_PLACEHOLDER, theme)),
        )
    }

    fn git_graph_rows(&mut self, panel: PanelId, range: Range<usize>, cx: &mut Context<Self>) -> Vec<Div> {
        self.load_more_git_commits_near(panel, range.end, cx);
        let Some(pane) = self.git_graph_panes.get(&panel) else {
            return Vec::new();
        };
        let (commits, rows, visible) = (pane.commits.clone(), pane.rows.clone(), pane.visible.clone());
        let is_filtered = !pane.filter.is_empty();
        let selected = pane.selected_position();
        let scale = self.state.settings.ui_scale;
        let pane_width = self.pane_size(panel).map(|(width, _)| width);
        let total_lanes = if is_filtered { 1 } else { lane_count(&rows) };
        let lane_width = lane_column_width(lane_column_lanes(total_lanes, pane_width, scale), scale);
        let paint = LanePaint::from_theme(&self.state.theme, scale);
        let now = unix_now();
        let mut out = Vec::with_capacity(range.len());
        for position in range {
            let Some(index) = visible.get(position).copied() else {
                continue;
            };
            let (Some(commit), Some(row)) = (commits.get(index), rows.get(index)) else {
                continue;
            };
            let lanes = if is_filtered { LaneRow::node_only(row.color) } else { row.clone() };
            let refs_room = pane_width.map_or(f32::MAX, |width| {
                width - lane_width - (MIN_SUBJECT_WIDTH_PX + ROW_PADDING_RIGHT_PX) * scale
            });
            let text = RowText::from_commit(commit, now, pills_that_fit(&commit.refs, refs_room, scale));
            let view = GraphRowView {
                hash: commit.hash.clone(),
                text,
                lanes,
                lane_width,
                is_selected: selected == Some(position),
                paint,
            };
            out.push(self.git_graph_row(panel, view, cx));
        }
        out
    }

    fn git_graph_row(&self, panel: PanelId, view: GraphRowView, cx: &mut Context<Self>) -> Div {
        let theme = &self.state.theme;
        let scale = self.state.settings.ui_scale;
        let GraphRowView { hash, text, lanes, lane_width, is_selected, paint } = view;
        div()
            .w_full()
            .h(px(ROW_HEIGHT_PX * scale))
            .flex()
            .flex_row()
            .items_center()
            .overflow_hidden()
            .when(is_selected, |row| row.bg(theme.accent.selection))
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(move |shell, _event, _window, cx| {
                    shell.select_git_graph_commit(panel, hash.clone(), cx);
                }),
            )
            .child(lane_canvas(lanes, paint, lane_width))
            .child(row_text_column(&text, theme, scale))
    }

    fn git_graph_details(&self, panel: PanelId, cx: &mut Context<Self>) -> Option<impl IntoElement> {
        let pane = self.git_graph_panes.get(&panel)?;
        let commit = pane.selected_commit()?;
        let details = pane.selected_details();
        let theme = &self.state.theme;
        let scale = self.state.settings.ui_scale;
        let height = self.pane_size(panel).map_or(DETAILS_HEIGHT_PX * scale, |(_, height)| {
            (DETAILS_HEIGHT_PX * scale).min(height * DETAILS_MAX_SHARE)
        });
        let files = details.map(|details| self.git_graph_file_rows(panel, details, cx)).unwrap_or_default();
        Some(
            div().flex_none().w_full().flex().flex_col().child(self.git_graph_divider()).child(
                div()
                    .id(SharedString::from(format!("git-graph-details-{panel}")))
                    .w_full()
                    .h(px(height))
                    .overflow_y_scroll()
                    .track_scroll(&pane.details_scroll)
                    .p(px(DETAILS_PADDING_PX * scale))
                    .flex()
                    .flex_col()
                    .gap(px(DETAILS_GAP_PX * scale))
                    .child(details_summary(commit, theme, scale))
                    .child(details_author_line(author_line_text(commit, details), theme, scale))
                    .children(details.and_then(|details| details_message(details, theme, scale)))
                    .when(!files.is_empty(), |section| {
                        section
                            .child(
                                div()
                                    .flex_none()
                                    .text_size(px(META_PX * scale))
                                    .text_color(theme.text.subtle)
                                    .child(format!("{CHANGED_FILES_LABEL} ({})", files.len())),
                            )
                            .child(div().flex_none().w_full().flex().flex_col().children(files))
                    }),
            ),
        )
    }

    fn git_graph_divider(&self) -> Div {
        div().w_full().h(px(1.0)).bg(self.state.theme.border.default)
    }

    fn git_graph_file_rows(&self, panel: PanelId, details: &CommitDetails, cx: &mut Context<Self>) -> Vec<Div> {
        let theme = &self.state.theme;
        let scale = self.state.settings.ui_scale;
        details
            .files
            .iter()
            .map(|file| {
                let path = file.clone();
                div()
                    .w_full()
                    .flex_none()
                    .truncate()
                    .px(px(FILE_ROW_PADDING_X_PX * scale))
                    .py(px(FILE_ROW_PADDING_Y_PX * scale))
                    .rounded(px(FILE_ROW_RADIUS_PX * scale))
                    .cursor_pointer()
                    .hover(|row| row.bg(theme.chrome.icon_hover_fill))
                    .text_size(px(META_PX * scale))
                    .text_color(theme.text.default)
                    .on_mouse_down(
                        MouseButton::Left,
                        cx.listener(move |shell, _event, window, cx| {
                            cx.stop_propagation();
                            shell.focus_pane(panel);
                            window.focus(&shell.focus_handle);
                            shell.open_git_graph_file(panel, &path, cx);
                            cx.notify();
                        }),
                    )
                    .child(file.clone())
            })
            .collect()
    }

    pub(super) fn git_graph_header_status(&self, panel: PanelId) -> Option<impl IntoElement> {
        let summary = self.git_graph_summary(panel)?;
        let theme = &self.state.theme;
        let scale = self.state.settings.ui_scale;
        Some(
            div()
                .flex_none()
                .max_w(px(HEADER_SYNC_MAX_WIDTH_PX * scale))
                .truncate()
                .text_size(px(theme.ui_font.hint_px))
                .text_color(theme.text.muted)
                .child(summary.sync_label()),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_lane_column_never_takes_more_than_its_share_of_the_pane() {
        assert_eq!(lane_column_lanes(3, None, 1.0), 3);
        assert_eq!(lane_column_lanes(3, Some(1000.0), 1.0), 3);
        assert_eq!(lane_column_lanes(40, Some(400.0), 1.0), 9);
        assert_eq!(lane_column_lanes(40, Some(10.0), 1.0), 1);
    }

    #[test]
    fn the_lane_column_fits_one_lane_with_even_insets() {
        assert_eq!(lane_column_width(1, 1.0), LANE_INSET_PX * 2.0);
        assert_eq!(lane_column_width(3, 2.0), (LANE_INSET_PX * 2.0 + LANE_WIDTH_PX * 2.0) * 2.0);
    }
}
