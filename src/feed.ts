import type { AgentEvent, ToolSummary } from "./agentEvents";
import { clockTime } from "./tasks";
import type { ChangedFile, FeedItem, ImageAttachment, PermissionDecision, Step } from "./types";

export interface ChatFeed {
  items: FeedItem[];
  runningTools: Record<string, string>;
  files: Record<string, ChangedFile>;
  turnStartedAt: number | null;
  decisions: Record<string, PermissionDecision>;
}

export const EMPTY_FEED: ChatFeed = { items: [], runningTools: {}, files: {}, turnStartedAt: null, decisions: {} };

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
const MAIN_AGENT_REQUESTER = "main agent";
const GROUP_PASSTHROUGH_KINDS = new Set<FeedItem["kind"]>(["permission", "subagent"]);

type AgentItem = Extract<FeedItem, { kind: "agent" }>;
type StepsItem = Extract<FeedItem, { kind: "steps" }>;
type SubagentItem = Extract<FeedItem, { kind: "subagent" }>;

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

function openGroupIndex(items: FeedItem[]): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const { kind } = items[index];
    if (kind === "steps") return index;
    if (!GROUP_PASSTHROUGH_KINDS.has(kind)) return -1;
  }
  return -1;
}

function groupWith(group: StepsItem, step: Step): StepsItem {
  const steps = [...group.steps, step];
  return { ...group, steps, files: changedFileCount(steps) };
}

function withGroupedStep(items: FeedItem[], step: Step): FeedItem[] {
  const at = openGroupIndex(items);
  if (at === -1) return [...items, { kind: "steps", steps: [step], files: changedFileCount([step]), time: "" }];
  return items.map((item, index) => (index === at && item.kind === "steps" ? groupWith(item, step) : item));
}

function withSubagentStep(items: FeedItem[], parentToolUseId: string, step: Step): FeedItem[] | null {
  const isOwnedBySubagent = items.some((item) => item.kind === "subagent" && item.toolUseId === parentToolUseId);
  if (!isOwnedBySubagent) return null;
  return items.map((item) =>
    item.kind === "subagent" && item.toolUseId === parentToolUseId ? { ...item, steps: [...item.steps, step] } : item,
  );
}

function isSubagentLaunch(items: FeedItem[], toolUseId: string): boolean {
  return items.some((item) => item.kind === "subagent" && item.toolUseId === toolUseId);
}

function withoutStep(items: FeedItem[], stepId: string): FeedItem[] {
  return items.flatMap((item): FeedItem[] => {
    if (item.kind !== "steps") return [item];
    const steps = item.steps.filter((step) => step.id !== stepId);
    if (steps.length === item.steps.length) return [item];
    return steps.length === 0 ? [] : [{ ...item, steps, files: changedFileCount(steps) }];
  });
}

function mapSteps(items: FeedItem[], change: (step: Step) => Step): FeedItem[] {
  return items.map((item) => {
    if (item.kind === "steps") return { ...item, steps: item.steps.map(change) };
    if (item.kind === "subagent") return { ...item, steps: item.steps.map(change) };
    return item;
  });
}

function startTool(feed: ChatFeed, event: Extract<AgentEvent, { kind: "toolStarted" }>): ChatFeed {
  const { toolUseId, parentToolUseId, summary } = event;
  const step: Step = {
    id: toolUseId,
    verb: summary.verb,
    detail: summary.detail,
    description: summary.description,
    isNested: parentToolUseId !== null,
    isFailed: false,
    decision: feed.decisions[toolUseId],
  };
  const files = withFile(feed.files, summary);
  const runningTools = { ...feed.runningTools, [toolUseId]: `${summary.verb} ${summary.detail}` };
  if (isSubagentLaunch(feed.items, toolUseId)) return { ...feed, files, runningTools };
  const nestedItems = parentToolUseId ? withSubagentStep(feed.items, parentToolUseId, step) : null;
  return { ...feed, files, runningTools, items: nestedItems ?? withGroupedStep(feed.items, step) };
}

function finishTool(feed: ChatFeed, toolUseId: string, isError: boolean): ChatFeed {
  const runningTools = { ...feed.runningTools };
  delete runningTools[toolUseId];
  if (!isError) return { ...feed, runningTools };
  const items = mapSteps(feed.items, (step) => (step.id === toolUseId ? { ...step, isFailed: true } : step));
  return { ...feed, runningTools, items };
}

function requesterOf(feed: ChatFeed, toolUseId: string | null): string {
  const owner = feed.items.find(
    (item) => item.kind === "subagent" && item.steps.some((step) => step.id === toolUseId),
  );
  return owner?.kind === "subagent" ? owner.agentType : MAIN_AGENT_REQUESTER;
}

function permissionItem(event: Extract<AgentEvent, { kind: "permissionRequested" }>, feed: ChatFeed): FeedItem {
  const { summary } = event;
  return {
    kind: "permission",
    requestId: event.requestId,
    toolUseId: event.toolUseId,
    requester: requesterOf(feed, event.toolUseId),
    action: PRESENT_TENSE[summary.verb] ?? "use",
    target: summary.filePath ?? summary.detail,
    isShell: summary.verb === SHELL_VERB,
    reason: event.reason,
    since: Date.now(),
  };
}

function startSubagent(feed: ChatFeed, event: Extract<AgentEvent, { kind: "subagentStarted" }>): ChatFeed {
  if (feed.items.some((item) => item.kind === "subagent" && item.toolUseId === event.toolUseId)) return feed;
  const created: SubagentItem = {
    kind: "subagent",
    toolUseId: event.toolUseId,
    agentType: event.agentType,
    description: event.description,
    status: "running",
    lastTool: null,
    summary: null,
    steps: [],
  };
  return withItems(feed, [...withoutStep(feed.items, event.toolUseId), created]);
}

function updateSubagent(feed: ChatFeed, toolUseId: string, change: (item: SubagentItem) => SubagentItem): ChatFeed {
  const items = feed.items.map((item) =>
    item.kind === "subagent" && item.toolUseId === toolUseId ? change(item) : item,
  );
  return withItems(feed, items);
}

function isRequest(item: FeedItem, requestId: string): boolean {
  return (item.kind === "permission" || item.kind === "question") && item.requestId === requestId;
}

function withoutRequest(feed: ChatFeed, requestId: string): ChatFeed {
  return withItems(feed, feed.items.filter((item) => !isRequest(item, requestId)));
}

function replaceRequest(feed: ChatFeed, requestId: string, replacement: FeedItem): ChatFeed {
  return withItems(feed, feed.items.map((item) => (isRequest(item, requestId) ? replacement : item)));
}

function endTurn(feed: ChatFeed, isError: boolean, message: string | null): ChatFeed {
  const settled = { ...feed, runningTools: {}, turnStartedAt: null };
  if (!isError || !message) return settled;
  return withItems(settled, [...settled.items, { kind: "note", text: `The turn failed: ${message}` }]);
}

export function reduceFeed(feed: ChatFeed, event: AgentEvent): ChatFeed {
  switch (event.kind) {
    case "userText":
      return withItems(feed, [...feed.items, { kind: "user", text: event.text, time: "", images: event.images }]);
    case "textDelta":
      return appendDelta(feed, event.messageId, event.index, event.text);
    case "text":
      return finalizeText(feed, event.messageId, event.text);
    case "toolStarted":
      return startTool(feed, event);
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
      return withoutRequest(feed, event.requestId);
    case "turnEnded":
      return endTurn(feed, event.isError, event.message);
    case "processExited":
      return withItems({ ...feed, runningTools: {}, turnStartedAt: null }, [
        ...feed.items,
        { kind: "note", text: event.message },
      ]);
    case "subagentStarted":
      return startSubagent(feed, event);
    case "subagentProgress":
      return updateSubagent(feed, event.toolUseId, (item) => ({ ...item, lastTool: event.lastTool ?? item.lastTool }));
    case "subagentFinished":
      return updateSubagent(feed, event.toolUseId, (item) => ({
        ...item,
        status: event.isError ? "failed" : "completed",
        summary: event.summary || item.summary,
      }));
    case "session":
    case "initialized":
    case "titleChanged":
      return feed;
  }
}

function stampToolGroup(feed: ChatFeed, toolUseId: string): ChatFeed {
  const time = clockTime();
  const items = feed.items.map((item) =>
    item.kind === "steps" && !item.time && item.steps.some((step) => step.id === toolUseId) ? { ...item, time } : item,
  );
  return withItems(feed, items);
}

export function reduceLiveFeed(feed: ChatFeed, event: AgentEvent): ChatFeed {
  const reduced = reduceFeed(feed, event);
  if (event.kind === "toolStarted") return stampToolGroup(reduced, event.toolUseId);
  if (event.kind !== "text") return reduced;
  const time = clockTime();
  const items = reduced.items.map((item) =>
    isAgentItem(item) && item.messageId === event.messageId && !item.time ? { ...item, time } : item,
  );
  return withItems(reduced, items);
}

export function withSentMessage(feed: ChatFeed, text: string, images: ImageAttachment[]): ChatFeed {
  return {
    ...feed,
    turnStartedAt: feed.turnStartedAt ?? Date.now(),
    items: [...feed.items, { kind: "user", text, time: clockTime(), images }],
  };
}

export function withDecision(feed: ChatFeed, requestId: string, decision: PermissionDecision): ChatFeed {
  const request = feed.items.find((item) => item.kind === "permission" && item.requestId === requestId);
  const remaining = withoutRequest(feed, requestId);
  if (request?.kind !== "permission" || !request.toolUseId) return remaining;
  const { toolUseId } = request;
  return {
    ...remaining,
    decisions: { ...remaining.decisions, [toolUseId]: decision },
    items: mapSteps(remaining.items, (step) => (step.id === toolUseId ? { ...step, decision } : step)),
  };
}

export function withAnswers(feed: ChatFeed, requestId: string, answers: Record<string, string>): ChatFeed {
  const text = Object.entries(answers)
    .map(([question, answer]) => `${question}\n→ ${answer}`)
    .join("\n\n");
  return replaceRequest(feed, requestId, { kind: "user", text, time: clockTime() });
}

export function withStop(feed: ChatFeed): ChatFeed {
  return withItems(feed, [...feed.items, { kind: "interrupted" }]);
}

export function feedFromHistory(events: AgentEvent[]): ChatFeed {
  const replayed = events.reduce(reduceFeed, EMPTY_FEED);
  return { ...replayed, runningTools: {}, turnStartedAt: null };
}

export function runningActivity(feed: ChatFeed): string {
  return Object.values(feed.runningTools).at(-1) ?? "";
}
