import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Step, SubagentStatus } from "../types";
import { ProviderLogo } from "./ProviderLogo";
import { useShortPaths } from "./projectPaths";
import { elapsedSeconds, SUBAGENT_STATUS_LABEL, SubagentDetails, type SubagentView } from "./SubagentRow";
import { cn } from "./ui";
import { useNow } from "./useNow";
import { formatDuration } from "./WorkingRow";
import { StepRow } from "./WorkLog";

export type SubagentEntry = SubagentView & { toolUseId: string; steps: Step[]; needsApproval: boolean };

const MAX_STACKED_AVATARS = 3;

const STATUS_DOT: Record<SubagentStatus, string> = {
  running: "bg-success animate-status-pulse",
  completed: "bg-success",
  failed: "bg-error",
};

const STATUS_COUNT_WORDS: Record<SubagentStatus, string> = {
  running: "running",
  completed: "done",
  failed: "failed",
};

const STATUS_ORDER: SubagentStatus[] = ["running", "completed", "failed"];

function AgentAvatar({ status, className }: { status?: SubagentStatus; className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-card",
        className,
      )}
    >
      <ProviderLogo provider="Claude Code" size={12} />
      {status && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-background",
            STATUS_DOT[status],
          )}
        />
      )}
    </span>
  );
}

function statusSummary(agents: SubagentEntry[]): string {
  return STATUS_ORDER.map((status) => [status, agents.filter((agent) => agent.status === status).length] as const)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${STATUS_COUNT_WORDS[status]}`)
    .join(" · ");
}

function totalSeconds(agents: SubagentEntry[], now: number): number | null {
  const seconds = agents.map((agent) => elapsedSeconds(agent, now)).filter((value) => value !== null);
  return seconds.length > 0 ? Math.max(...seconds) : null;
}

const SHELL_VERB = "Ran";
const LEADING_CD = /^cd\s+\S+\s*&&\s*/;
const PATH_LIKE = /\S*\/\S*/g;

function shellStep(command: string): string {
  const words = command.replace(LEADING_CD, "").trim().split(/\s+/);
  const program = words[0] ?? command;
  const path = words.slice(1).join(" ").match(PATH_LIKE)?.at(-1);
  return path ? `${program} in ${path}` : program;
}

function humanStep(step: Step, isRunning: boolean): string {
  if (step.description) return step.description;
  if (step.verb !== SHELL_VERB) return `${step.verb} ${step.detail}`;
  return `${isRunning ? "Running" : SHELL_VERB} ${shellStep(step.detail)}`;
}

function activityLine(agent: SubagentEntry): string {
  const latest = agent.steps.at(-1);
  if (latest) return humanStep(latest, agent.status === "running");
  if (agent.status === "running") return `Running ${agent.lastTool ?? "…"}`;
  return agent.lastTool ?? SUBAGENT_STATUS_LABEL[agent.status];
}

function AgentCardRow({ agent }: { agent: SubagentEntry }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const now = useNow(agent.status === "running");
  const seconds = elapsedSeconds(agent, now);
  const shortPaths = useShortPaths();
  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
          "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
          "focus-visible:ring-inset",
        )}
      >
        <AgentAvatar status={agent.status} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm text-foreground">{agent.description || agent.agentType}</span>
          <span
            className={cn("truncate text-xs text-muted-foreground", agent.status === "running" && "live-tool-shine")}
          >
            {shortPaths(activityLine(agent))}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
          {agent.needsApproval && (
            <span className="inline-flex items-center gap-1.5 text-approval">
              <span aria-hidden="true" className="size-1.5 animate-status-pulse rounded-full bg-approval-dot" />
              Needs approval
            </span>
          )}
          <span className={cn(agent.status === "failed" && "text-error-foreground")}>
            {SUBAGENT_STATUS_LABEL[agent.status]}
          </span>
          {seconds !== null && <span>{formatDuration(seconds)}</span>}
          <Chevron aria-hidden className="size-3.5" />
        </span>
      </button>
      {isExpanded && (
        <div className="flex flex-col gap-2 px-3.5 pb-3 ps-12.5">
          <SubagentDetails agent={agent} />
          {agent.steps.length > 0 && (
            <div className="flex flex-col border-l border-border ps-3">
              {agent.steps.map((step) => (
                <StepRow key={step.id} step={step} isLive={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function SubagentGroup({ agents }: { agents: SubagentEntry[] }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isAnyRunning = agents.some((agent) => agent.status === "running");
  const now = useNow(isAnyRunning);
  const seconds = totalSeconds(agents, now);
  const Chevron = isExpanded ? ChevronDown : ChevronRight;
  const noun = agents.length === 1 ? "subagent" : "subagents";

  return (
    <div className="pb-4">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-md px-1 py-1 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-inset",
        )}
      >
        <span className="flex shrink-0 -space-x-2">
          {agents.slice(0, MAX_STACKED_AVATARS).map((agent) => (
            <AgentAvatar key={agent.toolUseId} className="ring-2 ring-background" />
          ))}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold text-foreground">
            {agents.length} {noun}
          </span>
          <span className="truncate text-xs text-muted-foreground">{statusSummary(agents)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
          {seconds !== null && formatDuration(seconds)}
          <Chevron aria-hidden className="size-3.5" />
        </span>
      </button>
      {isExpanded && (
        <ul className="mt-2 overflow-hidden rounded-xl border border-border bg-card">
          {agents.map((agent) => (
            <AgentCardRow key={agent.toolUseId} agent={agent} />
          ))}
        </ul>
      )}
    </div>
  );
}
