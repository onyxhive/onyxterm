import type { GitStatus } from "./types";

export type GitMenuAction = "commit" | "push" | "createPr";

export interface GitMenuItem {
  action: GitMenuAction;
  label: string;
  isDisabled: boolean;
}

export interface GitMenuInput {
  status: GitStatus | null;
  isBusy: boolean;
  hasOpenPr: boolean;
}

export function gitMenuItems({ status, isBusy, hasOpenPr }: GitMenuInput): GitMenuItem[] {
  if (!status) return [];
  const hasBranch = status.branch !== null;
  const isBehind = status.behind > 0;
  const canReachRemote = status.upstream !== null || status.hasRemote;
  const canCommit = !isBusy && status.files.length > 0;
  const canPush = !isBusy && hasBranch && !isBehind && status.ahead > 0 && canReachRemote;
  const canCreatePr = !isBusy && hasBranch && !hasOpenPr && status.aheadOfDefault > 0 && !isBehind && canReachRemote;
  const commit: GitMenuItem = { action: "commit", label: "Commit", isDisabled: !canCommit };
  if (!status.hasRemote) return [commit];
  const push: GitMenuItem = { action: "push", label: "Push", isDisabled: !canPush };
  if (hasOpenPr) return [commit, push];
  return [commit, push, { action: "createPr", label: "Create PR", isDisabled: !canCreatePr }];
}
