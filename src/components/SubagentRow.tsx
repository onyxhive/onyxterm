import { useState } from "react";
import { Bot, ChevronDown, ChevronRight } from "lucide-react";
import type { Subagent, SubagentStatus } from "../types";
import { Markdown } from "./Markdown";
import { cn } from "./ui";
import { useNow } from "./useNow";
import { TIMELINE_ROW_CLASS, WorkLogLine } from "./WorkLog";
import { formatDuration } from "./WorkingRow";

const MS_PER_SECOND = 1000;

const STATUS_DOT: Record<SubagentStatus, string> = {
  running: "bg-info",
  completed: "bg-success",
  failed: "bg-error",
};

export const SUBAGENT_STATUS_LABEL: Record<SubagentStatus, string> = {
  running: "Running",
  completed: "Done",
  failed: "Failed",
};

export type SubagentView = Pick<Subagent, "agentType" | "description" | "status" | "lastTool" | "summary"> &
  Partial<Pick<Subagent, "startedAt" | "lastActivityAt">>;

export function AgentGlyph({ status }: { status: SubagentStatus }) {
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      <Bot aria-hidden className="size-4 text-muted-foreground" />
      <span
        aria-hidden="true"
        className={cn(
          "absolute -right-1 -bottom-1 size-2 rounded-full border-2 border-background",
          STATUS_DOT[status],
          status === "running" && "animate-status-pulse",
        )}
      />
    </span>
  );
}

function elapsedSeconds(agent: SubagentView, now: number): number | null {
  if (!agent.startedAt) return null;
  const end = agent.status === "running" || !agent.lastActivityAt ? now : Date.parse(agent.lastActivityAt);
  return Math.max(0, Math.floor((end - Date.parse(agent.startedAt)) / MS_PER_SECOND));
}

export function AgentElapsed({ agent }: { agent: SubagentView }) {
  const now = useNow(agent.status === "running");
  const seconds = elapsedSeconds(agent, now);
  if (seconds === null) return null;
  return <span className="tabular-nums">{formatDuration(seconds)}</span>;
}

export function SubagentDetails({ agent, className }: { agent: SubagentView; className?: string }) {
  if (!agent.lastTool && !agent.summary) {
    return <p className={cn("text-xs text-muted-foreground", className)}>No activity yet</p>;
  }
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {agent.lastTool && (
        <p className="flex min-w-0 items-baseline gap-1.5 text-xs text-muted-foreground">
          <span className="shrink-0">Last tool</span>
          <code className="min-w-0 truncate font-mono text-2xs text-foreground/80" title={agent.lastTool}>
            {agent.lastTool}
          </code>
        </p>
      )}
      {agent.summary && <Markdown source={agent.summary} className="text-xs text-foreground/80" />}
    </div>
  );
}

export function SubagentRow({ agent }: { agent: SubagentView }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const Chevron = isExpanded ? ChevronDown : ChevronRight;
  const isRunning = agent.status === "running";
  return (
    <div className="pb-2">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          TIMELINE_ROW_CLASS,
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
          "focus-visible:ring-inset",
        )}
      >
        <WorkLogLine
          icon={<AgentGlyph status={agent.status} />}
          label={
            <span className="flex min-w-0 items-center gap-1 group-hover/timeline-row:text-foreground">
              <span className="shrink-0 text-foreground/80">{agent.agentType}</span>
              <span className="min-w-0 truncate">{agent.description}</span>
              <Chevron className="size-3.5 shrink-0" />
            </span>
          }
          trailing={
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <span
                className={cn(
                  isRunning && "live-tool-shine",
                  agent.status === "failed" && "text-error-foreground",
                )}
              >
                {SUBAGENT_STATUS_LABEL[agent.status]}
              </span>
              <AgentElapsed agent={agent} />
            </span>
          }
        />
      </button>
      {isExpanded && <SubagentDetails agent={agent} className="ms-7.5 mt-1 mb-1 border-l border-border ps-3" />}
    </div>
  );
}
