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
import { gitMenuItems, type GitMenuAction, type GitMenuItem } from "../gitActions";
import { gitApi, type GitTarget } from "../gitApi";
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
import { cn, GHOST_BUTTON, MENU_ITEM, MENU_POPUP, PRIMARY_BUTTON, TEXT_INPUT } from "./ui";
import { usePopup } from "./usePopup";

type CommitMode = "commit" | "commitAndPush";

const MENU_ICONS: Record<GitMenuAction, typeof GitCommitHorizontal> = {
  commit: GitCommitHorizontal,
  push: ArrowUpFromLine,
  createPr: GitPullRequestCreate,
};

interface GitActionsMenuProps {
  items: GitMenuItem[];
  onChoose: (action: GitMenuAction) => void;
}

function GitActionsMenu({ items, onChoose }: GitActionsMenuProps) {
  const popup = usePopup();

  function choose(action: GitMenuAction) {
    onChoose(action);
    popup.close();
  }

  return (
    <div className="static" ref={popup.rootRef}>
      <button
        type="button"
        aria-label="Commit options"
        aria-haspopup="menu"
        aria-expanded={popup.isOpen}
        disabled={items.length === 0}
        className={cn(DETAILS_SPLIT_SECONDARY, "[&_svg]:text-muted-foreground")}
        onClick={popup.toggle}
      >
        <ChevronDown aria-hidden className="size-4" />
      </button>
      {popup.isOpen && (
        <div role="menu" aria-label="Git actions" className={cn(MENU_POPUP, DETAILS_ANCHORED_POPUP)}>
          {items.map((item) => {
            const Icon = MENU_ICONS[item.action];
            return (
              <button
                key={item.action}
                type="button"
                role="menuitem"
                className={MENU_ITEM}
                disabled={item.isDisabled}
                onClick={() => choose(item.action)}
              >
                <Icon />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface CommitFormProps {
  canPushAfterCommit: boolean;
  isBusy: boolean;
  onSubmit: (message: string, mode: CommitMode) => void;
}

function CommitForm({ canPushAfterCommit, isBusy, onSubmit }: CommitFormProps) {
  const [message, setMessage] = useState("");
  const isEmpty = !message.trim() || isBusy;

  function submitAs(mode: CommitMode) {
    if (message.trim()) onSubmit(message.trim(), mode);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    submitAs("commit");
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
      <div className="flex justify-end gap-1.5">
        {canPushAfterCommit && (
          <button
            type="button"
            disabled={isEmpty}
            className={cn(GHOST_BUTTON, "h-7 px-2.5 text-xs")}
            onClick={() => submitAs("commitAndPush")}
          >
            Commit & push
          </button>
        )}
        <button type="submit" disabled={isEmpty} className={cn(PRIMARY_BUTTON, "h-7 px-2.5 text-xs")}>
          Commit
        </button>
      </div>
    </form>
  );
}

interface CommitRowsProps {
  target: GitTarget;
  status: GitStatus | null;
  hasOpenPr: boolean;
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

function canPushAfterCommit(status: GitStatus | null): boolean {
  if (!status?.branch || status.behind > 0) return false;
  return status.upstream !== null || status.hasRemote;
}

export function CommitRows(props: CommitRowsProps) {
  const { target, status, hasOpenPr, onStatusChanged, onCreatePr, onOpenDiff } = props;
  const [isComposing, setIsComposing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ text: string; isError: boolean } | null>(null);
  const hasChanges = (status?.files.length ?? 0) > 0;
  const items = gitMenuItems({ status, isBusy, hasOpenPr });

  async function run(action: () => Promise<string>) {
    setIsBusy(true);
    setOutcome(null);
    try {
      setOutcome({ text: await action(), isError: false });
      setIsComposing(false);
    } catch (error) {
      setOutcome({ text: String(error).replace(/^git: /, ""), isError: true });
    } finally {
      setIsBusy(false);
      onStatusChanged();
    }
  }

  async function commit(message: string, mode: CommitMode) {
    const committed = await gitApi.commit(target, message);
    if (mode !== "commitAndPush") return `Committed ${committed.oid.slice(0, 7)}`;
    return outcomeOfPush(await gitApi.push(target));
  }

  const menuActions: Record<GitMenuAction, () => void> = {
    commit: () => setIsComposing(true),
    push: () => run(async () => outcomeOfPush(await gitApi.push(target))),
    createPr: onCreatePr,
  };

  return (
    <>
      <div role="group" aria-label="Commit" className={DETAILS_SPLIT_GROUP}>
        <button
          type="button"
          aria-expanded={isComposing}
          disabled={!hasChanges}
          title={hasChanges ? undefined : "No changes to commit"}
          className={DETAILS_SPLIT_PRIMARY}
          onClick={() => setIsComposing(!isComposing)}
        >
          <GitCommitHorizontal aria-hidden className={DETAILS_ICON} />
          <span className={DETAILS_LABEL}>Commit</span>
          {!hasChanges && <span className="ms-auto text-xs font-normal text-muted-foreground">No changes</span>}
        </button>
        <span aria-hidden="true" className={DETAILS_SPLIT_SEPARATOR} />
        <GitActionsMenu items={items} onChoose={(action) => menuActions[action]()} />
      </div>
      {isComposing && (
        <CommitForm
          canPushAfterCommit={canPushAfterCommit(status)}
          isBusy={isBusy}
          onSubmit={(message, mode) => run(() => commit(message, mode))}
        />
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
