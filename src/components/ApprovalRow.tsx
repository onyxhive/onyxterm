import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Eye, SquarePen, SquareTerminal, Wrench, type LucideIcon } from "lucide-react";
import { elapsedSince } from "../tasks";
import type { FeedItem, PermissionDecision } from "../types";
import { CopyButton } from "./CopyButton";
import { useShortPaths } from "./projectPaths";
import { cn, GHOST_BUTTON, INLINE_BUTTON, Kbd, MENU_ITEM, MENU_POPUP, PRIMARY_BUTTON } from "./ui";
import { usePopup } from "./usePopup";

type PermissionRequest = Extract<FeedItem, { kind: "permission" }>;

interface ApprovalRowProps {
  request: PermissionRequest;
  onDecide: (requestId: string, decision: PermissionDecision) => void;
}

const ACTION_ICONS: Record<string, LucideIcon> = {
  run: SquareTerminal,
  edit: SquarePen,
  write: SquarePen,
  read: Eye,
};

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
}

function decisionForKey(event: KeyboardEvent): PermissionDecision | null {
  if (event.key === "Enter" && event.metaKey) return event.altKey ? "always" : "once";
  if (event.key === "Escape" && !isTyping(event.target)) return "deny";
  return null;
}

const TOOL_NAMES: Record<string, string> = {
  run: "Run command",
  edit: "Edit file",
  write: "Write file",
  read: "Read file",
  search: "Search code",
  list: "List files",
  fetch: "Fetch page",
  "search the web for": "Search the web",
};

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function relativeTime(since: number): string {
  const elapsed = elapsedSince(since, Date.now());
  return elapsed === "now" ? "just now" : `${elapsed} ago`;
}

function toolNameOf(action: string): string {
  return TOOL_NAMES[action] ?? capitalized(action);
}

function MoreApprovalOptions({ onAlwaysAllow }: { onAlwaysAllow: () => void }) {
  const popup = usePopup<HTMLSpanElement>();

  return (
    <span ref={popup.rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label="More approval options"
        aria-haspopup="menu"
        aria-expanded={popup.isOpen}
        className={cn(GHOST_BUTTON, "h-7 gap-1 px-2 text-xs aria-expanded:bg-accent")}
        onClick={popup.toggle}
      >
        More
        <ChevronDown aria-hidden className="size-3.5!" />
      </button>
      {popup.isOpen && (
        <div role="menu" className={cn(MENU_POPUP, "absolute right-0 bottom-full mb-1 w-max")}>
          <button type="button" role="menuitem" className={MENU_ITEM} onClick={onAlwaysAllow}>
            <span className="min-w-0 flex-1 whitespace-normal">Always allow this session</span>
            <Kbd>⌥⌘↵</Kbd>
          </button>
        </div>
      )}
    </span>
  );
}

function CommandBlock({ command, isShell }: { command: string; isShell: boolean }) {
  const codeRef = useRef<HTMLPreElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useLayoutEffect(() => {
    const code = codeRef.current;
    if (code && !isExpanded) setIsOverflowing(code.scrollHeight > code.clientHeight);
  }, [command, isExpanded]);

  return (
    <div className="group/command relative mx-3.5 mt-2.5 rounded-lg border border-border/70 bg-muted">
      <pre
        ref={codeRef}
        className={cn(
          "overflow-hidden px-3 py-2 pe-9 font-mono text-xs leading-5 whitespace-pre-wrap text-foreground/90",
          "select-text [overflow-wrap:anywhere]",
          !isExpanded && "max-h-[4.25rem]",
        )}
      >
        {isShell && <span className="text-muted-foreground select-none">$ </span>}
        {command}
      </pre>
      <span className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover/command:opacity-100">
        <CopyButton text={command} label="Copy command" variant="code" />
      </span>
      {(isOverflowing || isExpanded) && (
        <button
          type="button"
          aria-expanded={isExpanded}
          className={cn(INLINE_BUTTON, "px-3 pb-2 text-xs text-muted-foreground hover:text-foreground")}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "Show less" : "Show full command"}
        </button>
      )}
    </div>
  );
}

export function ApprovalRow({ request, onDecide }: ApprovalRowProps) {
  const shortPaths = useShortPaths();

  useEffect(() => {
    function decideByShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const decision = decisionForKey(event);
      if (!decision) return;
      event.preventDefault();
      onDecide(request.requestId, decision);
    }
    window.addEventListener("keydown", decideByShortcut);
    return () => window.removeEventListener("keydown", decideByShortcut);
  }, [onDecide, request.requestId]);

  const Icon = ACTION_ICONS[request.action] ?? Wrench;
  const decide = (decision: PermissionDecision) => () => onDecide(request.requestId, decision);

  return (
    <div role="group" aria-label="Permission request" className="pb-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex min-w-0 items-center gap-1.5 px-3.5 pt-3 text-xs text-muted-foreground">
          <Icon aria-hidden strokeWidth={1.5} className="size-3.5 shrink-0" />
          <span className="shrink-0 font-medium text-foreground/80">{toolNameOf(request.action)}</span>
          <span aria-hidden="true">·</span>
          <span className="min-w-0 truncate">{capitalized(request.requester)}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{relativeTime(request.since)}</span>
          <span className="ms-auto inline-flex shrink-0 items-center gap-1.5 text-approval">
            <span aria-hidden="true" className="size-1.5 animate-status-pulse rounded-full bg-approval-dot" />
            Needs approval
          </span>
        </div>
        {request.reason && (
          <p className="px-3.5 pt-1.5 text-sm text-foreground select-text [overflow-wrap:anywhere]">
            {shortPaths(request.reason)}
          </p>
        )}
        <CommandBlock command={shortPaths(request.target)} isShell={request.isShell} />
        <div className="flex flex-wrap items-center justify-end gap-1.5 px-3 pt-2.5 pb-3">
          <MoreApprovalOptions onAlwaysAllow={decide("always")} />
          <button type="button" className={cn(GHOST_BUTTON, "h-7 gap-2 px-2.5 text-xs")} onClick={decide("deny")}>
            Decline
            <Kbd className="h-4 text-3xs">esc</Kbd>
          </button>
          <button type="button" className={cn(PRIMARY_BUTTON, "h-7 gap-2 px-2.5 text-xs")} onClick={decide("once")}>
            Approve
            <Kbd className="h-4 bg-white/20 text-3xs text-primary-foreground">⌘↵</Kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
