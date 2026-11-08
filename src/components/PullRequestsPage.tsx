import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Check, ChevronDown, Copy, Folder, GitPullRequest } from "lucide-react";
import { ghProblemOf, prApi, PRS_UPDATED } from "../gitApi";
import { elapsedSince } from "../tasks";
import type { Project, PullRequest } from "../types";
import { useLoaded } from "../useLoaded";
import { GhProblemState } from "./GhProblemState";
import { ChecksDot } from "./PrBadge";
import { checksPresentation, PR_STATE_PRESENTATION, prDisplayState, reviewDecisionLabel } from "./prPresentation";
import { PullRequestDetail } from "./PullRequestDetail";
import { Segmented } from "./Segmented";
import { cn, FOCUS_RING, MENU_ITEM, MENU_POPUP, MenuSeparator } from "./ui";
import { useCopyToClipboard } from "./useCopyToClipboard";
import { usePopup } from "./usePopup";

type ListState = "open" | "merged" | "closed";

const ALL_PROJECTS = "all";

const STATE_OPTIONS = [
  { value: "open" as const, label: "Open" },
  { value: "merged" as const, label: "Merged" },
  { value: "closed" as const, label: "Closed" },
];

const ROW_COPY_BUTTON = cn(
  "absolute top-2 right-2 inline-flex h-6 min-w-6 cursor-pointer items-center justify-center gap-1 rounded-md px-1",
  "text-2xs font-medium text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/[0.08]",
  "hover:text-foreground focus-visible:opacity-100 group-hover/pr:opacity-100 [&_svg]:size-3.5",
  FOCUS_RING,
);

const ROW_COPIED = "text-success-foreground opacity-100";

const REVIEW_TONE: Record<string, string> = {
  APPROVED: "text-success-foreground",
  CHANGES_REQUESTED: "text-error-foreground",
  REVIEW_REQUIRED: "text-muted-foreground",
};

interface ProjectPullRequest extends PullRequest {
  projectId: string;
}

interface Selection {
  projectId: string;
  number: number;
}

async function listAcross(projects: Project[], state: ListState): Promise<ProjectPullRequest[]> {
  const results = await Promise.allSettled(
    projects.map(async (project) =>
      (await prApi.list(project.id, state)).map((pr) => ({ ...pr, projectId: project.id })),
    ),
  );
  const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
  const ghFailure = failures.find((reason) => ghProblemOf(reason) !== null);
  if (ghFailure !== undefined) throw ghFailure;
  if (failures.length === results.length && failures.length > 0) throw failures[0];
  return results
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

function useWorkspacePullRequests(projects: Project[], state: ListState) {
  const key = projects.length === 0 ? null : `${projects.map((project) => project.id).join(",")}:${state}`;
  const loaded = useLoaded(key, () => listAcross(projects, state));
  const { refresh } = loaded;

  useEffect(() => {
    const unlisten = listen(PRS_UPDATED, refresh);
    return () => {
      unlisten.then((stop) => stop());
    };
  }, [refresh]);

  return loaded;
}

interface ProjectFilterProps {
  projects: Project[];
  value: string;
  onChange: (value: string) => void;
}

function ProjectFilter({ projects, value, onChange }: ProjectFilterProps) {
  const popup = usePopup();
  const current = projects.find((project) => project.id === value);

  function choose(next: string) {
    onChange(next);
    popup.close();
  }

  return (
    <div className="relative min-w-0" ref={popup.rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={popup.isOpen}
        aria-label={`Project: ${current?.name ?? "All projects"}`}
        onClick={popup.toggle}
        className={cn(
          "inline-flex h-7 max-w-48 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium",
          "text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent",
          FOCUS_RING,
        )}
      >
        <Folder className="size-3.5 shrink-0" />
        <span className="truncate">{current?.name ?? "All projects"}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-70" />
      </button>
      {popup.isOpen && (
        <div role="menu" aria-label="Projects" className={cn(MENU_POPUP, "absolute top-full right-0 mt-1 w-56")}>
          <ProjectOption label="All projects" isChecked={value === ALL_PROJECTS} onPick={() => choose(ALL_PROJECTS)} />
          <MenuSeparator />
          {projects.map((project) => (
            <ProjectOption
              key={project.id}
              label={project.name}
              isChecked={project.id === value}
              onPick={() => choose(project.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectOption({ label, isChecked, onPick }: { label: string; isChecked: boolean; onPick: () => void }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={isChecked} className={MENU_ITEM} onClick={onPick}>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Check className={cn("size-3.5", !isChecked && "invisible")} />
    </button>
  );
}

interface PullRequestRowProps {
  pr: ProjectPullRequest;
  projectName: string | null;
  isSelected: boolean;
  onSelect: () => void;
}

function RowCopyLink({ isCopied, onCopy }: { isCopied: boolean; onCopy: () => void }) {
  const label = isCopied ? "Copied" : "Copy link";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onCopy}
      className={cn(ROW_COPY_BUTTON, isCopied && ROW_COPIED)}
    >
      {isCopied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {isCopied && <span>Copied</span>}
    </button>
  );
}

function PullRequestRow({ pr, projectName, isSelected, onSelect }: PullRequestRowProps) {
  const presentation = PR_STATE_PRESENTATION[prDisplayState(pr.state, pr.isDraft)];
  const checks = checksPresentation(pr.checks);
  const review = reviewDecisionLabel(pr.reviewDecision);
  const clipboard = useCopyToClipboard();
  return (
    <li className="group/pr relative">
      <button
        type="button"
        aria-current={isSelected || undefined}
        onClick={onSelect}
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
          isSelected ? "bg-accent" : "group-hover/pr:bg-accent/60",
          FOCUS_RING,
        )}
      >
        <presentation.Icon aria-label={presentation.label} className={cn("mt-0.5 size-4", presentation.toneClass)} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "flex min-w-0 items-center gap-1.5",
              clipboard.isCopied ? "pe-18" : "group-hover/pr:pe-7 group-has-focus-visible/pr:pe-7",
            )}
          >
            <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">#{pr.number}</span>
            <span className="min-w-0 truncate text-sm text-foreground">{pr.title}</span>
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
            {projectName && <span className="shrink-0">{projectName}</span>}
            <span className="min-w-0 truncate font-mono" title={pr.headRefName}>
              {pr.headRefName}
            </span>
            <span className="shrink-0">{pr.author.login}</span>
            {review && (
              <span className={cn("shrink-0", REVIEW_TONE[pr.reviewDecision ?? ""])}>{review}</span>
            )}
            {checks && (
              <span className="flex shrink-0 items-center gap-1 tabular-nums" title={checks.label}>
                <ChecksDot dotClass={checks.dotClass} label={checks.label} />
                {pr.checks.passed}/{pr.checks.total}
              </span>
            )}
            <span className="ms-auto shrink-0 tabular-nums">{elapsedSince(Date.parse(pr.updatedAt), Date.now())}</span>
          </span>
        </span>
      </button>
      <RowCopyLink isCopied={clipboard.isCopied} onCopy={() => clipboard.copy(pr.url)} />
    </li>
  );
}

function EmptyDetail() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      <GitPullRequest className="size-5" />
      Select a pull request to see its details
    </div>
  );
}

export function PullRequestsPage({ projects }: { projects: Project[] }) {
  const [state, setState] = useState<ListState>("open");
  const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS);
  const [selection, setSelection] = useState<Selection | null>(null);
  const scoped = projects.filter((project) => projectFilter === ALL_PROJECTS || project.id === projectFilter);
  const pullRequests = useWorkspacePullRequests(scoped, state);
  const problem = pullRequests.error ? ghProblemOf(pullRequests.error) : null;
  const list = pullRequests.data ?? [];
  const showsProject = projectFilter === ALL_PROJECTS && projects.length > 1;

  function projectName(projectId: string): string | null {
    if (!showsProject) return null;
    return projects.find((project) => project.id === projectId)?.name ?? null;
  }

  if (problem) {
    return (
      <GhProblemState problem={problem} onRetry={pullRequests.refresh} className="flex-1 justify-center pb-[12vh]" />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 border-t border-border">
      <div className="flex w-[clamp(20rem,30vw,27rem)] shrink-0 flex-col border-r border-border">
        <div className="flex h-11 shrink-0 items-center gap-2 px-3">
          <Segmented label="Pull request state" options={STATE_OPTIONS} value={state} onChange={setState} />
          <span className="flex-1" />
          <ProjectFilter projects={projects} value={projectFilter} onChange={setProjectFilter} />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {pullRequests.error && <li className="p-4 text-xs text-error-foreground">{pullRequests.error}</li>}
          {!pullRequests.error && list.length === 0 && (
            <li className="px-4 py-10 text-center text-xs text-muted-foreground">
              {pullRequests.isLoading ? "Loading pull requests…" : `No ${state} pull requests`}
            </li>
          )}
          {list.map((pr) => (
            <PullRequestRow
              key={`${pr.projectId}:${pr.number}`}
              pr={pr}
              projectName={projectName(pr.projectId)}
              isSelected={selection?.projectId === pr.projectId && selection.number === pr.number}
              onSelect={() => setSelection({ projectId: pr.projectId, number: pr.number })}
            />
          ))}
        </ul>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {selection ? (
          <PullRequestDetail
            key={`${selection.projectId}:${selection.number}`}
            projectId={selection.projectId}
            number={selection.number}
            onChanged={pullRequests.refresh}
          />
        ) : (
          <EmptyDetail />
        )}
      </div>
    </div>
  );
}
