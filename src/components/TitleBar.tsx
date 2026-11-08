import type { ReactNode } from "react";
import { PanelLeft, SquareKanban, SquarePen } from "lucide-react";

export type View = "chat" | "board";

interface TitleBarProps {
  isSidebarOpen: boolean;
  view: View;
  actions: TitleBarActions;
  children?: ReactNode;
}

export interface TitleBarActions {
  onToggleSidebar: () => void;
  onToggleBoard: () => void;
  onNewChat: () => void;
}

export function TitleBarHeading({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="titlebar__heading" data-tauri-drag-region>
      <h1 className="titlebar__title">{title}</h1>
      <span className="titlebar__meta">{meta}</span>
    </div>
  );
}

export function TitleBar({ isSidebarOpen, view, actions, children }: TitleBarProps) {
  return (
    <header className="titlebar" data-tauri-drag-region data-sidebar-open={isSidebarOpen}>
      <div className="titlebar__lead" data-tauri-drag-region>
        <button
          type="button"
          className="icon-button"
          aria-label="Toggle tasks sidebar"
          title="Toggle sidebar"
          onClick={actions.onToggleSidebar}
        >
          <PanelLeft size={18} strokeWidth={1.75} />
        </button>
        {!isSidebarOpen && (
          <button
            type="button"
            className="icon-button"
            aria-label="New chat"
            title="New chat ⌘N"
            onClick={actions.onNewChat}
          >
            <SquarePen size={17} strokeWidth={1.75} />
          </button>
        )}
      </div>
      <div className="titlebar__main" data-tauri-drag-region>
        <div className="titlebar__slot" data-tauri-drag-region>
          {children}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Board"
          title="Board"
          aria-pressed={view === "board"}
          onClick={actions.onToggleBoard}
        >
          <SquareKanban size={18} strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
}
