import type { ChatDraft } from "./components/NewChat";
import type { PermissionDecision } from "./components/PermissionCard";
import type { FeedItem, Task } from "./mock";

const TITLE_LENGTH = 60;

function clockTime(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function userMessage(text: string): FeedItem {
  return { kind: "user", text, time: clockTime() };
}

function resumeWith(task: Task, feed: FeedItem[]): Task {
  return { ...task, feed, status: "running", workingSeconds: 0, elapsed: "now" };
}

function decisionNote(decision: PermissionDecision, command: string): string {
  const notes: Record<PermissionDecision, string> = {
    once: `You allowed ${command} once`,
    always: `You allowed ${command} for this task`,
    deny: `You denied ${command}`,
  };
  return notes[decision];
}

export function withReply(task: Task, text: string): Task {
  return resumeWith(task, [...task.feed, userMessage(text)]);
}

export function withDecision(task: Task, decision: PermissionDecision): Task {
  const feed = task.feed.map((item): FeedItem =>
    item.kind === "permission" ? { kind: "note", text: decisionNote(decision, item.command) } : item,
  );
  return resumeWith(task, feed);
}

export function withAnswer(task: Task, answer: string): Task {
  const feed = task.feed.map((item) => (item.kind === "question" ? userMessage(answer) : item));
  return resumeWith(task, feed);
}

export function withStop(task: Task): Task {
  return { ...task, status: "failed", feed: [...task.feed, { kind: "note", text: "You stopped the agent" }] };
}

export function withDone(task: Task): Task {
  return { ...task, status: "done" };
}

export function createTask(draft: ChatDraft): Task {
  const title = draft.text.length > TITLE_LENGTH ? `${draft.text.slice(0, TITLE_LENGTH)}…` : draft.text;
  return {
    id: `chat-${Date.now()}`,
    title,
    status: "running",
    projectId: draft.projectId,
    provider: draft.provider,
    command: draft.command,
    model: draft.model,
    effort: draft.effort,
    elapsed: "now",
    workingSeconds: 0,
    feed: [userMessage(draft.text)],
    work: { phase: "Starting", progress: 0.05, runningNow: "", files: [], branch: "", base: "main" },
  };
}
