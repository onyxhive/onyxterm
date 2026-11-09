import { Folder, PanelRight, SquareTerminal } from "lucide-react";
import { gitApi } from "../gitApi";
import type { GitChangedFile, Project, Task } from "../types";
import { useLoaded } from "../useLoaded";
import { DiffStat, totalOf } from "./DiffStat";
import { PrBadge } from "./PrBadge";
import { StatusLabel } from "./StatusBadge";
import { ThreadDetails, type ThreadDetailsActions } from "./ThreadDetails";
import { cn, FOCUS_RING, ICON_BUTTON } from "./ui";

const HIDDEN_HEADER_STATUSES = new Set(["done"]);

export interface ChatHeaderActions {
  onToggleSidePanel: () => void;
  onToggleTerminal: () => void;
  onNewChatInProject: () => void;
}

interface ChatHeaderProps {
  task: Task;
  project: Project | undefined;
  isSidePanelOpen: boolean;
  isTerminalOpen: boolean;
  actions: ChatHeaderActions;
  detailsActions: ThreadDetailsActions;
}

function useChatStatus(task: Task) {
  return useLoaded(`${task.id}:${task.status}`, () => gitApi.status({ chat: task.id }));
}

function ChangesSummary({ files, onOpen }: { files: GitChangedFile[]; onOpen: () => void }) {
  if (files.length === 0) return null;
  const added = totalOf(files, "added");
  const removed = totalOf(files, "removed");
  return (
    <button
      type="button"
      aria-label={`Open changes, ${added} additions, ${removed} deletions`}
      title="Open changes (⌘D)"
      onClick={onOpen}
      className={cn(
        "inline-flex h-7 shrink-0 cursor-pointer items-center rounded-(--control-radius) px-1.5 text-xs opacity-80",
        "transition-[background-color,opacity] hover:bg-accent hover:opacity-100",
        FOCUS_RING,
      )}
    >
      <DiffStat added={added} removed={removed} />
    </button>
  );
}

export function ChatHeader(props: ChatHeaderProps) {
  const { task, project, isSidePanelOpen, isTerminalOpen, actions, detailsActions } = props;
  const status = useChatStatus(task);
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
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label="Toggle terminal"
          title="Terminal (⌘J)"
          aria-pressed={isTerminalOpen}
          onClick={actions.onToggleTerminal}
        >
          <SquareTerminal />
        </button>
        <ChangesSummary files={status.data?.files ?? []} onOpen={detailsActions.onOpenDiff} />
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label="Toggle side panel"
          title="Side panel (Changes ⌘D, Files ⌘⇧E)"
          aria-pressed={isSidePanelOpen}
          onClick={actions.onToggleSidePanel}
        >
          <PanelRight />
        </button>
        <ThreadDetails key={task.id} task={task} project={project} status={status} actions={detailsActions} />
      </div>
    </>
  );
}
