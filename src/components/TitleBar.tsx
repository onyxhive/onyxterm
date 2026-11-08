import type { ReactNode } from "react";
import { PanelLeft, PanelLeftClose, SquarePen } from "lucide-react";
import { cn, ICON_BUTTON } from "./ui";

export type View = "chat" | "board";

interface SidebarToggleProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onNewChat: () => void;
}

export function SidebarToggle({ isSidebarOpen, onToggleSidebar, onNewChat }: SidebarToggleProps) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed top-0 left-(--traffic-light-inset) z-40 flex h-(--topbar-height) items-center",
        "gap-1",
      )}
    >
      <button
        type="button"
        className={cn(ICON_BUTTON, "pointer-events-auto")}
        aria-label="Toggle sidebar"
        aria-pressed={isSidebarOpen}
        title="Toggle sidebar (⌘B)"
        onClick={onToggleSidebar}
      >
        {isSidebarOpen ? <PanelLeftClose /> : <PanelLeft />}
      </button>
      {!isSidebarOpen && (
        <button
          type="button"
          className={cn(ICON_BUTTON, "pointer-events-auto")}
          aria-label="New chat"
          title="New chat (⌘N)"
          onClick={onNewChat}
        >
          <SquarePen />
        </button>
      )}
    </div>
  );
}

interface TopBarProps {
  isSidebarOpen: boolean;
  children?: ReactNode;
}

export function TopBar({ isSidebarOpen, children }: TopBarProps) {
  return (
    <header
      data-tauri-drag-region
      className={cn(
        "relative flex h-(--topbar-height) shrink-0 items-center gap-3 bg-background pe-3",
        "transition-[padding] duration-200 ease-out motion-reduce:transition-none",
        isSidebarOpen ? "ps-5" : "ps-[calc(var(--traffic-light-inset)+4.25rem)]",
      )}
    >
      {children}
    </header>
  );
}

export function TopBarHeading({ title, meta }: { title: string; meta: string }) {
  return (
    <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-3 text-sm">
      <h1 className="truncate font-medium text-foreground">{title}</h1>
      <span className="shrink-0 text-muted-foreground">{meta}</span>
    </div>
  );
}
