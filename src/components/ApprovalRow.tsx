import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Shield, SquarePen, SquareTerminal, Wrench, type LucideIcon } from "lucide-react";
import { elapsedSince } from "../tasks";
import type { FeedItem } from "../types";
import { cn, INLINE_BUTTON, MENU_ITEM, MENU_POPUP } from "./ui";
import { useDismiss } from "./useDismiss";
import { WorkLogRow } from "./WorkLog";

export type PermissionDecision = "once" | "always" | "deny";

const MUTED_TONE = "text-muted-foreground hover:text-foreground";

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

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function MoreApprovalOptions({ onAlwaysAllow }: { onAlwaysAllow: () => void }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(rootRef, isOpen, close);

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label="More approval options"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={cn(INLINE_BUTTON, MUTED_TONE)}
        onClick={() => setIsOpen(!isOpen)}
      >
        More
      </button>
      {isOpen && (
        <div role="menu" className={cn(MENU_POPUP, "absolute right-0 bottom-full mb-1 w-max")}>
          <button type="button" role="menuitem" title="⌥⌘↵" className={MENU_ITEM} onClick={onAlwaysAllow}>
            <span className="min-w-0 whitespace-normal">Always allow this session</span>
          </button>
        </div>
      )}
    </span>
  );
}

export function ApprovalRow({ request, onDecide }: ApprovalRowProps) {
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
    <div className="pb-2">
      <WorkLogRow
        role="group"
        aria-label="Permission request"
        isWrapping
        icon={<Icon className="size-4" strokeWidth={2} />}
        label={
          <code
            className={cn(
              "block max-h-40 min-w-0 overflow-auto font-mono text-xs leading-5 whitespace-pre-wrap text-foreground",
              "select-text [overflow-wrap:anywhere]",
            )}
          >
            {request.isShell && <span className="text-muted-foreground">$ </span>}
            {request.target}
          </code>
        }
      >
        <div className="ms-7.5 flex min-w-0 flex-col gap-1 pb-1 text-xs">
          <span className="text-muted-foreground [overflow-wrap:anywhere]">
            {capitalized(request.requester)} · waiting {elapsedSince(request.since, Date.now())}
          </span>
          {request.reason && (
            <span className="text-muted-foreground select-text [overflow-wrap:anywhere]">{request.reason}</span>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 text-warning">
              <Shield aria-hidden className="size-3 shrink-0" />
              Waiting for approval
            </span>
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
            <button type="button" title="esc" className={cn(INLINE_BUTTON, MUTED_TONE)} onClick={decide("deny")}>
              Decline
            </button>
            <button
              type="button"
              title="⌘↵"
              className={cn(INLINE_BUTTON, "text-foreground")}
              onClick={decide("once")}
            >
              Approve
            </button>
            <MoreApprovalOptions onAlwaysAllow={decide("always")} />
          </div>
        </div>
      </WorkLogRow>
    </div>
  );
}
