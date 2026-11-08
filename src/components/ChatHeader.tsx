import { CheckCheck, Folder, GitBranch, PanelRight, RotateCcw, SquareTerminal } from "lucide-react";
import type { ReactNode } from "react";
import type { Project, Task } from "../types";
import { PrBadge } from "./PrBadge";
import { StatusLabel } from "./StatusBadge";
import { cn, ICON_BUTTON } from "./ui";

const RAW_TERMINAL_COMING = "Raw terminal coming later";
const HIDDEN_HEADER_STATUSES = new Set(["done"]);

export interface ChatHeaderActions {
  onMarkDone: () => void;
  onReopen: () => void;
  onToggleChangesPanel: () => void;
  onNewChatInProject: () => void;
}

interface ChatHeaderProps {
  task: Task;
  project: Project | undefined;
  details: ReactNode;
  branch: string | null;
  isChangesPanelOpen: boolean;
  actions: ChatHeaderActions;
}

function DoneToggle({ task, actions }: Pick<ChatHeaderProps, "task" | "actions">) {
  if (task.status === "done") {
    return (
      <button type="button" className={ICON_BUTTON} aria-label="Reopen" title="Reopen" onClick={actions.onReopen}>
        <RotateCcw />
      </button>
    );
  }
  return (
    <button
      type="button"
      className={ICON_BUTTON}
      aria-label="Mark done"
      title="Mark done"
      onClick={actions.onMarkDone}
    >
      <CheckCheck />
    </button>
  );
}

function BranchLabel({ branch }: { branch: string }) {
  return (
    <li
      title={branch}
      className="-ms-2 flex min-w-0 shrink-[4] items-center gap-1 text-xs font-normal text-muted-foreground/70"
    >
      <span aria-hidden="true" className="shrink-0 text-muted-foreground/50">
        ·
      </span>
      <GitBranch aria-hidden className="size-3 shrink-0" />
      <span className="max-w-40 min-w-0 truncate">{branch}</span>
    </li>
  );
}

export function ChatHeader({ task, project, details, branch, isChangesPanelOpen, actions }: ChatHeaderProps) {
  return (
    <>
      <nav aria-label="Chat breadcrumb" data-tauri-drag-region className="min-w-0 flex-1">
        <ol className="m-0 flex min-w-0 list-none items-center gap-3 p-0 text-sm font-medium">
          {project && (
            <>
              <li className="flex shrink-0 items-center">
                <button
                  type="button"
                  title={`New chat in ${project.name}`}
                  onClick={actions.onNewChatInProject}
                  className={cn(
                    "inline-flex max-w-40 min-w-0 cursor-pointer items-center gap-1.5 rounded-sm text-muted-foreground",
                    "transition-colors hover:text-foreground",
                  )}
                >
                  <Folder className="size-3.5 shrink-0" />
                  <span className="truncate">{project.name}</span>
                </button>
              </li>
              {branch && !task.pr && <BranchLabel branch={branch} />}
              <li aria-hidden="true" className="shrink-0 text-icon-muted">
                /
              </li>
            </>
          )}
          <li aria-current="page" className="flex min-w-28 items-center gap-3 text-foreground">
            <h2 className="truncate" title={task.title}>
              {task.title}
            </h2>
            {task.pr && <PrBadge pr={task.pr} />}
            {!HIDDEN_HEADER_STATUSES.has(task.status) && <StatusLabel status={task.status} />}
          </li>
        </ol>
      </nav>
      <div className="flex shrink-0 items-center gap-0.5">
        {details}
        <DoneToggle task={task} actions={actions} />
        <span title={RAW_TERMINAL_COMING}>
          <button type="button" className={ICON_BUTTON} aria-label="Open raw terminal" disabled>
            <SquareTerminal />
          </button>
        </span>
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label="Toggle changed files"
          title="Diff (⌘D)"
          aria-pressed={isChangesPanelOpen}
          onClick={actions.onToggleChangesPanel}
        >
          <PanelRight />
        </button>
      </div>
    </>
  );
}
