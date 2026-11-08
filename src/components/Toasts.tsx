import { CircleAlert, X } from "lucide-react";
import type { Task, Toast } from "../types";
import { StatusDot } from "./StatusBadge";
import { cn, FOCUS_RING, ICON_BUTTON } from "./ui";

interface ToastsProps {
  toasts: Toast[];
  tasks: Task[];
  onOpen: (toast: Toast) => void;
  onDismiss: (toastId: string) => void;
}

export function Toasts({ toasts, tasks, onOpen, onDismiss }: ToastsProps) {
  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((toast) => {
        const task = tasks.find((candidate) => candidate.id === toast.taskId);
        return (
          <div
            key={toast.id}
            className="dropdown-glass pointer-events-auto relative flex items-start gap-1 rounded-lg p-1 text-sm"
          >
            <button
              type="button"
              onClick={() => onOpen(toast)}
              className={cn(
                "flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-md p-2 text-left hover:bg-accent/50",
                FOCUS_RING,
              )}
            >
              <span className="flex h-5 w-4 shrink-0 items-center justify-center">
                {task ? (
                  <StatusDot status={task.status} className="size-2" />
                ) : (
                  <CircleAlert className="size-4 text-error" />
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium [overflow-wrap:anywhere]">{toast.headline}</span>
                <span className="truncate text-xs text-muted-foreground">{toast.detail}</span>
              </span>
            </button>
            <button
              type="button"
              className={cn(ICON_BUTTON, "size-6 [&_svg]:size-3.5")}
              aria-label="Dismiss"
              onClick={() => onDismiss(toast.id)}
            >
              <X />
            </button>
          </div>
        );
      })}
    </div>
  );
}
