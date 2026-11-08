import { GitMerge, GitPullRequestArrow, GitPullRequestClosed, GitPullRequestDraft, type LucideIcon } from "lucide-react";
import type { ChecksSummary } from "../types";

export type PrDisplayState = "open" | "draft" | "closed" | "merged";

export interface PrStatePresentation {
  label: string;
  toneClass: string;
  Icon: LucideIcon;
}

export const PR_STATE_PRESENTATION: Record<PrDisplayState, PrStatePresentation> = {
  open: { label: "Open", toneClass: "text-emerald-600 dark:text-emerald-300/90", Icon: GitPullRequestArrow },
  draft: { label: "Draft", toneClass: "text-zinc-500 dark:text-zinc-400/80", Icon: GitPullRequestDraft },
  closed: { label: "Closed", toneClass: "text-red-600 dark:text-red-300/90", Icon: GitPullRequestClosed },
  merged: { label: "Merged", toneClass: "text-violet-600 dark:text-violet-300/90", Icon: GitMerge },
};

export function prDisplayState(state: string, isDraft: boolean): PrDisplayState {
  const normalized = state.toLowerCase();
  if (normalized === "merged") return "merged";
  if (normalized === "closed") return "closed";
  return isDraft ? "draft" : "open";
}

export interface ChecksPresentation {
  label: string;
  dotClass: string;
}

function checksCountLabel(checks: ChecksSummary): string {
  return `${checks.passed}/${checks.total} checks passed`;
}

export function checksPresentation(checks: ChecksSummary): ChecksPresentation | null {
  if (checks.total === 0) return null;
  if (checks.failed > 0) return { label: `${checks.failed} failing, ${checksCountLabel(checks)}`, dotClass: "bg-error" };
  if (checks.pending > 0) return { label: `${checks.pending} pending, ${checksCountLabel(checks)}`, dotClass: "bg-warning" };
  return { label: checksCountLabel(checks), dotClass: "bg-success" };
}

const REVIEW_LABELS: Record<string, string> = {
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  REVIEW_REQUIRED: "Review required",
};

export function reviewDecisionLabel(decision: string | null): string | null {
  if (!decision) return null;
  return REVIEW_LABELS[decision] ?? null;
}
