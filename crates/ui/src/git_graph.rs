#![deny(warnings)]
#![forbid(unsafe_code)]

use crate::git_status::untrusted_repo_output;
use crate::pane_layout::neighbor_toward;
use domain::{Direction, LayoutNode, PanelId};
use gpui::Keystroke;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub const INITIAL_COMMIT_LIMIT: usize = 500;
pub const COMMIT_LIMIT_STEP: usize = 500;
const SHORT_HASH_LEN: usize = 7;
const LOAD_MORE_MARGIN_ROWS: usize = 50;
const FIELD_SEPARATOR: char = '\u{1f}';
const RECORD_SEPARATOR: char = '\u{1e}';
const LOG_FORMAT: &str = "--format=%H%x1f%P%x1f%D%x1f%an%x1f%at%x1f%s%x1e";
const DETAILS_FORMAT: &str = "--format=%ae%x1f%b";
const LOG_FIELD_COUNT: usize = 6;
const MIN_HASH_LEN: usize = 7;
const CURRENT_BRANCH_PREFIX: &str = "HEAD -> ";
const DETACHED_HEAD_REF: &str = "HEAD";
const TAG_PREFIX: &str = "tag: ";
const LOCAL_BRANCH_PREFIX: &str = "refs/heads/";
const REMOTE_BRANCH_PREFIX: &str = "refs/remotes/";
const REF_NAMESPACE_PREFIX: &str = "refs/";
const TAG_NAMESPACE_PREFIX: &str = "refs/tags/";
const REMOTE_HEAD_SUFFIX: &str = "/HEAD";
const SECONDS_PER_MINUTE: i64 = 60;
const SECONDS_PER_HOUR: i64 = 3_600;
const SECONDS_PER_DAY: i64 = 86_400;
const SECONDS_PER_MONTH: i64 = 2_592_000;
const SECONDS_PER_YEAR: i64 = 31_536_000;
const PILL_CHAR_PX: f32 = 6.2;
const PILL_CHROME_PX: f32 = 18.0;
pub const PILL_MAX_WIDTH_PX: f32 = 120.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum RefKind {
    CurrentBranch,
    LocalBranch,
    RemoteBranch,
    Tag,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitRef {
    pub name: String,
    pub kind: RefKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Commit {
    pub hash: String,
    pub parents: Vec<String>,
    pub refs: Vec<CommitRef>,
    pub author: String,
    pub author_time: i64,
    pub subject: String,
}

impl Commit {
    pub fn short_hash(&self) -> &str {
        self.hash.get(..SHORT_HASH_LEN).unwrap_or(&self.hash)
    }

    fn matches(&self, lowercase_needle: &str) -> bool {
        let contains = |text: &str| text.to_lowercase().contains(lowercase_needle);
        contains(&self.subject) || contains(&self.author) || self.refs.iter().any(|item| contains(&item.name))
    }
}

pub fn parse_log(output: &str) -> Vec<Commit> {
    output.split(RECORD_SEPARATOR).filter_map(parse_record).collect()
}

fn parse_record(record: &str) -> Option<Commit> {
    let fields: Vec<&str> = record.trim_start_matches('\n').splitn(LOG_FIELD_COUNT, FIELD_SEPARATOR).collect();
    let [hash, parents, decorations, author, author_time, subject] = fields.as_slice() else {
        return None;
    };
    let parents: Vec<String> = parents.split_whitespace().map(str::to_string).collect();
    if !is_object_id(hash) || !parents.iter().all(|parent| is_object_id(parent)) {
        return None;
    }
    Some(Commit {
        hash: hash.to_string(),
        parents,
        refs: parse_decorations(decorations),
        author: author.to_string(),
        author_time: author_time.parse().ok()?,
        subject: subject.trim_end().to_string(),
    })
}

fn is_object_id(text: &str) -> bool {
    text.len() >= MIN_HASH_LEN && text.chars().all(|character| character.is_ascii_hexdigit())
}

pub fn parse_decorations(decorations: &str) -> Vec<CommitRef> {
    let mut refs: Vec<CommitRef> =
        decorations.split(", ").filter(|item| !item.is_empty()).filter_map(parse_decoration).collect();
    refs.sort_by_key(|item| item.kind);
    refs
}

fn parse_decoration(decoration: &str) -> Option<CommitRef> {
    if let Some(full_name) = decoration.strip_prefix(CURRENT_BRANCH_PREFIX) {
        let name = full_name.strip_prefix(LOCAL_BRANCH_PREFIX).unwrap_or(full_name);
        return Some(CommitRef { name: name.to_string(), kind: RefKind::CurrentBranch });
    }
    if decoration == DETACHED_HEAD_REF {
        return Some(CommitRef { name: decoration.to_string(), kind: RefKind::CurrentBranch });
    }
    if let Some(full_name) = decoration.strip_prefix(TAG_PREFIX) {
        let name = full_name.strip_prefix(TAG_NAMESPACE_PREFIX).unwrap_or(full_name);
        return Some(CommitRef { name: name.to_string(), kind: RefKind::Tag });
    }
    if let Some(name) = decoration.strip_prefix(LOCAL_BRANCH_PREFIX) {
        return Some(CommitRef { name: name.to_string(), kind: RefKind::LocalBranch });
    }
    if let Some(name) = decoration.strip_prefix(REMOTE_BRANCH_PREFIX) {
        return (!name.ends_with(REMOTE_HEAD_SUFFIX))
            .then(|| CommitRef { name: name.to_string(), kind: RefKind::RemoteBranch });
    }
    let name = decoration.strip_prefix(REF_NAMESPACE_PREFIX).unwrap_or(decoration);
    Some(CommitRef { name: name.to_string(), kind: RefKind::Tag })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LaneSegment {
    pub from: usize,
    pub to: usize,
    pub color: usize,
}

impl LaneSegment {
    fn straight(lane: usize, color: usize) -> Self {
        Self { from: lane, to: lane, color }
    }

    fn widest_lane(self) -> usize {
        self.from.max(self.to)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaneRow {
    pub lane: usize,
    pub color: usize,
    pub above: Vec<LaneSegment>,
    pub below: Vec<LaneSegment>,
}

impl LaneRow {
    pub fn node_only(color: usize) -> Self {
        Self { lane: 0, color, above: Vec::new(), below: Vec::new() }
    }

    fn lane_count(&self) -> usize {
        let segments = self.above.iter().chain(&self.below).map(|segment| segment.widest_lane());
        segments.fold(self.lane, usize::max) + 1
    }
}

pub fn lane_count(rows: &[LaneRow]) -> usize {
    rows.iter().map(LaneRow::lane_count).max().unwrap_or(1)
}

#[derive(Clone, Copy)]
struct OpenLane<'a> {
    awaiting: &'a str,
    color: usize,
}

#[derive(Default)]
struct LaneTracker<'a> {
    lanes: Vec<Option<OpenLane<'a>>>,
    next_color: usize,
}

impl<'a> LaneTracker<'a> {
    fn row_for(&mut self, commit: &'a Commit) -> LaneRow {
        let above = self.open_segments();
        let (lane, color) = self.claim_lane(&commit.hash);
        let mut below = self.open_segments();
        let mut parents = commit.parents.iter();
        below.extend(parents.next().map(|parent| self.route_first_parent(parent, lane, color)));
        below.extend(parents.map(|parent| self.route_merge_parent(parent, lane)));
        self.trim_trailing_free_lanes();
        LaneRow { lane, color, above, below }
    }

    fn open_segments(&self) -> Vec<LaneSegment> {
        let open = self.lanes.iter().enumerate();
        open.filter_map(|(lane, slot)| slot.map(|open| LaneSegment::straight(lane, open.color))).collect()
    }

    fn lane_awaiting(&self, hash: &str) -> Option<usize> {
        self.lanes.iter().position(|slot| slot.is_some_and(|open| open.awaiting == hash))
    }

    fn claim_lane(&mut self, hash: &str) -> (usize, usize) {
        if let Some(lane) = self.lane_awaiting(hash) {
            let color = self.lanes[lane].map_or(0, |open| open.color);
            self.lanes[lane] = None;
            return (lane, color);
        }
        (self.free_lane(), self.take_color())
    }

    fn route_first_parent(&mut self, parent: &'a str, lane: usize, color: usize) -> LaneSegment {
        if let Some(existing) = self.lane_awaiting(parent) {
            return LaneSegment { from: lane, to: existing, color };
        }
        self.occupy(lane, OpenLane { awaiting: parent, color });
        LaneSegment::straight(lane, color)
    }

    fn route_merge_parent(&mut self, parent: &'a str, lane: usize) -> LaneSegment {
        if let Some(existing) = self.lane_awaiting(parent) {
            let color = self.lanes[existing].map_or(0, |open| open.color);
            return LaneSegment { from: lane, to: existing, color };
        }
        let target = self.free_lane();
        let color = self.take_color();
        self.occupy(target, OpenLane { awaiting: parent, color });
        LaneSegment { from: lane, to: target, color }
    }

    fn occupy(&mut self, lane: usize, open: OpenLane<'a>) {
        if lane >= self.lanes.len() {
            self.lanes.resize(lane + 1, None);
        }
        self.lanes[lane] = Some(open);
    }

    fn free_lane(&self) -> usize {
        self.lanes.iter().position(Option::is_none).unwrap_or(self.lanes.len())
    }

    fn take_color(&mut self) -> usize {
        let color = self.next_color;
        self.next_color += 1;
        color
    }

    fn trim_trailing_free_lanes(&mut self) {
        while matches!(self.lanes.last(), Some(None)) {
            self.lanes.pop();
        }
    }
}

pub fn assign_lanes(commits: &[Commit]) -> Vec<LaneRow> {
    let mut tracker = LaneTracker::default();
    commits.iter().map(|commit| tracker.row_for(commit)).collect()
}

pub fn visible_commits(commits: &[Commit], filter: &str) -> Vec<usize> {
    let needle = filter.trim().to_lowercase();
    let matching = commits.iter().enumerate().filter(|(_, commit)| needle.is_empty() || commit.matches(&needle));
    matching.map(|(index, _)| index).collect()
}

pub fn reconcile_selection(commits: &[Commit], visible: &[usize], selected: Option<&str>) -> Option<String> {
    let hash_at = |index: &usize| commits.get(*index).map(|commit| commit.hash.as_str());
    let is_still_visible = |hash: &&str| visible.iter().any(|index| hash_at(index) == Some(*hash));
    let kept = selected.filter(is_still_visible);
    kept.or_else(|| visible.first().and_then(hash_at)).map(str::to_string)
}

pub fn moved_position(current: Option<usize>, delta: isize, count: usize) -> Option<usize> {
    let last = count.checked_sub(1)?;
    let Some(current) = current else {
        return Some(0);
    };
    Some(current.saturating_add_signed(delta).min(last))
}

pub fn should_load_more(visible_end: usize, loaded: usize, limit: usize) -> bool {
    let has_more_history = loaded >= limit;
    has_more_history && visible_end + LOAD_MORE_MARGIN_ROWS >= loaded
}

pub fn relative_time(now: i64, then: i64) -> String {
    let elapsed = now.saturating_sub(then).max(0);
    match elapsed {
        seconds if seconds < SECONDS_PER_MINUTE => "just now".to_string(),
        seconds if seconds < SECONDS_PER_HOUR => format!("{}m ago", seconds / SECONDS_PER_MINUTE),
        seconds if seconds < SECONDS_PER_DAY => format!("{}h ago", seconds / SECONDS_PER_HOUR),
        seconds if seconds < SECONDS_PER_MONTH => format!("{}d ago", seconds / SECONDS_PER_DAY),
        seconds if seconds < SECONDS_PER_YEAR => format!("{}mo ago", seconds / SECONDS_PER_MONTH),
        seconds => format!("{}y ago", seconds / SECONDS_PER_YEAR),
    }
}

pub fn pills_that_fit(refs: &[CommitRef], available_px: f32, scale: f32) -> usize {
    let mut remaining = available_px;
    let mut fitting = 0;
    for item in refs {
        let wanted = PILL_CHROME_PX + item.name.chars().count() as f32 * PILL_CHAR_PX;
        let width = wanted.min(PILL_MAX_WIDTH_PX) * scale;
        if width > remaining {
            break;
        }
        remaining -= width;
        fitting += 1;
    }
    fitting
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GraphKey {
    Move(isize),
    StartFilter,
    ClearFilter,
}

pub fn graph_key(keystroke: &Keystroke) -> Option<GraphKey> {
    let modifiers = keystroke.modifiers;
    if modifiers.platform || modifiers.control || modifiers.alt || modifiers.shift {
        return None;
    }
    match keystroke.key.as_str() {
        "j" | "down" => Some(GraphKey::Move(1)),
        "k" | "up" => Some(GraphKey::Move(-1)),
        "/" => Some(GraphKey::StartFilter),
        "escape" => Some(GraphKey::ClearFilter),
        _ => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GraphToggleSource {
    LocalTerminal { panel: PanelId, graph: Option<PanelId> },
    Graph { panel: PanelId },
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GraphToggle {
    Open { owner: PanelId },
    Close { graph: PanelId },
    Unavailable,
}

pub fn resolve_graph_toggle(source: GraphToggleSource) -> GraphToggle {
    match source {
        GraphToggleSource::LocalTerminal { graph: Some(graph), .. } => GraphToggle::Close { graph },
        GraphToggleSource::LocalTerminal { panel, graph: None } => GraphToggle::Open { owner: panel },
        GraphToggleSource::Graph { panel } => GraphToggle::Close { graph: panel },
        GraphToggleSource::Other => GraphToggle::Unavailable,
    }
}

pub fn derive_graph_owner(
    layout: &LayoutNode,
    graph: PanelId,
    is_candidate: impl Fn(PanelId) -> bool,
) -> Option<PanelId> {
    let directions = [Direction::Left, Direction::Right, Direction::Up, Direction::Down];
    let adjacent = directions.into_iter().filter_map(|direction| neighbor_toward(layout, graph, direction));
    adjacent.chain(layout.leaves()).find(|panel| *panel != graph && is_candidate(*panel))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepoProbe {
    pub root: PathBuf,
    pub head: String,
    pub refs: String,
}

impl RepoProbe {
    pub fn repo_name(&self) -> String {
        let name = self.root.file_name().map(|name| name.to_string_lossy().into_owned());
        name.unwrap_or_else(|| self.root.display().to_string())
    }
}

pub fn read_repo_probe(dir: &Path) -> Option<RepoProbe> {
    let root = untrusted_repo_output(dir, &["rev-parse", "--show-toplevel"])?;
    let refs = untrusted_repo_output(dir, &["for-each-ref", "--format=%(objectname) %(refname)"])?;
    let head = untrusted_repo_output(dir, &["rev-parse", "HEAD"]).unwrap_or_default();
    Some(RepoProbe { root: PathBuf::from(root.trim_end()), head, refs })
}

#[derive(Debug, Clone, Default)]
pub struct GraphSnapshot {
    pub probe: Option<RepoProbe>,
    pub commits: Arc<Vec<Commit>>,
    pub rows: Arc<Vec<LaneRow>>,
}

pub fn read_graph(dir: &Path, limit: usize) -> GraphSnapshot {
    let Some(probe) = read_repo_probe(dir) else {
        return GraphSnapshot::default();
    };
    let limit = limit.to_string();
    let args = [
        "log", "--all", "--topo-order", "--decorate=full", "--no-show-signature", "--no-color", "-n", &limit,
        LOG_FORMAT,
    ];
    let commits = untrusted_repo_output(dir, &args).map_or_else(Vec::new, |output| parse_log(&output));
    let rows = assign_lanes(&commits);
    GraphSnapshot { probe: Some(probe), commits: Arc::new(commits), rows: Arc::new(rows) }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitDetails {
    pub hash: String,
    pub email: String,
    pub message: String,
    pub files: Vec<String>,
}

pub fn parse_commit_details(hash: &str, description: &str, changed_files: &str) -> Option<CommitDetails> {
    let (email, message) = description.split_once(FIELD_SEPARATOR)?;
    Some(CommitDetails {
        hash: hash.to_string(),
        email: email.to_string(),
        message: message.trim().to_string(),
        files: changed_files.split('\0').filter(|path| !path.is_empty()).map(str::to_string).collect(),
    })
}

pub fn read_commit_details(dir: &Path, hash: &str) -> Option<CommitDetails> {
    let description_args = ["show", "-s", "--no-show-signature", "--no-color", DETAILS_FORMAT, hash];
    let description = untrusted_repo_output(dir, &description_args)?;
    let files_args = [
        "show", "--no-show-signature", "--no-ext-diff", "--no-color", "--format=", "--name-only", "-z", "-m",
        "--first-parent", hash,
    ];
    let files = untrusted_repo_output(dir, &files_args).unwrap_or_default();
    parse_commit_details(hash, &description, &files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::Axis;
    use gpui::Modifiers;
    use std::process::Command;

    fn commit(hash: &str, parents: &[&str]) -> Commit {
        Commit {
            hash: hash.to_string(),
            parents: parents.iter().map(|parent| parent.to_string()).collect(),
            refs: Vec::new(),
            author: "Ada".to_string(),
            author_time: 0,
            subject: format!("subject {hash}"),
        }
    }

    fn segment(from: usize, to: usize, color: usize) -> LaneSegment {
        LaneSegment { from, to, color }
    }

    fn id(seed: char) -> String {
        seed.to_string().repeat(40)
    }

    fn record(hash: &str, parents: &str, decorations: &str, time: &str, subject: &str) -> String {
        format!("{hash}\u{1f}{parents}\u{1f}{decorations}\u{1f}Ada Lovelace\u{1f}{time}\u{1f}{subject}\u{1e}\n")
    }

    #[test]
    fn linear_history_stays_in_one_lane() {
        let rows = assign_lanes(&[commit("c", &["b"]), commit("b", &["a"]), commit("a", &[])]);
        assert_eq!(rows, vec![
            LaneRow { lane: 0, color: 0, above: vec![], below: vec![segment(0, 0, 0)] },
            LaneRow { lane: 0, color: 0, above: vec![segment(0, 0, 0)], below: vec![segment(0, 0, 0)] },
            LaneRow { lane: 0, color: 0, above: vec![segment(0, 0, 0)], below: vec![] },
        ]);
        assert_eq!(lane_count(&rows), 1);
    }

    #[test]
    fn a_branch_opens_a_lane_and_curves_into_its_parent_lane() {
        let rows = assign_lanes(&[commit("d", &["b"]), commit("c", &["b"]), commit("b", &["a"]), commit("a", &[])]);
        assert_eq!(rows[1], LaneRow {
            lane: 1,
            color: 1,
            above: vec![segment(0, 0, 0)],
            below: vec![segment(0, 0, 0), segment(1, 0, 1)],
        });
        assert_eq!(rows[2].above, vec![segment(0, 0, 0)]);
        assert_eq!(rows[2].below, vec![segment(0, 0, 0)]);
        assert_eq!(lane_count(&rows), 2);
    }

    #[test]
    fn a_merge_forks_a_lane_for_its_second_parent_and_closes_it_again() {
        let rows = assign_lanes(&[commit("m", &["a", "f"]), commit("f", &["a"]), commit("a", &[])]);
        assert_eq!((rows[0].lane, rows[0].color), (0, 0));
        assert!(rows[0].above.is_empty());
        assert_eq!(rows[0].below, vec![segment(0, 0, 0), segment(0, 1, 1)]);
        assert_eq!(rows[1], LaneRow {
            lane: 1,
            color: 1,
            above: vec![segment(0, 0, 0), segment(1, 1, 1)],
            below: vec![segment(0, 0, 0), segment(1, 0, 1)],
        });
        assert_eq!(rows[2], LaneRow { lane: 0, color: 0, above: vec![segment(0, 0, 0)], below: vec![] });
    }

    #[test]
    fn a_merge_into_an_already_open_lane_reuses_that_lane_and_its_color() {
        let rows = assign_lanes(&[
            commit("t", &["x"]),
            commit("m", &["a", "x"]),
            commit("x", &["a"]),
            commit("a", &[]),
        ]);
        assert_eq!(rows[1].lane, 1);
        assert_eq!(rows[1].below, vec![segment(0, 0, 0), segment(1, 1, 1), segment(1, 0, 0)]);
    }

    #[test]
    fn an_octopus_merge_opens_one_lane_per_extra_parent() {
        let rows = assign_lanes(&[
            commit("o", &["a", "b", "c"]),
            commit("c", &["a"]),
            commit("b", &["a"]),
            commit("a", &[]),
        ]);
        assert_eq!(rows[0].below, vec![segment(0, 0, 0), segment(0, 1, 1), segment(0, 2, 2)]);
        assert_eq!((rows[1].lane, rows[1].color), (2, 2));
        assert_eq!((rows[2].lane, rows[2].color), (1, 1));
        assert_eq!(rows[3].above, vec![segment(0, 0, 0)]);
        assert_eq!(lane_count(&rows), 3);
    }

    #[test]
    fn parentless_roots_free_their_lane_for_the_next_tip() {
        let rows = assign_lanes(&[commit("r1", &[]), commit("r2", &[]), commit("t", &["r3"]), commit("r3", &[])]);
        assert_eq!(rows[0], LaneRow { lane: 0, color: 0, above: vec![], below: vec![] });
        assert_eq!(rows[1], LaneRow { lane: 0, color: 1, above: vec![], below: vec![] });
        assert_eq!(rows[3], LaneRow { lane: 0, color: 2, above: vec![segment(0, 0, 2)], below: vec![] });
    }

    #[test]
    fn parents_outside_the_limit_keep_their_lanes_running_off_the_bottom() {
        let rows = assign_lanes(&[commit("m", &["gone", "lost"]), commit("n", &["other"])]);
        assert_eq!(rows[0].below, vec![segment(0, 0, 0), segment(0, 1, 1)]);
        assert_eq!(rows[1].lane, 2);
        assert_eq!(rows[1].above, vec![segment(0, 0, 0), segment(1, 1, 1)]);
        assert_eq!(rows[1].below, vec![segment(0, 0, 0), segment(1, 1, 1), segment(2, 2, 2)]);
    }

    #[test]
    fn no_commits_mean_no_rows_and_a_single_lane_column() {
        let rows = assign_lanes(&[]);
        assert!(rows.is_empty());
        assert_eq!(lane_count(&rows), 1);
    }

    #[test]
    fn the_log_parser_reads_every_field() {
        let (hash, parent_a, parent_b) = (id('a'), id('b'), id('c'));
        let parents = format!("{parent_a} {parent_b}");
        let output = record(&hash, &parents, "HEAD -> refs/heads/main", "1700000000", "Fix: a, b");
        let commits = parse_log(&output);
        assert_eq!(commits, vec![Commit {
            hash,
            parents: vec![parent_a, parent_b],
            refs: vec![CommitRef { name: "main".to_string(), kind: RefKind::CurrentBranch }],
            author: "Ada Lovelace".to_string(),
            author_time: 1_700_000_000,
            subject: "Fix: a, b".to_string(),
        }]);
    }

    #[test]
    fn the_log_parser_skips_malformed_records_and_keeps_the_rest() {
        let good = record(&id('a'), "", "", "1", "good");
        let bad_hash = record("not-a-hash", "", "", "1", "bad");
        let flag_like_hash = record("--output=/tmp/x", "", "", "1", "bad");
        let bad_parent = record(&id('b'), "nope", "", "1", "bad");
        let bad_time = record(&id('c'), "", "", "soon", "bad");
        let output = format!("{bad_hash}{flag_like_hash}{good}{bad_parent}{bad_time}too\u{1f}few\u{1e}\n");
        let commits = parse_log(&output);
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].subject, "good");
        assert!(parse_log("").is_empty());
    }

    #[test]
    fn a_separator_inside_the_subject_stays_in_the_subject() {
        let commits = parse_log(&record(&id('a'), "", "", "1", "one\u{1f}two"));
        assert_eq!(commits[0].subject, "one\u{1f}two");
    }

    #[test]
    fn decorations_classify_refs_and_list_the_current_branch_first() {
        let refs = parse_decorations(
            "refs/remotes/origin/feature/x, tag: refs/tags/v1, refs/heads/feature/y, HEAD -> refs/heads/main, \
             refs/remotes/origin/HEAD, refs/stash",
        );
        let summary: Vec<(&str, RefKind)> = refs.iter().map(|item| (item.name.as_str(), item.kind)).collect();
        assert_eq!(summary, vec![
            ("main", RefKind::CurrentBranch),
            ("feature/y", RefKind::LocalBranch),
            ("origin/feature/x", RefKind::RemoteBranch),
            ("v1", RefKind::Tag),
            ("stash", RefKind::Tag),
        ]);
        assert_eq!(parse_decorations("HEAD")[0], CommitRef { name: "HEAD".to_string(), kind: RefKind::CurrentBranch });
        assert!(parse_decorations("").is_empty());
    }

    #[test]
    fn the_filter_matches_subject_author_or_ref_ignoring_case() {
        let mut tagged = commit("a", &[]);
        tagged.refs = vec![CommitRef { name: "release/1.0".to_string(), kind: RefKind::Tag }];
        tagged.author = "Grace".to_string();
        let commits = vec![commit("b", &[]), tagged];
        assert_eq!(visible_commits(&commits, ""), vec![0, 1]);
        assert_eq!(visible_commits(&commits, "  "), vec![0, 1]);
        assert_eq!(visible_commits(&commits, "SUBJECT B"), vec![0]);
        assert_eq!(visible_commits(&commits, "grace"), vec![1]);
        assert_eq!(visible_commits(&commits, "Release/"), vec![1]);
        assert!(visible_commits(&commits, "missing").is_empty());
    }

    #[test]
    fn selection_survives_while_visible_and_falls_back_to_the_first_row() {
        let commits = vec![commit("a", &[]), commit("b", &[])];
        assert_eq!(reconcile_selection(&commits, &[0, 1], Some("b")).as_deref(), Some("b"));
        assert_eq!(reconcile_selection(&commits, &[0], Some("b")).as_deref(), Some("a"));
        assert_eq!(reconcile_selection(&commits, &[0, 1], None).as_deref(), Some("a"));
        assert_eq!(reconcile_selection(&commits, &[], Some("b")), None);
    }

    #[test]
    fn moving_clamps_to_the_list() {
        assert_eq!(moved_position(Some(0), -1, 3), Some(0));
        assert_eq!(moved_position(Some(1), 1, 3), Some(2));
        assert_eq!(moved_position(Some(2), 1, 3), Some(2));
        assert_eq!(moved_position(None, 1, 3), Some(0));
        assert_eq!(moved_position(Some(0), 1, 0), None);
    }

    #[test]
    fn more_history_loads_only_near_the_end_of_a_full_page() {
        assert!(should_load_more(460, 500, 500));
        assert!(!should_load_more(100, 500, 500));
        assert!(!should_load_more(120, 120, 500));
        assert!(should_load_more(990, 1000, 1000));
    }

    #[test]
    fn relative_time_picks_the_largest_whole_unit() {
        let now = 1_000_000_000;
        assert_eq!(relative_time(now, now), "just now");
        assert_eq!(relative_time(now, now + 100), "just now");
        assert_eq!(relative_time(now, now - 59), "just now");
        assert_eq!(relative_time(now, now - 60), "1m ago");
        assert_eq!(relative_time(now, now - 3_600), "1h ago");
        assert_eq!(relative_time(now, now - 86_400 * 2), "2d ago");
        assert_eq!(relative_time(now, now - 86_400 * 45), "1mo ago");
        assert_eq!(relative_time(now, now - 86_400 * 800), "2y ago");
    }

    #[test]
    fn pills_drop_when_the_row_runs_out_of_room() {
        let pill = |name: &str| CommitRef { name: name.to_string(), kind: RefKind::LocalBranch };
        let refs = vec![pill("main"), pill("origin/main")];
        assert_eq!(pills_that_fit(&refs, 0.0, 1.0), 0);
        assert_eq!(pills_that_fit(&refs, 45.0, 1.0), 1);
        assert_eq!(pills_that_fit(&refs, 300.0, 1.0), 2);
        assert_eq!(pills_that_fit(&refs, 45.0, 2.0), 0);
        let endless = vec![pill(&"x".repeat(500))];
        assert_eq!(pills_that_fit(&endless, PILL_MAX_WIDTH_PX, 1.0), 1);
    }

    #[test]
    fn graph_keys_map_navigation_and_filter_and_leave_the_rest() {
        let plain = |key: &str| Keystroke { modifiers: Modifiers::none(), key: key.to_string(), key_char: None };
        assert_eq!(graph_key(&plain("j")), Some(GraphKey::Move(1)));
        assert_eq!(graph_key(&plain("down")), Some(GraphKey::Move(1)));
        assert_eq!(graph_key(&plain("k")), Some(GraphKey::Move(-1)));
        assert_eq!(graph_key(&plain("up")), Some(GraphKey::Move(-1)));
        assert_eq!(graph_key(&plain("/")), Some(GraphKey::StartFilter));
        assert_eq!(graph_key(&plain("escape")), Some(GraphKey::ClearFilter));
        assert_eq!(graph_key(&plain("enter")), None);
        assert_eq!(graph_key(&plain("x")), None);
        let cmd_j = Keystroke { modifiers: Modifiers::command(), key: "j".to_string(), key_char: None };
        assert_eq!(graph_key(&cmd_j), None);
    }

    #[test]
    fn toggling_follows_the_focused_pane() {
        let (terminal, graph) = (PanelId::new(), PanelId::new());
        assert_eq!(
            resolve_graph_toggle(GraphToggleSource::LocalTerminal { panel: terminal, graph: None }),
            GraphToggle::Open { owner: terminal }
        );
        assert_eq!(
            resolve_graph_toggle(GraphToggleSource::LocalTerminal { panel: terminal, graph: Some(graph) }),
            GraphToggle::Close { graph }
        );
        assert_eq!(resolve_graph_toggle(GraphToggleSource::Graph { panel: graph }), GraphToggle::Close { graph });
        assert_eq!(resolve_graph_toggle(GraphToggleSource::Other), GraphToggle::Unavailable);
    }

    #[test]
    fn a_restored_graph_adopts_the_adjacent_terminal_first() {
        let (first, owner, graph) = (PanelId::new(), PanelId::new(), PanelId::new());
        let mut layout = LayoutNode::leaf(first);
        layout.split_with(first, Axis::Horizontal, 0.5, owner).unwrap();
        layout.split_with(owner, Axis::Horizontal, 0.66, graph).unwrap();
        assert_eq!(derive_graph_owner(&layout, graph, |_| true), Some(owner));
    }

    #[test]
    fn a_restored_graph_falls_back_to_any_candidate_and_otherwise_has_no_owner() {
        let (first, editor, graph) = (PanelId::new(), PanelId::new(), PanelId::new());
        let mut layout = LayoutNode::leaf(first);
        layout.split_with(first, Axis::Horizontal, 0.5, editor).unwrap();
        layout.split_with(editor, Axis::Horizontal, 0.66, graph).unwrap();
        assert_eq!(derive_graph_owner(&layout, graph, |panel| panel == first), Some(first));
        assert_eq!(derive_graph_owner(&layout, graph, |_| false), None);
        assert_eq!(derive_graph_owner(&LayoutNode::leaf(graph), graph, |_| true), None);
    }

    #[test]
    fn commit_details_split_message_and_files() {
        let description = "ada@example.com\u{1f}Body line\n\nMore\n\n";
        let details = parse_commit_details("abc", description, "src/a.rs\0dir/b c.rs\0");
        assert_eq!(details, Some(CommitDetails {
            hash: "abc".to_string(),
            email: "ada@example.com".to_string(),
            message: "Body line\n\nMore".to_string(),
            files: vec!["src/a.rs".to_string(), "dir/b c.rs".to_string()],
        }));
        assert_eq!(parse_commit_details("abc", "garbage", ""), None);
    }

    fn git(dir: &Path, args: &[&str]) -> String {
        let output = Command::new("git")
            .args(["-c", "user.name=Ada", "-c", "user.email=ada@example.com", "-c", "commit.gpgsign=false"])
            .arg("-C")
            .arg(dir)
            .args(args)
            .output()
            .expect("git runs");
        assert!(output.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&output.stderr));
        String::from_utf8(output.stdout).expect("utf8")
    }

    fn commit_file(dir: &Path, name: &str, message: &str) {
        std::fs::write(dir.join(name), message).expect("write");
        git(dir, &["add", name]);
        git(dir, &["commit", "-m", message]);
    }

    #[test]
    fn a_real_repository_reads_commits_refs_details_and_a_changing_fingerprint() {
        let dir = tempfile::tempdir().expect("tempdir");
        let repo = dir.path().canonicalize().expect("canonical");
        git(&repo, &["init", "-b", "main"]);
        commit_file(&repo, "a.txt", "first");
        git(&repo, &["checkout", "-b", "topic"]);
        commit_file(&repo, "b.txt", "second");
        git(&repo, &["checkout", "main"]);
        commit_file(&repo, "c.txt", "third");
        git(&repo, &["merge", "--no-ff", "topic", "-m", "merge topic\n\nThe body"]);
        git(&repo, &["tag", "v1"]);

        let snapshot = read_graph(&repo, INITIAL_COMMIT_LIMIT);
        assert_eq!(snapshot.commits.len(), 4);
        assert_eq!(snapshot.rows.len(), 4);
        let head = &snapshot.commits[0];
        assert_eq!(head.subject, "merge topic");
        assert_eq!(head.parents.len(), 2);
        let refs: Vec<(&str, RefKind)> = head.refs.iter().map(|item| (item.name.as_str(), item.kind)).collect();
        assert_eq!(refs, vec![("main", RefKind::CurrentBranch), ("v1", RefKind::Tag)]);
        assert_eq!(snapshot.probe.as_ref().map(|probe| probe.root.clone()), Some(repo.clone()));

        let details = read_commit_details(&repo, &head.hash).expect("details");
        assert_eq!(details.email, "ada@example.com");
        assert_eq!(details.message, "The body");
        assert_eq!(details.files, vec!["b.txt".to_string()]);

        assert_eq!(read_graph(&repo, 2).commits.len(), 2);
        let before = read_repo_probe(&repo);
        assert_eq!(read_repo_probe(&repo), before);
        commit_file(&repo, "d.txt", "fourth");
        assert_ne!(read_repo_probe(&repo), before);
    }

    #[test]
    fn outside_a_repository_there_is_no_graph_and_an_empty_repository_has_no_commits() {
        let outside = tempfile::tempdir().expect("tempdir");
        let snapshot = read_graph(outside.path(), INITIAL_COMMIT_LIMIT);
        assert_eq!(snapshot.probe, None);
        assert!(snapshot.commits.is_empty());

        let empty = tempfile::tempdir().expect("tempdir");
        git(empty.path(), &["init"]);
        let snapshot = read_graph(empty.path(), INITIAL_COMMIT_LIMIT);
        assert!(snapshot.probe.is_some());
        assert!(snapshot.commits.is_empty());
    }
}
