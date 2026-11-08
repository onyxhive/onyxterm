import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Check,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  Copy,
  ExternalLink,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { ghProblemOf, prApi } from "../gitApi";
import { elapsedSince } from "../tasks";
import type { PrCheck, PullRequestDetail as Detail } from "../types";
import { usePr } from "../useGit";
import { useLoaded } from "../useLoaded";
import { MERGE_METHOD_LABELS, MERGE_METHODS, useMergeMethod } from "../useMergeMethod";
import { GhProblemState } from "./GhProblemState";
import { Markdown } from "./Markdown";
import { PR_STATE_PRESENTATION, prDisplayState, reviewDecisionLabel } from "./prPresentation";
import { PullRequestChanges } from "./PullRequestChanges";
import { Segmented } from "./Segmented";
import { cn, GHOST_BUTTON, MENU_ITEM, MENU_POPUP, MenuLabel, OUTLINE_BUTTON, PRIMARY_BUTTON } from "./ui";
import { useCopyToClipboard } from "./useCopyToClipboard";
import { usePopup } from "./usePopup";

type DetailTab = "overview" | "changes" | "checks";

const DETAIL_TABS = [
  { value: "overview" as const, label: "Overview" },
  { value: "changes" as const, label: "Changes" },
  { value: "checks" as const, label: "Checks" },
];

const CONFLICTING = "CONFLICTING";

interface CheckTone {
  Icon: LucideIcon;
  className: string;
}

const CHECK_TONES: Record<string, CheckTone> = {
  pass: { Icon: CircleCheck, className: "text-success-foreground" },
  fail: { Icon: CircleX, className: "text-error-foreground" },
  cancel: { Icon: CircleX, className: "text-muted-foreground" },
  pending: { Icon: CircleDashed, className: "text-warning-foreground" },
  skipping: { Icon: CircleMinus, className: "text-muted-foreground" },
};

const REVIEW_VERBS: Record<string, string> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "requested changes",
  COMMENTED: "reviewed",
  DISMISSED: "had a review dismissed",
};

interface ActivityEntry {
  author: string;
  verb: string;
  body: string;
  at: string;
}

function activityOf(detail: Detail): ActivityEntry[] {
  const reviews = detail.reviews.map((review) => ({
    author: review.author.login,
    verb: REVIEW_VERBS[review.state] ?? "reviewed",
    body: review.body,
    at: review.submittedAt,
  }));
  const comments = detail.comments.map((comment) => ({
    author: comment.author.login,
    verb: "commented",
    body: comment.body,
    at: comment.createdAt,
  }));
  return [...reviews, ...comments].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function ago(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? "" : elapsedSince(parsed, Date.now());
}

function SectionHeading({ title, count }: { title: string; count?: number }) {
  return (
    <h3 className="flex items-center gap-2 px-1 pb-2 text-xs font-medium text-muted-foreground">
      {title}
      {count !== undefined && <span className="font-normal tabular-nums">{count}</span>}
    </h3>
  );
}

function ChecksList({ projectId, number }: { projectId: string; number: number }) {
  const checks = useLoaded(`${projectId}:${number}:checks`, () => prApi.checks(projectId, number));
  const list = checks.data ?? [];
  return (
    <section aria-label="Checks">
      <SectionHeading title="Checks" count={list.length} />
      {list.length === 0 && (
        <p className="px-1 text-xs text-muted-foreground">{checks.isLoading ? "Loading checks…" : "No checks"}</p>
      )}
      <ul className="flex flex-col">
        {list.map((check) => (
          <CheckRow key={`${check.workflow}:${check.name}`} check={check} />
        ))}
      </ul>
    </section>
  );
}

function CheckRow({ check }: { check: PrCheck }) {
  const tone = CHECK_TONES[check.bucket] ?? CHECK_TONES.pending;
  return (
    <li className="flex h-8 min-w-0 items-center gap-2.5 rounded-md px-1 text-sm">
      <tone.Icon aria-label={check.bucket} className={cn("size-4 shrink-0", tone.className)} />
      <span className="min-w-0 truncate text-foreground/85">{check.name}</span>
      {check.workflow && <span className="min-w-0 truncate text-xs text-muted-foreground">{check.workflow}</span>}
      <span className="flex-1" />
      {check.link && (
        <button
          type="button"
          className={cn(GHOST_BUTTON, "h-6 px-1.5 text-xs")}
          onClick={() => void openUrl(check.link)}
        >
          Details
        </button>
      )}
    </li>
  );
}

function Avatar({ login }: { login: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.08] text-2xs font-medium",
        "text-foreground/70 uppercase",
      )}
    >
      {login.slice(0, 1)}
    </span>
  );
}

function ActivityList({ detail }: { detail: Detail }) {
  const entries = activityOf(detail);
  return (
    <section>
      <SectionHeading title="Reviews and comments" count={entries.length} />
      {entries.length === 0 && <p className="px-1 text-xs text-muted-foreground">No reviews or comments yet</p>}
      <ol className="flex flex-col gap-3">
        {entries.map((entry, index) => (
          <li key={index} className="flex gap-2.5 px-1">
            <Avatar login={entry.author} />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-1.5 text-sm">
                <span className="font-medium text-foreground">{entry.author}</span>
                <span className="text-muted-foreground">{entry.verb}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{ago(entry.at)}</span>
              </p>
              {entry.body && <Markdown source={entry.body} className="mt-0.5" />}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface MergeControlProps {
  detail: Detail;
  projectId: string;
  onMerged: () => void;
}

function MergeControl({ detail, projectId, onMerged }: MergeControlProps) {
  const popup = usePopup();
  const [method, chooseMethod] = useMergeMethod();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasConflicts = detail.mergeable === CONFLICTING;

  async function merge() {
    setIsMerging(true);
    setError(null);
    try {
      await prApi.merge(projectId, detail.number, method);
      setIsConfirming(false);
      onMerged();
    } catch (failure) {
      setError(String(failure).replace(/^gh: /, ""));
    } finally {
      setIsMerging(false);
    }
  }

  if (isConfirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground/85">
            {MERGE_METHOD_LABELS[method]} into <code className="font-mono text-xs">{detail.baseRefName}</code>?
          </span>
          <button type="button" className={GHOST_BUTTON} onClick={() => setIsConfirming(false)}>
            Cancel
          </button>
          <button type="button" className={PRIMARY_BUTTON} disabled={isMerging} onClick={merge}>
            Confirm merge
          </button>
        </div>
        {error && <p className="text-xs text-error-foreground">{error}</p>}
      </div>
    );
  }

  return (
    <div className="relative flex" ref={popup.rootRef}>
      <button
        type="button"
        disabled={hasConflicts || detail.isDraft}
        title={hasConflicts ? "Resolve the conflicts first" : undefined}
        className={cn(PRIMARY_BUTTON, "rounded-e-none")}
        onClick={() => setIsConfirming(true)}
      >
        {MERGE_METHOD_LABELS[method]}
      </button>
      <button
        type="button"
        aria-label="Merge method"
        aria-haspopup="menu"
        aria-expanded={popup.isOpen}
        disabled={hasConflicts || detail.isDraft}
        className={cn(PRIMARY_BUTTON, "rounded-s-none border-s border-primary-foreground/20 px-2")}
        onClick={popup.toggle}
      >
        <ChevronDown />
      </button>
      {popup.isOpen && (
        <div role="menu" aria-label="Merge method" className={cn(MENU_POPUP, "absolute top-full right-0 mt-1 w-56")}>
          <MenuLabel>Merge method</MenuLabel>
          {MERGE_METHODS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="menuitemradio"
              aria-checked={candidate === method}
              className={MENU_ITEM}
              onClick={() => {
                chooseMethod(candidate);
                popup.close();
              }}
            >
              {MERGE_METHOD_LABELS[candidate]}
              <Check className={cn("ms-auto size-3.5", candidate !== method && "invisible")} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyLinkButton({ url }: { url: string }) {
  const clipboard = useCopyToClipboard();
  return (
    <button type="button" className={cn(OUTLINE_BUTTON, "min-w-28")} onClick={() => clipboard.copy(url)}>
      {clipboard.isCopied ? <Check /> : <Copy />}
      <span aria-live="polite">{clipboard.isCopied ? "Copied" : "Copy link"}</span>
    </button>
  );
}

function DetailHeader({ detail, projectId, onMerged }: MergeControlProps) {
  const presentation = PR_STATE_PRESENTATION[prDisplayState(detail.state, detail.isDraft)];
  const review = reviewDecisionLabel(detail.reviewDecision);
  const isOpen = detail.state.toLowerCase() === "open";
  return (
    <header className="flex flex-col gap-3 px-6 pt-5 pb-4">
      <div className="flex items-start gap-3">
        <h2 className="min-w-0 flex-1 text-lg leading-snug font-semibold text-pretty text-foreground">
          {detail.title} <span className="font-normal text-muted-foreground tabular-nums">#{detail.number}</span>
        </h2>
        <div className="flex shrink-0 items-start gap-2">
          <CopyLinkButton url={detail.url} />
          <button type="button" className={OUTLINE_BUTTON} onClick={() => void openUrl(detail.url)}>
            <ExternalLink />
            Open on GitHub
          </button>
          {isOpen && <MergeControl detail={detail} projectId={projectId} onMerged={onMerged} />}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        <span className={cn("inline-flex items-center gap-1 font-medium", presentation.toneClass)}>
          <presentation.Icon className="size-3.5" />
          {presentation.label}
        </span>
        <span>
          <span className="font-medium text-foreground/85">{detail.author.login}</span> wants to merge
        </span>
        <span className="font-mono">
          {detail.headRefName} → {detail.baseRefName}
        </span>
        {review && <span>{review}</span>}
        <span className="tabular-nums">updated {ago(detail.updatedAt)} ago</span>
      </div>
      {detail.mergeable === CONFLICTING && (
        <p className="flex items-center gap-2 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning-foreground">
          <TriangleAlert className="size-3.5 shrink-0" />
          This branch has conflicts with {detail.baseRefName}. Resolve them before merging.
        </p>
      )}
    </header>
  );
}

interface PullRequestDetailProps {
  projectId: string;
  number: number;
  onChanged: () => void;
}

function OverviewTab({ detail }: { detail: Detail }) {
  return (
    <>
      {detail.body ? (
        <Markdown source={detail.body} />
      ) : (
        <p className="text-sm text-muted-foreground">No description</p>
      )}
      <ActivityList detail={detail} />
    </>
  );
}

export function PullRequestDetail({ projectId, number, onChanged }: PullRequestDetailProps) {
  const pr = usePr(projectId, number);
  const [tab, setTab] = useState<DetailTab>("overview");
  const problem = pr.error ? ghProblemOf(pr.error) : null;

  function merged() {
    pr.refresh();
    onChanged();
  }

  if (problem) return <GhProblemState problem={problem} onRetry={pr.refresh} />;
  if (pr.error) return <p className="p-6 text-sm text-error-foreground">{pr.error}</p>;
  if (!pr.data) return <p className="p-6 text-sm text-muted-foreground">Loading the pull request…</p>;
  const detail = pr.data;
  return (
    <article aria-label={`Pull request #${detail.number}`} className="flex min-h-0 flex-1 flex-col">
      <DetailHeader detail={detail} projectId={projectId} onMerged={merged} />
      <nav aria-label="Pull request tabs" className="flex shrink-0 items-center border-y border-border px-6 py-2">
        <Segmented label="Pull request section" options={DETAIL_TABS} value={tab} onChange={setTab} />
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            "flex flex-col gap-6 px-6 py-5",
            tab !== "changes" && "max-w-(--chat-content-max-width)",
          )}
        >
          {tab === "overview" && <OverviewTab detail={detail} />}
          {tab === "changes" && (
            <PullRequestChanges projectId={projectId} number={detail.number} files={detail.files} />
          )}
          {tab === "checks" && <ChecksList projectId={projectId} number={detail.number} />}
        </div>
      </div>
    </article>
  );
}
