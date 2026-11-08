import type { ChatFeed } from "./feed";
import { runningActivity } from "./feed";
import type { Chat, Task } from "./types";

const TITLE_LENGTH = 60;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

export function titleFrom(text: string): string {
  const firstLine = text.split("\n")[0].trim();
  return firstLine.length > TITLE_LENGTH ? `${firstLine.slice(0, TITLE_LENGTH)}…` : firstLine;
}

export function clockTime(at: Date = new Date()): string {
  return at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function elapsedSince(timestamp: number, now: number): string {
  const minutes = Math.floor((now - timestamp) / MS_PER_SECOND / SECONDS_PER_MINUTE);
  if (minutes < 1) return "now";
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return `${hours}h`;
  return `${Math.floor(hours / HOURS_PER_DAY)}d`;
}

export function toTask(chat: Chat, feed: ChatFeed, now: number): Task {
  return {
    id: chat.id,
    title: chat.title,
    status: chat.state,
    projectId: chat.projectId,
    provider: chat.provider,
    command: chat.command,
    model: chat.model,
    effort: chat.effort,
    elapsed: elapsedSince(chat.updatedAt, now),
    workingSince: feed.turnStartedAt ?? chat.updatedAt,
    feed: feed.items,
    work: { runningNow: runningActivity(feed), files: Object.values(feed.files) },
  };
}
