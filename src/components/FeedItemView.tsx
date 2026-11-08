import { useState, type ReactNode } from "react";
import { CircleStop } from "lucide-react";
import remarkGfm from "remark-gfm";
import { remarkMentions } from "../remarkMentions";
import type { FeedItem, PermissionDecision } from "../types";
import { ApprovalRow } from "./ApprovalRow";
import { CopyButton } from "./CopyButton";
import { Markdown } from "./Markdown";
import { QuestionRow } from "./QuestionDrawer";
import { cn } from "./ui";
import { WorkGroup } from "./WorkLog";

export interface FeedActions {
  onDecide: (requestId: string, decision: PermissionDecision) => void;
}

interface FeedItemViewProps {
  item: FeedItem;
  liveStepId: string | null;
  isTurnReply: boolean;
  actions: FeedActions;
}

type AgentItem = Extract<FeedItem, { kind: "agent" }>;

const MAX_COLLAPSED_USER_MESSAGE_LINES = 8;
const MAX_COLLAPSED_USER_MESSAGE_LENGTH = 600;
const COLLAPSED_USER_MESSAGE_FADE_MASK = "linear-gradient(to bottom, black calc(100% - 1.75rem), transparent)";
const COPY_MESSAGE_LABEL = "Copy message";
const USER_MESSAGE_PLUGINS = [remarkGfm, remarkMentions];

const ACTIONS_REVEAL = cn(
  "items-center text-xs tabular-nums opacity-0 transition-opacity duration-200 pointer-coarse:opacity-100",
  "focus-within:opacity-100",
);

const GHOST_MUTED_XS_BUTTON = cn(
  "-ml-1 inline-flex h-6 shrink-0 cursor-pointer items-center justify-center rounded-(--control-radius) border",
  "border-transparent px-[calc(--spacing(2)-1px)] text-xs font-medium text-muted-foreground outline-none",
  "hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
);

function shouldCollapseUserMessage(text: string): boolean {
  return (
    text.length > MAX_COLLAPSED_USER_MESSAGE_LENGTH || text.split("\n").length > MAX_COLLAPSED_USER_MESSAGE_LINES
  );
}

function Timestamp({ time }: { time: string }) {
  if (!time) return null;
  return <p className="text-xs text-muted-foreground tabular-nums">{time}</p>;
}

function UserMessageBody({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const canCollapse = shouldCollapseUserMessage(text);
  const isCollapsed = canCollapse && !isExpanded;
  const fade = isCollapsed
    ? { WebkitMaskImage: COLLAPSED_USER_MESSAGE_FADE_MASK, maskImage: COLLAPSED_USER_MESSAGE_FADE_MASK }
    : undefined;
  return (
    <div>
      <div className={cn("relative", isCollapsed && "max-h-44 overflow-hidden")} style={fade}>
        <Markdown
          source={text}
          className="chat-markdown-line-breaks text-foreground"
          remarkPlugins={USER_MESSAGE_PLUGINS}
        />
      </div>
      {canCollapse && (
        <div className="mt-1.5 flex items-center justify-end gap-2">
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded(!isExpanded)}
            className={GHOST_MUTED_XS_BUTTON}
          >
            {isExpanded ? "Show less" : "Show full message"}
          </button>
        </div>
      )}
    </div>
  );
}

function UserMessage({ text, time }: { text: string; time: string }) {
  return (
    <div className="group flex flex-col items-end gap-1 pb-4">
      <div className="relative max-w-[80%] min-w-0 rounded-2xl bg-message p-3 text-message-foreground">
        <h3 className="sr-only">You</h3>
        <UserMessageBody text={text} />
      </div>
      <div className={cn("flex w-full max-w-[80%] justify-end pe-1 group-hover:opacity-100", ACTIONS_REVEAL)}>
        <div className="flex shrink-0 items-center justify-end gap-x-2 gap-y-0.5">
          <Timestamp time={time} />
          <div className="flex items-center gap-0.5">
            <CopyButton text={text} label={COPY_MESSAGE_LABEL} variant="message" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AssistantMessageMeta({ item }: { item: AgentItem }) {
  return (
    <div className={cn("mt-1.5 flex gap-2 group-hover/assistant:opacity-100", ACTIONS_REVEAL)}>
      <CopyButton text={item.markdown} label={COPY_MESSAGE_LABEL} variant="message" />
      <Timestamp time={item.time} />
    </div>
  );
}

function AssistantMessage({ item, isTurnReply }: { item: AgentItem; isTurnReply: boolean }) {
  const showsMeta = isTurnReply && item.isFinal;
  return (
    <div className={cn("group/assistant", showsMeta ? "pb-4" : "pb-2")}>
      <div className="relative min-w-0 px-1 py-0.5">
        <h3 className="sr-only">Agent</h3>
        <Markdown source={item.markdown} isStreaming={!item.isFinal} />
        {showsMeta && <AssistantMessageMeta item={item} />}
      </div>
    </div>
  );
}

function SystemDivider({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div role="note" className="flex items-center gap-3 pt-2 pb-4 text-xs text-muted-foreground">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <span className="flex max-w-[80%] min-w-0 items-center gap-1.5 truncate" title={title}>
        {children}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}

function InterruptedDivider() {
  return (
    <SystemDivider title="Run interrupted · Stopped by user">
      <CircleStop aria-hidden strokeWidth={1.5} className="size-3.5 shrink-0" />
      <span className="text-foreground/70">Run interrupted</span>
      <span aria-hidden="true">·</span>
      <span>Stopped by user</span>
    </SystemDivider>
  );
}

export function FeedItemView({ item, liveStepId, isTurnReply, actions }: FeedItemViewProps) {
  switch (item.kind) {
    case "user":
      return <UserMessage text={item.text} time={item.time} />;
    case "agent":
      return <AssistantMessage item={item} isTurnReply={isTurnReply} />;
    case "steps":
      return <WorkGroup steps={item.steps} time={item.time} liveStepId={liveStepId} />;
    case "note":
      return (
        <SystemDivider title={item.text}>
          <span className="truncate">{item.text}</span>
        </SystemDivider>
      );
    case "interrupted":
      return <InterruptedDivider />;
    case "permission":
      return <ApprovalRow request={item} onDecide={actions.onDecide} />;
    case "question":
      return <QuestionRow request={item} />;
    case "subagent":
      return null;
  }
}
