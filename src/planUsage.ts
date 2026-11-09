import { CLAUDE_COMMANDS } from "./agentOptions";
import type { Chat } from "./types";

export const USAGE_UPDATED = "usage-updated";

export interface UsageWindow {
  utilization: number;
  resetsAt: number | null;
}

export interface ModelWeek extends UsageWindow {
  model: string;
}

export interface ExtraUsage {
  utilization: number | null;
  used: number | null;
  monthlyLimit: number | null;
  currency: string | null;
}

export interface PlanUsage {
  subscriptionType: string | null;
  hasPlanLimits: boolean;
  session: UsageWindow | null;
  week: UsageWindow | null;
  modelWeeks: ModelWeek[];
  extraUsage: ExtraUsage | null;
}

export interface UsageReport {
  command: string;
  updatedAt: number;
  usage: PlanUsage;
}

function lastUsedAt(chats: Chat[], command: string): number {
  return Math.max(0, ...chats.filter((chat) => chat.command === command).map((chat) => chat.updatedAt));
}

export function commandsByRecentUse(chats: Chat[]): string[] {
  return [...CLAUDE_COMMANDS].sort((first, second) => lastUsedAt(chats, second) - lastUsedAt(chats, first));
}
