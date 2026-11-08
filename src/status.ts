import type { Task, TaskStatus } from "./types";

export interface StatusGroup {
  id: string;
  title: string;
  statuses: TaskStatus[];
}

export const STATUS_GROUPS: StatusGroup[] = [
  { id: "waiting", title: "Waiting for you", statuses: ["permission", "question", "review"] },
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
