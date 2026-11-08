import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Eye, SquarePen, SquareTerminal, Wrench, type LucideIcon } from "lucide-react";
import { elapsedSince } from "../tasks";
import type { FeedItem, PermissionDecision, RuleChoice, RuleScope } from "../types";
import { CopyButton } from "./CopyButton";
import { useShortPaths } from "./projectPaths";
import { cn, GHOST_BUTTON, INLINE_BUTTON, Kbd, MENU_ITEM, MENU_POPUP, PRIMARY_BUTTON } from "./ui";
import { usePopup } from "./usePopup";

type PermissionRequest = Extract<FeedItem, { kind: "permission" }>;

interface ApprovalRowProps {
  request: PermissionRequest;
  isShortcutTarget: boolean;
  onDecide: (requestId: string, decision: PermissionDecision, suggestion?: RuleScope) => void;
}

interface MoreApprovalOptionsProps {
  suggestions: RuleChoice[];
  hasShortcutHint: boolean;
  onAllowRule: (scope: RuleScope) => void;
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

function MoreApprovalOptions({ suggestions, hasShortcutHint, onAllowRule }: MoreApprovalOptionsProps) {
  const popup = usePopup<HTMLSpanElement>();
  if (suggestions.length === 0) return null;

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
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.value}
              type="button"
              role="menuitem"
              className={MENU_ITEM}
              onClick={() => onAllowRule(suggestion.value)}
            >
              <span className="max-w-80 min-w-0 flex-1 whitespace-normal">{suggestion.label}</span>
              {hasShortcutHint && suggestion.value === "session" && <Kbd>⌥⌘↵</Kbd>}
            </button>
          ))}
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
    <div className="group/command relative mx-3 mt-2 rounded-lg border border-border/70 bg-muted">
      <pre
        ref={codeRef}
        className={cn(
          "overflow-hidden px-3 py-1.5 pe-9 font-mono text-xs leading-5 whitespace-pre-wrap text-foreground/90",
          "select-text [overflow-wrap:anywhere]",
          !isExpanded && "max-h-[3.25rem]",
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

function useApprovalShortcuts(requestId: string, isShortcutTarget: boolean, onDecide: ApprovalRowProps["onDecide"]) {
  useEffect(() => {
    if (!isShortcutTarget) return;
    function decideByShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const decision = decisionForKey(event);
      if (!decision) return;
      event.preventDefault();
      onDecide(requestId, decision);
    }
    window.addEventListener("keydown", decideByShortcut);
    return () => window.removeEventListener("keydown", decideByShortcut);
  }, [isShortcutTarget, onDecide, requestId]);
}

function NeedsApproval({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-approval", className)}>
      <span aria-hidden="true" className="size-1.5 animate-status-pulse rounded-full bg-approval-dot" />
      {label}
    </span>
  );
}

function RequestSource({ request }: { request: PermissionRequest }) {
  const Icon = ACTION_ICONS[request.action] ?? Wrench;
  return (
    <>
      <Icon aria-hidden strokeWidth={1.5} className="size-3.5 shrink-0" />
      <span className="shrink-0 font-medium text-foreground/80">{toolNameOf(request.action)}</span>
      <span aria-hidden="true">·</span>
      <span className="min-w-0 truncate">{capitalized(request.requester)}</span>
      <span aria-hidden="true">·</span>
      <span className="shrink-0">{relativeTime(request.since)}</span>
    </>
  );
}

function DecisionButtons({ request, isShortcutTarget, onDecide }: ApprovalRowProps) {
  const decide = (decision: PermissionDecision) => () => onDecide(request.requestId, decision);
  return (
    <>
      <MoreApprovalOptions
        suggestions={request.suggestions}
        hasShortcutHint={isShortcutTarget}
        onAllowRule={(scope) => onDecide(request.requestId, "always", scope)}
      />
      <button type="button" className={cn(GHOST_BUTTON, "h-7 gap-2 px-2.5 text-xs")} onClick={decide("deny")}>
        Decline
        {isShortcutTarget && <Kbd className="h-4 text-3xs">esc</Kbd>}
      </button>
      <button type="button" className={cn(PRIMARY_BUTTON, "h-7 gap-2 px-2.5 text-xs")} onClick={decide("once")}>
        Approve
        {isShortcutTarget && <Kbd className="h-4 bg-white/20 text-3xs text-primary-foreground">⌘↵</Kbd>}
      </button>
    </>
  );
}

function SingleApproval(props: ApprovalRowProps) {
  const { request, isShortcutTarget, onDecide } = props;
  const shortPaths = useShortPaths();
  useApprovalShortcuts(request.requestId, isShortcutTarget, onDecide);

  return (
    <div role="group" aria-label="Permission request" className="pb-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex min-w-0 items-center gap-1.5 px-3 pt-2.5 text-xs text-muted-foreground">
          <RequestSource request={request} />
          <NeedsApproval label="Needs approval" className="ms-auto" />
        </div>
        {request.reason && (
          <p className="px-3 pt-1 text-sm text-foreground select-text [overflow-wrap:anywhere]">
            {shortPaths(request.reason)}
          </p>
        )}
        <CommandBlock command={shortPaths(request.target)} isShell={request.isShell} />
        <div className="flex flex-wrap items-center justify-end gap-1.5 px-2.5 pt-2 pb-2.5">
          <DecisionButtons {...props} />
        </div>
      </div>
    </div>
  );
}

function CommandStrip({ command, isShell }: { command: string; isShell: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <button
      type="button"
      aria-expanded={isExpanded}
      title={isExpanded ? undefined : command}
      onClick={() => setIsExpanded(!isExpanded)}
      className={cn(
        "mt-1 block w-full cursor-pointer rounded-md bg-muted px-2 py-1 text-left font-mono text-xs leading-5",
        "text-foreground/90 [overflow-wrap:anywhere]",
        isExpanded ? "whitespace-pre-wrap select-text" : "truncate",
      )}
    >
      {isShell && <span className="text-muted-foreground select-none">$ </span>}
      {command}
    </button>
  );
}

function GroupedApproval(props: ApprovalRowProps) {
  const { request, isShortcutTarget, onDecide } = props;
  const shortPaths = useShortPaths();
  useApprovalShortcuts(request.requestId, isShortcutTarget, onDecide);

  return (
    <li role="group" aria-label="Permission request" className="border-t border-border px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <RequestSource request={request} />
      </div>
      {request.reason && <p className="truncate pt-1 text-sm text-foreground">{shortPaths(request.reason)}</p>}
      <CommandStrip command={shortPaths(request.target)} isShell={request.isShell} />
      <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2">
        <DecisionButtons {...props} />
      </div>
    </li>
  );
}

interface ApprovalGroupProps {
  requests: PermissionRequest[];
  shortcutRequestId: string | null;
  onDecide: ApprovalRowProps["onDecide"];
}

export function ApprovalGroup({ requests, shortcutRequestId, onDecide }: ApprovalGroupProps) {
  if (requests.length === 1) {
    const [request] = requests;
    const isShortcutTarget = request.requestId === shortcutRequestId;
    return <SingleApproval request={request} isShortcutTarget={isShortcutTarget} onDecide={onDecide} />;
  }
  const decideAll = (decision: PermissionDecision) => () =>
    requests.forEach((request) => onDecide(request.requestId, decision));

  return (
    <div className="pb-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex min-w-0 items-center gap-1.5 px-3 py-2 text-xs">
          <NeedsApproval label={`${requests.length} approvals waiting`} />
          <button type="button" className={cn(GHOST_BUTTON, "ms-auto h-7 px-2.5 text-xs")} onClick={decideAll("deny")}>
            Decline all
          </button>
          <button type="button" className={cn(PRIMARY_BUTTON, "h-7 px-2.5 text-xs")} onClick={decideAll("once")}>
            Approve all
          </button>
        </div>
        <ul>
          {requests.map((request) => (
            <GroupedApproval
              key={request.requestId}
              request={request}
              isShortcutTarget={request.requestId === shortcutRequestId}
              onDecide={onDecide}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
