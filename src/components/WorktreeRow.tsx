import { useState } from "react";
import { FolderGit2, Trash2 } from "lucide-react";
import { gitApi } from "../gitApi";
import type { Chat, Task } from "../types";
import { DETAILS_ICON, DETAILS_ICON_ACTION, DETAILS_LABEL, DETAILS_STATIC_ROW } from "./detailsStyles";
import { cn, GHOST_BUTTON, PRIMARY_BUTTON } from "./ui";

const ACTIVE_STATUSES = new Set(["running", "permission", "question"]);
const SMALL_GHOST = cn(GHOST_BUTTON, "h-7 px-2.5 text-xs");
const SMALL_PRIMARY = cn(PRIMARY_BUTTON, "h-7 px-2.5 text-xs");

interface WorktreeRowProps {
  task: Task;
  onRemoved: (chat: Chat) => void;
}

function folderName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

export function WorktreeRow({ task, onRemoved }: WorktreeRowProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const path = task.worktreePath;
  if (!path) return null;
  const isActive = ACTIVE_STATUSES.has(task.status);

  async function remove() {
    setIsBusy(true);
    setProblem(null);
    try {
      onRemoved(await gitApi.removeChatWorktree(task.id));
      setIsConfirming(false);
    } catch (error) {
      setProblem(String(error).replace(/^invalid input: /, ""));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      <div className={DETAILS_STATIC_ROW} title={path}>
        <FolderGit2 aria-hidden className={DETAILS_ICON} />
        <span className="shrink-0">Worktree</span>
        <span className={cn(DETAILS_LABEL, "flex-1 text-xs font-normal text-muted-foreground")}>
          {task.isWorktreeRemoved ? "Removed" : folderName(path)}
        </span>
        {!task.isWorktreeRemoved && (
          <button
            type="button"
            className={cn(DETAILS_ICON_ACTION, "-me-1.5")}
            aria-label="Remove worktree"
            title={isActive ? "Stop the agent before removing its worktree" : "Remove worktree"}
            disabled={isActive}
            onClick={() => setIsConfirming(true)}
          >
            <Trash2 />
          </button>
        )}
      </div>
      {isConfirming && (
        <div role="alertdialog" aria-label="Remove worktree" className="flex flex-col gap-1.5 px-2.5 pb-1.5">
          <p className="text-xs text-muted-foreground">
            Remove this worktree folder? Its branch <code className="font-mono">{task.branch}</code> stays.
            Uncommitted work is never deleted.
          </p>
          <div className="flex justify-end gap-1.5">
            <button type="button" className={SMALL_GHOST} onClick={() => setIsConfirming(false)}>
              Cancel
            </button>
            <button type="button" className={SMALL_PRIMARY} disabled={isBusy} onClick={remove}>
              Remove
            </button>
          </div>
        </div>
      )}
      {problem && (
        <p role="alert" className="px-2.5 pb-1 text-xs text-error-foreground">
          {problem}
        </p>
      )}
    </>
  );
}
