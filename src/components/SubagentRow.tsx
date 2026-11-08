import { Bot } from "lucide-react";
import type { Subagent, SubagentStatus } from "../types";
import { Markdown } from "./Markdown";
import { cn } from "./ui";
import { useNow } from "./useNow";
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

export function elapsedSeconds(agent: SubagentView, now: number): number | null {
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
