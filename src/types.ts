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
  | { kind: "agent"; messageId: string; blockIndex: number; markdown: string; isFinal: boolean }
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
}

export interface Suggestion {
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
