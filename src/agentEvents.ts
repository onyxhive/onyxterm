import type { Question } from "./types";

export interface ToolSummary {
  verb: string;
  detail: string;
  filePath: string | null;
  added: number;
  removed: number;
}

export interface SlashCommand {
  name: string;
  description: string;
  argumentHint: string;
}

export interface AgentProfile {
  name: string;
  description: string;
}

export interface ModelOption {
  value: string;
  displayName: string;
  description: string;
  supportsEffort: boolean;
  supportedEffortLevels: string[];
}

export interface Account {
  email: string | null;
  organization: string | null;
  subscriptionType: string | null;
}

export interface Capabilities {
  commands: SlashCommand[];
  agents: AgentProfile[];
  models: ModelOption[];
  account: Account;
}

export type AgentEvent =
  | { kind: "session"; sessionId: string }
  | { kind: "userText"; text: string }
  | { kind: "textDelta"; messageId: string; index: number; text: string }
  | { kind: "text"; messageId: string; text: string }
  | { kind: "toolStarted"; toolUseId: string; parentToolUseId: string | null; summary: ToolSummary }
  | { kind: "toolFinished"; toolUseId: string; isError: boolean }
  | { kind: "permissionRequested"; requestId: string; toolUseId: string | null; summary: ToolSummary; reason: string }
  | { kind: "questionAsked"; requestId: string; questions: Question[] }
  | { kind: "permissionCancelled"; requestId: string }
  | { kind: "turnEnded"; isError: boolean; costUsd: number | null; message: string | null }
  | { kind: "initialized"; capabilities: Capabilities }
  | { kind: "titleChanged"; title: string }
  | { kind: "processExited"; message: string }
  | { kind: "subagentStarted"; toolUseId: string; agentType: string; description: string }
  | { kind: "subagentProgress"; toolUseId: string; lastTool: string | null; text: string }
  | { kind: "subagentFinished"; toolUseId: string; isError: boolean; summary: string };

export interface ChatEventPayload {
  chatId: string;
  event: AgentEvent;
}

export const CHAT_EVENT = "chat-event";
export const CHAT_UPDATED = "chat-updated";
