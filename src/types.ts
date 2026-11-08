export type TaskStatus = "permission" | "question" | "review" | "running" | "failed" | "done";

export type Provider = "Claude Code" | "Codex";

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
}

export interface Workspace {
  id: string;
  name: string;
  position: number;
  projects: Project[];
}

export interface Chat {
  id: string;
  workspaceId: string;
  projectId: string;
  provider: Provider;
  command: string;
  model: string;
  effort: string;
  sessionId: string;
  title: string;
  state: TaskStatus;
  createdAt: number;
  updatedAt: number;
  branch: string | null;
  pr?: ChatPullRequest | null;
}

export interface Step {
  id: string;
  verb: string;
  detail: string;
  isNested: boolean;
  isFailed: boolean;
}

export interface QuestionOption {
  label: string;
  description: string;
}

export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export type FeedItem =
  | { kind: "user"; text: string; time: string }
  | { kind: "agent"; messageId: string; blockIndex: number; markdown: string; isFinal: boolean; time: string }
  | { kind: "steps"; files: number; steps: Step[] }
  | { kind: "note"; text: string }
  | {
      kind: "permission";
      requestId: string;
      requester: string;
      action: string;
      target: string;
      isShell: boolean;
      reason: string;
      since: number;
    }
  | { kind: "question"; requestId: string; questions: Question[]; since: number };

export interface ChangedFile {
  path: string;
  added: number;
  removed: number;
}

export interface Work {
  runningNow: string;
  files: ChangedFile[];
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  projectId: string;
  provider: Provider;
  command: string;
  model: string;
  effort: string;
  elapsed: string;
  workingSince: number;
  feed: FeedItem[];
  work: Work;
  branch: string | null;
  pr: ChatPullRequest | null;
}

export type SuggestionKind = "command" | "agent" | "folder" | "file";

export interface Suggestion {
  kind: SuggestionKind;
  value: string;
  hint: string;
  description: string;
}

export interface Toast {
  id: string;
  taskId: string;
  headline: string;
  detail: string;
}

export type FileChange =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "typeChanged"
  | "untracked"
  | "conflicted";

export interface GitChangedFile {
  path: string;
  originalPath: string | null;
  change: FileChange;
  isStaged: boolean;
  isUnstaged: boolean;
  added: number;
  removed: number;
}

export interface GitStatus {
  branch: string | null;
  head: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitChangedFile[];
}

export interface GitBranch {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  upstream: string | null;
  lastCommitAt: number;
}

export interface GitBranches {
  current: string | null;
  branches: GitBranch[];
}

export interface GitDiff {
  text: string;
  isTruncated: boolean;
}

export interface CommitResult {
  oid: string;
  summary: string;
}

export interface DiffFile {
  path: string;
  added: number;
  removed: number;
}

export interface TurnDiff {
  turn: number;
  text: string;
  isTruncated: boolean;
  files: DiffFile[];
}

export type PrState = "open" | "closed" | "merged" | "all";

export type MergeMethod = "merge" | "squash" | "rebase";

export interface ChecksSummary {
  total: number;
  passed: number;
  failed: number;
  pending: number;
}

export interface PrAuthor {
  login: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  headRefName: string;
  baseRefName: string;
  author: PrAuthor;
  isDraft: boolean;
  reviewDecision: string | null;
  checks: ChecksSummary;
  url: string;
  updatedAt: string;
}

export interface PrFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface PrComment {
  author: PrAuthor;
  body: string;
  createdAt: string;
}

export interface PrReview {
  author: PrAuthor;
  state: string;
  body: string;
  submittedAt: string;
}

export interface PullRequestDetail extends PullRequest {
  body: string;
  files: PrFile[];
  comments: PrComment[];
  reviews: PrReview[];
  mergeable: string;
}

export interface PrCheck {
  name: string;
  state: string;
  bucket: string;
  link: string;
  workflow: string;
  description: string;
  startedAt: string;
  completedAt: string;
}

export interface PullRequestDraft {
  title: string;
  body?: string;
  base?: string | null;
  draft?: boolean;
}

export interface ChatPullRequest {
  number: number;
  state: string;
  isDraft: boolean;
  url: string;
  checks: ChecksSummary;
}

export type SubagentStatus = "running" | "completed" | "failed";

export interface Subagent {
  toolUseId: string;
  agentType: string;
  description: string;
  status: SubagentStatus;
  lastTool: string | null;
  summary: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
}

export type EditorId =
  | "vscode"
  | "cursor"
  | "zed"
  | "windsurf"
  | "sublimeText"
  | "xcode"
  | "intellijIdea"
  | "webstorm"
  | "rustRover"
  | "goland"
  | "pycharm"
  | "datagrip"
  | "fleet"
  | "nova"
  | "terminal"
  | "ghostty"
  | "iterm"
  | "warp";

export interface Editor {
  id: EditorId;
  name: string;
  appPath: string;
}

export interface ProjectScript {
  id: string;
  projectId: string;
  name: string;
  command: string;
  position: number;
}

export type ScriptStream = "stdout" | "stderr";

export interface ScriptOutput {
  scriptId: string;
  runId: string;
  line: string;
  stream: ScriptStream;
}

export interface ScriptExited {
  scriptId: string;
  runId: string;
  code: number | null;
}
