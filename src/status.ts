import type { Task, TaskStatus } from "./types";

export interface StatusGroup {
  id: string;
  title: string;
  statuses: TaskStatus[];
}

export const STATUS_GROUPS: StatusGroup[] = [
  { id: "waiting", title: "Needs you", statuses: ["permission", "question", "review"] },
  { id: "running", title: "Running", statuses: ["running"] },
  { id: "failed", title: "Failed", statuses: ["failed"] },
  { id: "done", title: "Done", statuses: ["done"] },
];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  permission: "Needs permission",
  question: "Asked you",
  review: "Ready for review",
  running: "Running",
  failed: "Failed",
  done: "Done",
};

const WAITING_STATUSES = STATUS_GROUPS[0].statuses;

export function isWaiting(status: TaskStatus): boolean {
  return WAITING_STATUSES.includes(status);
}

export function tasksInGroup(tasks: Task[], group: StatusGroup): Task[] {
  return tasks.filter((task) => group.statuses.includes(task.status));
}

export function taskLabel(task: Task): string {
  const commandName = task.command.replace(/^claude-/, "");
  return [commandName, task.model.toLowerCase(), task.effort].join(" · ");
}

export interface StatusTone {
  textClass: string;
  dotClass: string;
  isPulsing: boolean;
}

export const STATUS_TONE: Record<TaskStatus, StatusTone> = {
  permission: { textClass: "text-approval", dotClass: "bg-approval-dot", isPulsing: false },
  question: { textClass: "text-input-request", dotClass: "bg-input-request-dot", isPulsing: false },
  review: { textClass: "text-primary", dotClass: "bg-primary", isPulsing: false },
  running: { textClass: "text-working", dotClass: "bg-working-dot", isPulsing: true },
  failed: { textClass: "text-failed", dotClass: "bg-failed-dot", isPulsing: false },
  done: { textClass: "text-muted-foreground", dotClass: "bg-muted-foreground/50", isPulsing: false },
};
