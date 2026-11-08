import type { ChatFeed } from "./feed";
import { runningActivity } from "./feed";
import { timestampFormat, type TimestampFormat } from "./preferences";
import type { Chat, Task } from "./types";

const TITLE_LENGTH = 60;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

const HOUR12_BY_FORMAT: Record<TimestampFormat, boolean | undefined> = {
  locale: undefined,
  "12-hour": true,
  "24-hour": false,
};

const SENTENCE_END = /(?<=[.!?])\s/;
const WHITESPACE = /\s+/;

function wordsOf(text: string): string[] {
  return text.split(WHITESPACE).filter(Boolean);
}

function isReference(word: string): boolean {
  return word.startsWith("@") || word.includes("/");
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function capped(text: string): string {
  if (text.length <= TITLE_LENGTH) return text;
  const cut = text.slice(0, TITLE_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function titleFrom(prompt: string): string {
  const words = wordsOf(prompt);
  const plain = words.filter((word) => !isReference(word)).join(" ");
  const sentence = plain.split(SENTENCE_END)[0].trim();
  return capped(sentence ? capitalized(sentence) : words.join(" "));
}

export function displayTitle(title: string): string {
  const words = wordsOf(title);
  const start = words.findIndex((word) => !isReference(word));
  if (start <= 0) return title;
  return capitalized(words.slice(start).join(" "));
}

export function clockTime(at: Date = new Date()): string {
  return at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: HOUR12_BY_FORMAT[timestampFormat()] });
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
    title: displayTitle(chat.title),
    status: chat.state,
    projectId: chat.projectId,
    provider: chat.provider,
    command: chat.command,
    model: chat.model,
    effort: chat.effort,
    permissionMode: chat.permissionMode,
    fastMode: chat.fastMode,
    ultracode: chat.ultracode,
    elapsed: elapsedSince(chat.updatedAt, now),
    workingSince: feed.turnStartedAt ?? chat.updatedAt,
    feed: feed.items,
    work: { runningNow: runningActivity(feed), files: Object.values(feed.files) },
    branch: chat.branch,
    worktreePath: chat.worktreePath ?? null,
    isWorktreeRemoved: chat.isWorktreeRemoved ?? false,
    pr: chat.pr ?? null,
  };
}
