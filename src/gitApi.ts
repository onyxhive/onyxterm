import { invoke } from "@tauri-apps/api/core";
import type {
  Chat,
  CommitResult,
  Editor,
  EditorId,
  GitBranches,
  GitDiff,
  GitStatus,
  MergeMethod,
  PrAuthorFilter,
  PrCheck,
  PrState,
  ProjectScript,
  PullRequest,
  PullRequestDetail,
  PullRequestDraft,
  Subagent,
  TurnDiff,
} from "./types";

export const PRS_UPDATED = "prs-updated";
export const SCRIPT_OUTPUT = "script-output";
export const SCRIPT_EXITED = "script-exited";
export const PREFERRED_EDITOR_SETTING = "preferredEditor";
export const WORK_IN_WORKTREES_SETTING = "workInWorktrees";
export const PR_AUTHOR_FILTER_SETTING = "prAuthorFilter";
export const GH_NOT_INSTALLED = "gh-not-installed";
export const GH_NOT_LOGGED_IN = "gh-not-logged-in";

export type GitTarget = { project: string } | { chat: string };

export interface PrsUpdatedPayload {
  projectId: string;
}

export type GhProblem = typeof GH_NOT_INSTALLED | typeof GH_NOT_LOGGED_IN;

export function ghProblemOf(error: unknown): GhProblem | null {
  const message = String(error);
  if (message.startsWith(GH_NOT_INSTALLED)) return GH_NOT_INSTALLED;
  if (message.startsWith(GH_NOT_LOGGED_IN)) return GH_NOT_LOGGED_IN;
  return null;
}

export const gitApi = {
  status: (target: GitTarget) => invoke<GitStatus>("git_status", { target }),
  branches: (target: GitTarget) => invoke<GitBranches>("git_branches", { target }),
  checkout: (target: GitTarget, branch: string, force = false) =>
    invoke<GitStatus>("git_checkout", { target, branch, force }),
  createBranch: (target: GitTarget, name: string, from: string | null = null, force = false) =>
    invoke<GitStatus>("git_create_branch", { target, name, from, force }),
  diff: (target: GitTarget, file: string | null = null) => invoke<GitDiff>("git_diff", { target, file }),
  commit: (target: GitTarget, message: string, files: string[] | null = null) =>
    invoke<CommitResult>("git_commit", { target, message, files }),
  push: (target: GitTarget) => invoke<GitStatus>("git_push", { target }),
  removeChatWorktree: (chatId: string) => invoke<Chat>("remove_chat_worktree", { chatId }),
  turnDiff: (chatId: string, turn: number) => invoke<TurnDiff>("git_turn_diff", { chatId, turn }),
  checkpointTurns: (chatId: string) => invoke<number[]>("git_checkpoint_turns", { chatId }),
};

export const prApi = {
  list: (projectId: string, state: PrState = "open", author: PrAuthorFilter = "everyone") =>
    invoke<PullRequest[]>("pr_list", { projectId, state, author }),
  view: (projectId: string, number: number) => invoke<PullRequestDetail>("pr_view", { projectId, number }),
  forBranch: (projectId: string, branch: string) =>
    invoke<PullRequest | null>("pr_for_branch", { projectId, branch }),
  checks: (projectId: string, number: number) => invoke<PrCheck[]>("pr_checks", { projectId, number }),
  diff: (projectId: string, number: number) => invoke<GitDiff>("pr_diff", { projectId, number }),
  create: (target: GitTarget, draft: PullRequestDraft) => invoke<PullRequestDetail>("pr_create", { target, draft }),
  merge: (projectId: string, number: number, method: MergeMethod) =>
    invoke<void>("pr_merge", { projectId, number, method }),
};

export const agentApi = {
  subagents: (chatId: string) => invoke<Subagent[]>("list_subagents", { chatId }),
};

export const desktopApi = {
  machineName: () => invoke<string>("machine_name"),
  revealProject: (target: GitTarget) => invoke<void>("reveal_project", { target }),
  editors: () => invoke<Editor[]>("list_editors"),
  openInEditor: (target: GitTarget, editorId: EditorId) => invoke<void>("open_in_editor", { target, editorId }),
};

export const scriptApi = {
  list: (projectId: string) => invoke<ProjectScript[]>("list_scripts", { projectId }),
  add: (projectId: string, name: string, command: string) =>
    invoke<ProjectScript>("add_script", { projectId, name, command }),
  remove: (scriptId: string) => invoke<void>("remove_script", { scriptId }),
  run: (scriptId: string) => invoke<string>("run_script", { scriptId }),
  stop: (runId: string) => invoke<void>("stop_script", { runId }),
};
