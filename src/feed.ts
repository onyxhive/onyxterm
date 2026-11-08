import type { AgentEvent, ToolSummary } from "./agentEvents";
import type { PermissionDecision } from "./components/ApprovalRow";
import { clockTime } from "./tasks";
import type { ChangedFile, FeedItem, Step } from "./types";

export interface ChatFeed {
  items: FeedItem[];
  runningTools: Record<string, string>;
  files: Record<string, ChangedFile>;
  turnStartedAt: number | null;
}

export const EMPTY_FEED: ChatFeed = { items: [], runningTools: {}, files: {}, turnStartedAt: null };

const PRESENT_TENSE: Record<string, string> = {
  Ran: "run",
  Read: "read",
  Edited: "edit",
  Wrote: "write",
  Searched: "search",
  Listed: "list",
  Fetched: "fetch",
  "Searched the web for": "search the web for",
  Started: "start",
  Updated: "update",
};

const SHELL_VERB = "Ran";
const FILE_CHANGE_VERBS = new Set(["Edited", "Wrote"]);
const AGENT_REQUESTER = "the agent";
const SUBAGENT_REQUESTER = "a subagent";

type AgentItem = Extract<FeedItem, { kind: "agent" }>;
type StepsItem = Extract<FeedItem, { kind: "steps" }>;

function isAgentItem(item: FeedItem): item is AgentItem {
  return item.kind === "agent";
}

function withItems(feed: ChatFeed, items: FeedItem[]): ChatFeed {
  return { ...feed, items };
}

function appendDelta(feed: ChatFeed, messageId: string, index: number, text: string): ChatFeed {
  const position = feed.items.findLastIndex(
    (item) => isAgentItem(item) && item.messageId === messageId && item.blockIndex === index && !item.isFinal,
  );
  if (position === -1) {
    const created: AgentItem = {
      kind: "agent",
      messageId,
      blockIndex: index,
      markdown: text,
      isFinal: false,
      time: "",
    };
    return withItems(feed, [...feed.items, created]);
  }
  const items = feed.items.map((item, at) =>
    at === position && isAgentItem(item) ? { ...item, markdown: item.markdown + text } : item,
  );
  return withItems(feed, items);
}

function finalizeText(feed: ChatFeed, messageId: string, text: string): ChatFeed {
  const position = feed.items.findIndex((item) => isAgentItem(item) && item.messageId === messageId && !item.isFinal);
  if (position === -1) {
    const created: AgentItem = { kind: "agent", messageId, blockIndex: -1, markdown: text, isFinal: true, time: "" };
    return withItems(feed, [...feed.items, created]);
  }
  const items = feed.items.map((item, at) =>
    at === position && isAgentItem(item) ? { ...item, markdown: text, isFinal: true } : item,
  );
  return withItems(feed, items);
}

function changedFileCount(steps: Step[]): number {
  return new Set(steps.filter((step) => FILE_CHANGE_VERBS.has(step.verb)).map((step) => step.detail)).size;
}

function withFile(files: Record<string, ChangedFile>, summary: ToolSummary): Record<string, ChangedFile> {
  if (!summary.filePath || !FILE_CHANGE_VERBS.has(summary.verb)) return files;
  const existing = files[summary.filePath] ?? { path: summary.filePath, added: 0, removed: 0 };
  return {
    ...files,
    [summary.filePath]: {
      ...existing,
      added: existing.added + summary.added,
      removed: existing.removed + summary.removed,
    },
  };
}

function startTool(feed: ChatFeed, toolUseId: string, isNested: boolean, summary: ToolSummary): ChatFeed {
  const step: Step = {
    id: toolUseId,
    verb: summary.verb,
    detail: summary.detail,
    isNested,
    isFailed: false,
  };
  const last = feed.items.at(-1);
  const files = withFile(feed.files, summary);
  const runningTools = { ...feed.runningTools, [toolUseId]: `${summary.verb} ${summary.detail}` };
  if (last?.kind === "steps") {
    const steps = [...last.steps, step];
    const updated: StepsItem = { ...last, steps, files: changedFileCount(steps) };
    return { ...feed, files, runningTools, items: [...feed.items.slice(0, -1), updated] };
  }
  const created: StepsItem = { kind: "steps", steps: [step], files: changedFileCount([step]) };
  return { ...feed, files, runningTools, items: [...feed.items, created] };
}

function finishTool(feed: ChatFeed, toolUseId: string, isError: boolean): ChatFeed {
  const runningTools = { ...feed.runningTools };
  delete runningTools[toolUseId];
  if (!isError) return { ...feed, runningTools };
  const items = feed.items.map((item) =>
    item.kind === "steps"
      ? { ...item, steps: item.steps.map((step) => (step.id === toolUseId ? { ...step, isFailed: true } : step)) }
      : item,
  );
  return { ...feed, runningTools, items };
}

function permissionItem(event: Extract<AgentEvent, { kind: "permissionRequested" }>, feed: ChatFeed): FeedItem {
  const { summary } = event;
  const step = feed.items
    .flatMap((item) => (item.kind === "steps" ? item.steps : []))
    .find((candidate) => candidate.id === event.toolUseId);
  return {
    kind: "permission",
    requestId: event.requestId,
    requester: step?.isNested ? SUBAGENT_REQUESTER : AGENT_REQUESTER,
    action: PRESENT_TENSE[summary.verb] ?? "use",
    target: summary.filePath ?? summary.detail,
    isShell: summary.verb === SHELL_VERB,
    reason: event.reason,
    since: Date.now(),
  };
}

function replaceRequest(feed: ChatFeed, requestId: string, replacement: FeedItem): ChatFeed {
  const items = feed.items.map((item) =>
    (item.kind === "permission" || item.kind === "question") && item.requestId === requestId ? replacement : item,
  );
  return withItems(feed, items);
}

function endTurn(feed: ChatFeed, isError: boolean, message: string | null): ChatFeed {
  const settled = { ...feed, runningTools: {}, turnStartedAt: null };
  if (!isError || !message) return settled;
  return withItems(settled, [...settled.items, { kind: "note", text: `The turn failed: ${message}` }]);
}

export function reduceFeed(feed: ChatFeed, event: AgentEvent): ChatFeed {
  switch (event.kind) {
    case "userText":
      return withItems(feed, [...feed.items, { kind: "user", text: event.text, time: "" }]);
    case "textDelta":
      return appendDelta(feed, event.messageId, event.index, event.text);
    case "text":
      return finalizeText(feed, event.messageId, event.text);
    case "toolStarted":
      return startTool(feed, event.toolUseId, event.parentToolUseId !== null, event.summary);
    case "toolFinished":
      return finishTool(feed, event.toolUseId, event.isError);
    case "permissionRequested":
      return withItems(feed, [...feed.items, permissionItem(event, feed)]);
    case "questionAsked":
      return withItems(feed, [
        ...feed.items,
        { kind: "question", requestId: event.requestId, questions: event.questions, since: Date.now() },
      ]);
    case "permissionCancelled":
      return replaceRequest(feed, event.requestId, { kind: "note", text: "The agent withdrew its request" });
    case "turnEnded":
      return endTurn(feed, event.isError, event.message);
    case "processExited":
      return withItems({ ...feed, runningTools: {}, turnStartedAt: null }, [
        ...feed.items,
        { kind: "note", text: event.message },
      ]);
    case "session":
    case "initialized":
    case "titleChanged":
      return feed;
  }
}

export function reduceLiveFeed(feed: ChatFeed, event: AgentEvent): ChatFeed {
  const reduced = reduceFeed(feed, event);
  if (event.kind !== "text") return reduced;
  const time = clockTime();
  const items = reduced.items.map((item) =>
    isAgentItem(item) && item.messageId === event.messageId && !item.time ? { ...item, time } : item,
  );
  return withItems(reduced, items);
}

export function withSentMessage(feed: ChatFeed, text: string): ChatFeed {
  return {
    ...feed,
    turnStartedAt: feed.turnStartedAt ?? Date.now(),
    items: [...feed.items, { kind: "user", text, time: clockTime() }],
  };
}

const DECISION_NOTES: Record<PermissionDecision, string> = {
  once: "You allowed it once",
  always: "You allowed it for this task",
  deny: "You denied it",
};

export function withDecision(feed: ChatFeed, requestId: string, decision: PermissionDecision): ChatFeed {
  const request = feed.items.find((item) => item.kind === "permission" && item.requestId === requestId);
  const target = request?.kind === "permission" ? `: ${request.action} ${request.target}` : "";
  return replaceRequest(feed, requestId, { kind: "note", text: `${DECISION_NOTES[decision]}${target}` });
}

export function withAnswers(feed: ChatFeed, requestId: string, answers: Record<string, string>): ChatFeed {
  const text = Object.entries(answers)
    .map(([question, answer]) => `${question}\n→ ${answer}`)
    .join("\n\n");
  return replaceRequest(feed, requestId, { kind: "user", text, time: clockTime() });
}

export function withStop(feed: ChatFeed): ChatFeed {
  return withItems(feed, [...feed.items, { kind: "note", text: "You stopped the agent" }]);
}

export function feedFromHistory(events: AgentEvent[]): ChatFeed {
  const replayed = events.reduce(reduceFeed, EMPTY_FEED);
  return { ...replayed, runningTools: {}, turnStartedAt: null };
}

export function runningActivity(feed: ChatFeed): string {
  return Object.values(feed.runningTools).at(-1) ?? "";
}
