import { useEffect } from "react";
import { ShieldAlert } from "lucide-react";
import { elapsedSince } from "../tasks";
import type { FeedItem } from "../types";

export type PermissionDecision = "once" | "always" | "deny";

type PermissionRequest = Extract<FeedItem, { kind: "permission" }>;

interface PermissionCardProps {
  request: PermissionRequest;
  onDecide: (requestId: string, decision: PermissionDecision) => void;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
}

function decisionForKey(event: KeyboardEvent): PermissionDecision | null {
  if (event.key === "Enter" && event.metaKey) return event.altKey ? "always" : "once";
  if (event.key === "Escape" && !isTyping(event.target)) return "deny";
  return null;
}

export function PermissionCard({ request, onDecide }: PermissionCardProps) {
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

  return (
    <section className="card permission-card" aria-label="Permission request">
      <header className="card__header">
        <ShieldAlert size={15} className="permission-card__icon" />
        <span className="card__title">Permission needed</span>
        <span className="card__meta">
          from {request.requester}, waiting {elapsedSince(request.since, Date.now())}
        </span>
      </header>
      <div className="permission-card__body">
        <span className="permission-card__label">Wants to {request.action}</span>
        <pre className="permission-card__command">
          {request.isShell && <span className="permission-card__prompt">$</span>} {request.target}
        </pre>
        {request.reason && <blockquote className="permission-card__reason">{request.reason}</blockquote>}
      </div>
      <footer className="permission-card__actions">
        <button type="button" className="button button--primary" onClick={() => onDecide(request.requestId, "once")}>
          Allow once <kbd>⌘↵</kbd>
        </button>
        <button type="button" className="button" onClick={() => onDecide(request.requestId, "always")}>
          Always for this task <kbd>⌥⌘↵</kbd>
        </button>
        <button type="button" className="button button--quiet" onClick={() => onDecide(request.requestId, "deny")}>
          Deny <kbd>esc</kbd>
        </button>
      </footer>
    </section>
  );
}
