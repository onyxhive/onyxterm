import { invoke } from "@tauri-apps/api/core";
import type {
  CommitResult,
  Editor,
  EditorId,
  GitBranches,
  GitDiff,
  GitStatus,
  MergeMethod,
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
export const GH_NOT_INSTALLED = "gh-not-installed";
export const GH_NOT_LOGGED_IN = "gh-not-logged-in";

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
  status: (projectId: string) => invoke<GitStatus>("git_status", { projectId }),
  branches: (projectId: string) => invoke<GitBranches>("git_branches", { projectId }),
  checkout: (projectId: string, branch: string, force = false) =>
    invoke<GitStatus>("git_checkout", { projectId, branch, force }),
  createBranch: (projectId: string, name: string, from: string | null = null, force = false) =>
    invoke<GitStatus>("git_create_branch", { projectId, name, from, force }),
  diff: (projectId: string, file: string | null = null) => invoke<GitDiff>("git_diff", { projectId, file }),
  commit: (projectId: string, message: string, files: string[] | null = null) =>
    invoke<CommitResult>("git_commit", { projectId, message, files }),
  push: (projectId: string) => invoke<GitStatus>("git_push", { projectId }),
  turnDiff: (chatId: string, turn: number) => invoke<TurnDiff>("git_turn_diff", { chatId, turn }),
  checkpointTurns: (chatId: string) => invoke<number[]>("git_checkpoint_turns", { chatId }),
};

export const prApi = {
  list: (projectId: string, state: PrState = "open") => invoke<PullRequest[]>("pr_list", { projectId, state }),
  view: (projectId: string, number: number) => invoke<PullRequestDetail>("pr_view", { projectId, number }),
  forBranch: (projectId: string, branch: string) =>
    invoke<PullRequest | null>("pr_for_branch", { projectId, branch }),
  checks: (projectId: string, number: number) => invoke<PrCheck[]>("pr_checks", { projectId, number }),
  create: (projectId: string, draft: PullRequestDraft) =>
    invoke<PullRequestDetail>("pr_create", { projectId, draft }),
  merge: (projectId: string, number: number, method: MergeMethod) =>
    invoke<void>("pr_merge", { projectId, number, method }),
};

export const agentApi = {
  subagents: (chatId: string) => invoke<Subagent[]>("list_subagents", { chatId }),
};

export const desktopApi = {
  machineName: () => invoke<string>("machine_name"),
  revealProject: (projectId: string) => invoke<void>("reveal_project", { projectId }),
  editors: () => invoke<Editor[]>("list_editors"),
  openInEditor: (projectId: string, editorId: EditorId) => invoke<void>("open_in_editor", { projectId, editorId }),
};

export const scriptApi = {
  list: (projectId: string) => invoke<ProjectScript[]>("list_scripts", { projectId }),
  add: (projectId: string, name: string, command: string) =>
    invoke<ProjectScript>("add_script", { projectId, name, command }),
  remove: (scriptId: string) => invoke<void>("remove_script", { scriptId }),
  run: (scriptId: string) => invoke<string>("run_script", { scriptId }),
  stop: (runId: string) => invoke<void>("stop_script", { runId }),
};
