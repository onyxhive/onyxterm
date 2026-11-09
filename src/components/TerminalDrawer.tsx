import "@xterm/xterm/css/xterm.css";
import { useEffect, useLayoutEffect, useRef, type PointerEvent } from "react";
import { ChevronDown, Plus, SquareTerminal, X } from "lucide-react";
import {
  attachTerminal,
  closeTerminal,
  openFirstTerminal,
  openTerminal,
  selectTerminal,
  useChatTerminals,
  type TerminalSession,
} from "../terminalSessions";
import { cn, FOCUS_RING, GHOST_BUTTON, ICON_BUTTON } from "./ui";

const MIN_HEIGHT = 140;
const MAX_HEIGHT_SHARE = 0.7;

interface TerminalDrawerProps {
  chatId: string;
  height: number;
  onHeightChange: (height: number) => void;
  onHide: () => void;
  onError: (message: string) => void;
}

export function clampedDrawerHeight(height: number): number {
  return Math.round(Math.min(Math.max(height, MIN_HEIGHT), window.innerHeight * MAX_HEIGHT_SHARE));
}

function TerminalViewport({ session }: { session: TerminalSession }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    attachTerminal(session, container);
    const refit = () => {
      if (container.clientWidth > 0 && container.clientHeight > 0) session.fit.fit();
    };
    refit();
    session.terminal.focus();
    const observer = new ResizeObserver(refit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [session]);

  return <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden px-3 pt-2 pb-1" />;
}

interface TerminalTabProps {
  session: TerminalSession;
  isActive: boolean;
}

function TerminalTab({ session, isActive }: TerminalTabProps) {
  return (
    <div
      role="tab"
      aria-selected={isActive}
      className={cn(
        "group flex h-7 shrink-0 items-center rounded-md text-xs transition-colors",
        isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={() => selectTerminal(session)}
        className={cn("flex h-full cursor-pointer items-center gap-1.5 rounded-md ps-2 pe-1", FOCUS_RING)}
      >
        <SquareTerminal aria-hidden className="size-3.5 shrink-0" />
        <span className={cn(session.hasExited && "line-through decoration-muted-foreground/60")}>{session.label}</span>
      </button>
      <button
        type="button"
        aria-label={`Close ${session.label}`}
        title={`Close ${session.label}`}
        onClick={() => closeTerminal(session.id)}
        className={cn(
          "me-1 inline-flex size-4.5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground",
          "opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 hover:bg-foreground/10",
          "hover:text-foreground focus-visible:opacity-100",
          FOCUS_RING,
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function useDragToResize(height: number, onHeightChange: (height: number) => void) {
  const dragStart = useRef<{ pointerY: number; height: number } | null>(null);
  return {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStart.current = { pointerY: event.clientY, height };
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (!dragStart.current) return;
      onHeightChange(clampedDrawerHeight(dragStart.current.height + dragStart.current.pointerY - event.clientY));
    },
    onPointerUp: () => {
      dragStart.current = null;
    },
  };
}

export function TerminalDrawer({ chatId, height, onHeightChange, onHide, onError }: TerminalDrawerProps) {
  const { sessions, activeId } = useChatTerminals(chatId);
  const active = sessions.find((session) => session.id === activeId) ?? sessions.at(-1) ?? null;
  const dragHandlers = useDragToResize(height, onHeightChange);

  useEffect(() => {
    openFirstTerminal(chatId).catch((error) => onError(String(error)));
  }, []);

  function addTerminal() {
    openTerminal(chatId).catch((error) => onError(String(error)));
  }

  return (
    <section
      aria-label="Terminal"
      style={{ height }}
      className="relative flex shrink-0 flex-col overflow-visible border-t border-border bg-background"
    >
      <div
        aria-hidden
        className="absolute inset-x-0 -top-1 z-20 h-2 cursor-row-resize"
        onPointerDown={dragHandlers.onPointerDown}
        onPointerMove={dragHandlers.onPointerMove}
        onPointerUp={dragHandlers.onPointerUp}
        onPointerCancel={dragHandlers.onPointerUp}
      />
      <header className="flex h-9 shrink-0 items-center gap-1 px-2">
        <div role="tablist" aria-label="Terminals" className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
          {sessions.map((session) => (
            <TerminalTab key={session.id} session={session} isActive={session.id === active?.id} />
          ))}
        </div>
        <button
          type="button"
          className={cn(ICON_BUTTON, "size-6 [&_svg]:size-3.5")}
          aria-label="New terminal"
          title="New terminal"
          onClick={addTerminal}
        >
          <Plus />
        </button>
        <span className="min-w-0 flex-1" />
        <button
          type="button"
          className={cn(ICON_BUTTON, "size-6 [&_svg]:size-3.5")}
          aria-label="Hide terminal"
          title="Hide terminal (⌘J)"
          onClick={onHide}
        >
          <ChevronDown />
        </button>
      </header>
      {active ? (
        <TerminalViewport key={active.id} session={active} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <p>No terminal is open for this chat.</p>
          <button type="button" className={GHOST_BUTTON} onClick={addTerminal}>
            <SquareTerminal />
            New terminal
          </button>
        </div>
      )}
    </section>
  );
}
