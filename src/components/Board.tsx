import { Folder, GitBranch } from "lucide-react";
import type { Task } from "../types";
import { STATUS_GROUPS, tasksInGroup, taskLabel } from "../status";
import { PrBadge } from "./PrBadge";
import { StatusDot } from "./StatusBadge";
import { cn, FOCUS_RING } from "./ui";

interface BoardProps {
  tasks: Task[];
  projectName: (projectId: string) => string;
  projectBranch: (projectId: string) => string | null;
  onOpen: (taskId: string) => void;
}

interface BoardCardProps {
  task: Task;
  projectName: string;
  branch: string | null;
  onOpen: () => void;
}

function BoardCard({ task, projectName, branch, onOpen }: BoardCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full cursor-pointer flex-col gap-1.5 rounded-lg border border-border bg-card p-3 text-left shadow-xs/5",
        "transition-colors hover:bg-accent/50 dark:bg-card dark:hover:bg-accent",
        FOCUS_RING,
      )}
    >
      <span className="flex min-w-0 items-start gap-2">
        <span className="flex h-5 items-center">
          <StatusDot status={task.status} />
        </span>
        <span className="line-clamp-2 min-w-0 text-sm font-medium text-foreground">{task.title}</span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Folder className="size-3 shrink-0" />
        <span className="max-w-1/2 shrink-0 truncate">{projectName}</span>
        {branch && (
          <span className="flex min-w-0 items-center gap-1" title={branch}>
            <GitBranch aria-hidden className="size-3 shrink-0" />
            <span className="min-w-0 truncate">{branch}</span>
          </span>
        )}
        {task.pr && <PrBadge pr={task.pr} className="ms-auto" />}
      </span>
      <span className="flex min-w-0 items-center gap-2 text-xs text-secondary-label">
        <span className="min-w-0 flex-1 truncate">{taskLabel(task)}</span>
        <span className="shrink-0 tabular-nums">{task.elapsed}</span>
      </span>
    </button>
  );
}

export function Board({ tasks, projectName, projectBranch, onOpen }: BoardProps) {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">
      <div className="grid min-w-[44rem] grid-cols-4 gap-3">
        {STATUS_GROUPS.map((group) => {
          const laneTasks = tasksInGroup(tasks, group);
          return (
            <section key={group.id} aria-label={group.title} className="flex min-w-0 flex-col gap-2">
              <header className="flex h-8 items-center gap-2 px-1 text-sm font-medium text-foreground/90">
                <span className="truncate">{group.title}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{laneTasks.length}</span>
              </header>
              <ul className="flex flex-col gap-2">
                {laneTasks.map((task) => (
                  <li key={task.id}>
                    <BoardCard
                      task={task}
                      projectName={projectName(task.projectId)}
                      branch={task.branch ?? projectBranch(task.projectId)}
                      onOpen={() => onOpen(task.id)}
                    />
                  </li>
                ))}
                {laneTasks.length === 0 && (
                  <li
                    className={cn(
                      "rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs",
                      "text-muted-foreground/70",
                    )}
                  >
                    Nothing here
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
