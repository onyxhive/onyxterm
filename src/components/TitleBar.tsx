import { PanelLeft } from "lucide-react";
import type { Task, Workspace } from "../types";
import { StatusGlyph } from "./StatusGlyph";
import { WorkspaceSwitcher, type WorkspaceActions } from "./WorkspaceSwitcher";

export type View = "chat" | "board";

const VIEWS: { id: View; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "board", label: "Board" },
];

interface TitleBarProps {
  workspaces: Workspace[];
  workspace: Workspace;
  tasks: Task[];
  waitingCount: number;
  view: View;
  onViewChange: (view: View) => void;
  workspaceActions: WorkspaceActions;
  onToggleSidebar: () => void;
  onOpenWaiting: () => void;
}

export function TitleBar(props: TitleBarProps) {
  return (
    <header className="titlebar" data-tauri-drag-region>
      <button type="button" className="icon-button" aria-label="Toggle tasks sidebar" onClick={props.onToggleSidebar}>
        <PanelLeft size={16} />
      </button>
      <WorkspaceSwitcher
        workspaces={props.workspaces}
        current={props.workspace}
        tasks={props.tasks}
        actions={props.workspaceActions}
      />
      <nav className="segmented" aria-label="View">
        {VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            className="segmented__option"
            aria-pressed={props.view === view.id}
            onClick={() => props.onViewChange(view.id)}
          >
            {view.label}
          </button>
        ))}
      </nav>
      <div className="titlebar__spacer" data-tauri-drag-region />
      {props.waitingCount > 0 && (
        <button type="button" className="waiting-pill" onClick={props.onOpenWaiting}>
          <StatusGlyph status="permission" size={8} />
          {props.waitingCount} waiting
        </button>
      )}
    </header>
  );
}
