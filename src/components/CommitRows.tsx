import { useState, type FormEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowUpFromLine,
  ChevronDown,
  ExternalLink,
  FileDiff,
  GitCommitHorizontal,
  GitPullRequestCreate,
} from "lucide-react";
import { gitApi } from "../gitApi";
import type { ChatPullRequest, GitStatus } from "../types";
import {
  DETAILS_ANCHORED_POPUP,
  DETAILS_ICON,
  DETAILS_LABEL,
  DETAILS_ROW,
  DETAILS_SPLIT_GROUP,
  DETAILS_SPLIT_PRIMARY,
  DETAILS_SPLIT_SECONDARY,
  DETAILS_SPLIT_SEPARATOR,
} from "./detailsStyles";
import { ChecksDot } from "./PrBadge";
import { checksPresentation, PR_STATE_PRESENTATION, prDisplayState } from "./prPresentation";
import { cn, MENU_ITEM, MENU_POPUP, PRIMARY_BUTTON, TEXT_INPUT } from "./ui";
import { usePopup } from "./usePopup";

type CommitMode = "commit" | "commitAndPush";

const COMMIT_LABEL: Record<CommitMode, string> = {
  commit: "Commit",
  commitAndPush: "Commit & push",
};

interface GitActions {
  onCommitAndPush: () => void;
  onPush: () => void;
  onCreatePr: () => void;
}

interface GitActionsMenuProps {
  label: string;
  hasChanges: boolean;
  actions: GitActions;
  triggerClassName: string;
}

function GitActionsMenu({ label, hasChanges, actions, triggerClassName }: GitActionsMenuProps) {
  const popup = usePopup();

  function choose(action: () => void) {
    action();
    popup.close();
  }

  return (
    <div className="static" ref={popup.rootRef}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={popup.isOpen}
        className={triggerClassName}
        onClick={popup.toggle}
      >
        <ChevronDown aria-hidden className="size-4" />
      </button>
      {popup.isOpen && (
        <div role="menu" aria-label="Git actions" className={cn(MENU_POPUP, DETAILS_ANCHORED_POPUP)}>
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM}
            disabled={!hasChanges}
            onClick={() => choose(actions.onCommitAndPush)}
          >
            <GitCommitHorizontal />
            Commit & push
          </button>
          <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => choose(actions.onPush)}>
            <ArrowUpFromLine />
            Push
          </button>
          <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => choose(actions.onCreatePr)}>
            <GitPullRequestCreate />
            Create PR
          </button>
        </div>
      )}
    </div>
  );
}

interface CommitFormProps {
  mode: CommitMode;
  isBusy: boolean;
  actions: GitActions;
  onSubmit: (message: string) => void;
}

function CommitForm({ mode, isBusy, actions, onSubmit }: CommitFormProps) {
  const [message, setMessage] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (message.trim()) onSubmit(message.trim());
  }

  return (
    <form onSubmit={submit} aria-label="Commit changes" className="flex flex-col gap-1.5 px-1 pt-1 pb-1">
      <textarea
        autoFocus
        rows={3}
        placeholder="Commit message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && event.metaKey && submit(event)}
        className={cn(TEXT_INPUT, "h-auto resize-none py-1.5 text-[13px] leading-5")}
      />
      <div className="relative flex justify-end">
        <div className="flex">
          <button
            type="submit"
            disabled={!message.trim() || isBusy}
            className={cn(PRIMARY_BUTTON, "h-7 rounded-e-none px-2.5 text-xs")}
          >
            {COMMIT_LABEL[mode]}
          </button>
          <GitActionsMenu
            label="More git actions"
            hasChanges
            actions={actions}
            triggerClassName={cn(
              PRIMARY_BUTTON,
              "h-7 rounded-s-none border-s border-primary-foreground/20 px-1.5 aria-expanded:bg-primary/90",
            )}
          />
        </div>
      </div>
    </form>
  );
}

interface CommitRowsProps {
  projectId: string;
  status: GitStatus | null;
  onStatusChanged: () => void;
  onCreatePr: () => void;
  onOpenDiff: () => void;
}

function totalLines(status: GitStatus | null, key: "added" | "removed"): number {
  return (status?.files ?? []).reduce((sum, file) => sum + file[key], 0);
}

function ChangesRow({ status, onOpenDiff }: Pick<CommitRowsProps, "status" | "onOpenDiff">) {
  const added = totalLines(status, "added");
  const removed = totalLines(status, "removed");
  return (
    <button type="button" className={DETAILS_ROW} onClick={onOpenDiff}>
      <FileDiff aria-hidden className={DETAILS_ICON} />
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="shrink-0">Changes</span>
        <span className="ml-auto flex shrink-0 items-baseline gap-2 ps-2 font-mono tabular-nums">
          <span className={added ? "text-diff-addition" : "text-muted-foreground"}>+{added}</span>
          <span className={removed ? "text-diff-deletion" : "text-muted-foreground"}>−{removed}</span>
        </span>
      </span>
    </button>
  );
}

function outcomeOfPush(status: GitStatus): string {
  return status.upstream ? `Pushed to ${status.upstream}` : "Pushed";
}

export function CommitRows({ projectId, status, onStatusChanged, onCreatePr, onOpenDiff }: CommitRowsProps) {
  const [mode, setMode] = useState<CommitMode | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ text: string; isError: boolean } | null>(null);
  const hasChanges = (status?.files.length ?? 0) > 0;

  async function run(action: () => Promise<string>) {
    setIsBusy(true);
    setOutcome(null);
    try {
      setOutcome({ text: await action(), isError: false });
      setMode(null);
    } catch (error) {
      setOutcome({ text: String(error).replace(/^git: /, ""), isError: true });
    } finally {
      setIsBusy(false);
      onStatusChanged();
    }
  }

  async function commit(message: string) {
    const committed = await gitApi.commit(projectId, message);
    if (mode !== "commitAndPush") return `Committed ${committed.oid.slice(0, 7)}`;
    return outcomeOfPush(await gitApi.push(projectId));
  }

  const actions: GitActions = {
    onCommitAndPush: () => setMode("commitAndPush"),
    onPush: () => run(async () => outcomeOfPush(await gitApi.push(projectId))),
    onCreatePr,
  };

  return (
    <>
      <div role="group" aria-label="Commit" className={DETAILS_SPLIT_GROUP}>
        <button
          type="button"
          aria-expanded={mode !== null}
          disabled={!hasChanges}
          title={hasChanges ? undefined : "No changes to commit"}
          className={DETAILS_SPLIT_PRIMARY}
          onClick={() => setMode(mode ? null : "commit")}
        >
          <GitCommitHorizontal aria-hidden className={DETAILS_ICON} />
          <span className={DETAILS_LABEL}>Commit</span>
          {!hasChanges && <span className="ms-auto text-xs font-normal text-muted-foreground">No changes</span>}
        </button>
        <span aria-hidden="true" className={DETAILS_SPLIT_SEPARATOR} />
        <GitActionsMenu
          label="Commit options"
          hasChanges={hasChanges}
          actions={actions}
          triggerClassName={cn(DETAILS_SPLIT_SECONDARY, "[&_svg]:text-muted-foreground")}
        />
      </div>
      {mode && (
        <CommitForm mode={mode} isBusy={isBusy} actions={actions} onSubmit={(message) => run(() => commit(message))} />
      )}
      {outcome && (
        <p
          role="status"
          className={cn("px-2.5 pb-1 text-xs", outcome.isError ? "text-error-foreground" : "text-muted-foreground")}
        >
          {outcome.text}
        </p>
      )}
      <ChangesRow status={status} onOpenDiff={onOpenDiff} />
    </>
  );
}

export function PullRequestRow({ pr }: { pr: ChatPullRequest }) {
  const presentation = PR_STATE_PRESENTATION[prDisplayState(pr.state, pr.isDraft)];
  const checks = checksPresentation(pr.checks);
  return (
    <button type="button" className={DETAILS_ROW} title="Open on GitHub" onClick={() => void openUrl(pr.url)}>
      <presentation.Icon aria-hidden className={cn("size-4", presentation.toneClass)} />
      <span className={DETAILS_LABEL}>Pull request #{pr.number}</span>
      {checks && <ChecksDot dotClass={checks.dotClass} label={checks.label} />}
      <span className="ms-auto text-xs font-normal text-muted-foreground">{presentation.label}</span>
      <ExternalLink aria-hidden className="size-3.5 text-muted-foreground" />
    </button>
  );
}
