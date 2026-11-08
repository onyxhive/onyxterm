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
  verb: string;
  detail: string;
}

export type FeedItem =
  | { kind: "user"; text: string; time: string }
  | { kind: "agent"; markdown: string }
  | { kind: "steps"; files: number; steps: Step[] }
  | { kind: "note"; text: string }
  | { kind: "permission"; requester: string; command: string; where: string; reason: string; waited: string }
  | { kind: "question"; markdown: string; choices: string[]; waited: string };

export interface ChangedFile {
  path: string;
  added: number;
  removed: number;
}

export interface Work {
  phase: string;
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
  workingSeconds: number;
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
