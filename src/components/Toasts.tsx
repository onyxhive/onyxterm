import { X } from "lucide-react";
import type { Task, Toast } from "../types";
import { StatusGlyph } from "./StatusGlyph";

interface ToastsProps {
  toasts: Toast[];
  tasks: Task[];
  onOpen: (toast: Toast) => void;
  onDismiss: (toastId: string) => void;
}

export function Toasts({ toasts, tasks, onOpen, onDismiss }: ToastsProps) {
  return (
    <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((toast) => {
        const task = tasks.find((candidate) => candidate.id === toast.taskId);
        return (
          <div key={toast.id} className="toast">
            <button type="button" className="toast__body" onClick={() => onOpen(toast)}>
              <StatusGlyph status={task?.status ?? "failed"} size={11} />
              <span className="toast__text">
                <span className="toast__headline">{toast.headline}</span>
                <span className="toast__detail">{toast.detail}</span>
              </span>
            </button>
            <button
              type="button"
              className="icon-button icon-button--small"
              aria-label="Dismiss"
              onClick={() => onDismiss(toast.id)}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
