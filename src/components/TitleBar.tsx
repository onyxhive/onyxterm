import type { ReactNode } from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { cn, ICON_BUTTON } from "./ui";

export type View = "chat" | "board" | "prs" | "settings";

interface SidebarToggleProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function SidebarToggle({ isSidebarOpen, onToggleSidebar }: SidebarToggleProps) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed top-0 left-(--workspace-controls-left) z-50 ml-px flex h-(--topbar-height)",
        "items-center transition-[left] duration-200 ease-out motion-reduce:transition-none",
      )}
    >
      <button
        type="button"
        className={cn(ICON_BUTTON, "pointer-events-auto")}
        aria-label="Toggle sidebar"
        aria-expanded={isSidebarOpen}
        title="Toggle sidebar (⌘B)"
        onClick={onToggleSidebar}
      >
        {isSidebarOpen ? <PanelLeftClose /> : <PanelLeft />}
      </button>
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
        "relative flex h-(--topbar-height) shrink-0 items-center gap-3 bg-background pr-2",
        "transition-[padding-left,padding-right] duration-200 ease-out motion-reduce:transition-none",
        isSidebarOpen ? "pl-4" : "pl-(--workspace-titlebar-content-left)",
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
