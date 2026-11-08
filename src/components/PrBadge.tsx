import type { ChatPullRequest } from "../types";
import { cn } from "./ui";
import { checksPresentation, PR_STATE_PRESENTATION, prDisplayState } from "./prPresentation";

export function ChecksDot({ className, dotClass, label }: { className?: string; dotClass: string; label: string }) {
  return (
    <span title={label} className={cn("inline-flex items-center", className)}>
      <span aria-hidden="true" className={cn("inline-block size-1.5 shrink-0 rounded-full", dotClass)} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PrBadge({ pr, className }: { pr: ChatPullRequest; className?: string }) {
  const presentation = PR_STATE_PRESENTATION[prDisplayState(pr.state, pr.isDraft)];
  const checks = checksPresentation(pr.checks);
  return (
    <span
      title={`Pull request #${pr.number}, ${presentation.label.toLowerCase()}`}
      className={cn("inline-flex shrink-0 items-center gap-1 text-xs tabular-nums", className)}
    >
      <presentation.Icon aria-hidden className={cn("size-3 shrink-0", presentation.toneClass)} />
      <span className="text-secondary-label">#{pr.number}</span>
      {checks && <ChecksDot dotClass={checks.dotClass} label={checks.label} />}
    </span>
  );
}
