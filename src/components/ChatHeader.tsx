import { CheckCheck, PanelRight, RotateCcw, SquareTerminal } from "lucide-react";
import type { Task } from "../types";
import { TitleBarHeading } from "./TitleBar";

const RAW_TERMINAL_COMING = "Raw terminal coming later";

export interface ChatHeaderActions {
  onMarkDone: () => void;
  onReopen: () => void;
  onToggleWorkPanel: () => void;
}

interface ChatHeaderProps {
  task: Task;
  isWorkPanelOpen: boolean;
  actions: ChatHeaderActions;
}

function DoneToggle({ task, actions }: Omit<ChatHeaderProps, "isWorkPanelOpen">) {
  if (task.status === "done") {
    return (
      <button type="button" className="icon-button" aria-label="Reopen" title="Reopen" onClick={actions.onReopen}>
        <RotateCcw size={17} strokeWidth={1.75} />
      </button>
    );
  }
  return (
    <button type="button" className="icon-button" aria-label="Mark done" title="Mark done" onClick={actions.onMarkDone}>
      <CheckCheck size={18} strokeWidth={1.75} />
    </button>
  );
}

export function ChatHeader({ task, isWorkPanelOpen, actions }: ChatHeaderProps) {
  return (
    <>
      <TitleBarHeading title={task.title} meta={task.model} />
      <div className="titlebar__actions">
        <DoneToggle task={task} actions={actions} />
        <span title={RAW_TERMINAL_COMING}>
          <button type="button" className="icon-button" aria-label="Open raw terminal" disabled>
            <SquareTerminal size={18} strokeWidth={1.75} />
          </button>
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Toggle work panel"
          title="Work panel"
          aria-pressed={isWorkPanelOpen}
          onClick={actions.onToggleWorkPanel}
        >
          <PanelRight size={18} strokeWidth={1.75} />
        </button>
      </div>
    </>
  );
}
