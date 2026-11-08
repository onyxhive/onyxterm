import { CheckCheck, PanelRight, RotateCcw, SquareTerminal } from "lucide-react";
import type { Task } from "../types";
import { STATUS_LABEL } from "../status";
import { StatusGlyph } from "./StatusGlyph";

const RAW_TERMINAL_COMING = "Raw terminal coming later";

interface ChatHeaderProps {
  task: Task;
  projectName: string;
  isWorkPanelOpen: boolean;
  onMarkDone: () => void;
  onReopen: () => void;
  onToggleWorkPanel: () => void;
}

export function ChatHeader(props: ChatHeaderProps) {
  const { task, projectName, isWorkPanelOpen, onMarkDone, onReopen, onToggleWorkPanel } = props;
  return (
    <header className="chat-header">
      <div className="chat-header__heading">
        <span className={`status-badge status-badge--${task.status}`}>
          <StatusGlyph status={task.status} size={9} />
          {STATUS_LABEL[task.status]}
        </span>
        <h1 className="chat-header__title">{task.title}</h1>
        <span className="chat-header__meta">
          {task.provider} · {task.command} · {projectName}
        </span>
      </div>
      <div className="chat-header__actions">
        {task.status === "done" ? (
          <button type="button" className="button button--small" onClick={onReopen}>
            <RotateCcw size={14} />
            Reopen
          </button>
        ) : (
          <button type="button" className="button button--small" onClick={onMarkDone}>
            <CheckCheck size={14} />
            Mark done
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label="Toggle work panel"
          aria-pressed={isWorkPanelOpen}
          onClick={onToggleWorkPanel}
        >
          <PanelRight size={16} />
        </button>
        <span title={RAW_TERMINAL_COMING}>
          <button type="button" className="icon-button" aria-label="Open raw terminal" disabled>
            <SquareTerminal size={16} />
          </button>
        </span>
      </div>
    </header>
  );
}
