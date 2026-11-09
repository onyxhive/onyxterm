import { ChevronLeft } from "lucide-react";
import type { Task } from "../types";
import { Markdown } from "./Markdown";
import { ProjectRootsContext, projectRootsOf } from "./projectPaths";
import { AgentElapsed, AgentGlyph, elapsedSeconds, SUBAGENT_STATUS_LABEL } from "./SubagentRow";
import { cn, FOCUS_RING, ICON_BUTTON, SIDE_PANEL_TOOLBAR } from "./ui";
import { useNow } from "./useNow";
import { subagentTitle, useSubagentEntries, type SubagentEntry } from "./useSubagentEntries";
import { formatDuration } from "./WorkingRow";
import { StepRow } from "./WorkLog";

interface SubagentsPanelProps {
  task: Task;
  projectPath: string | null;
  agentId: string | null;
  onOpenAgent: (agentId: string | null) => void;
}

export const NEEDS_APPROVAL_LABEL = "Needs approval";

function rowStatus(agent: SubagentEntry): string {
  if (agent.needsApproval) return NEEDS_APPROVAL_LABEL;
  return SUBAGENT_STATUS_LABEL[agent.status];
}

function AgentListRow({ agent, onOpen }: { agent: SubagentEntry; onOpen: () => void }) {
  const isFailed = agent.status === "failed";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
          "hover:bg-accent/60",
          FOCUS_RING,
        )}
      >
        <AgentGlyph agentId={agent.toolUseId} className="size-7" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm text-foreground">{subagentTitle(agent)}</span>
          <span
            className={cn(
              "truncate text-xs text-muted-foreground",
              agent.status === "running" && !agent.needsApproval && "live-tool-shine",
              agent.needsApproval && "text-approval",
              isFailed && "text-error-foreground",
            )}
          >
            {rowStatus(agent)}
          </span>
        </span>
        <span className={cn("shrink-0 text-xs text-muted-foreground", isFailed && "text-error-foreground")}>
          <AgentElapsed agent={agent} />
        </span>
      </button>
    </li>
  );
}

interface AgentSectionProps {
  title: string;
  agents: SubagentEntry[];
  onOpenAgent: (agentId: string) => void;
}

function AgentSection({ title, agents, onOpenAgent }: AgentSectionProps) {
  if (agents.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-1 px-2 pt-3">
      <h3 className="px-2 text-xs font-medium text-muted-foreground tabular-nums">
        {title} · {agents.length}
      </h3>
      <ul className="m-0 flex list-none flex-col p-0">
        {agents.map((agent) => (
          <AgentListRow key={agent.toolUseId} agent={agent} onOpen={() => onOpenAgent(agent.toolUseId)} />
        ))}
      </ul>
    </section>
  );
}

function AgentList({ agents, onOpenAgent }: { agents: SubagentEntry[]; onOpenAgent: (agentId: string) => void }) {
  if (agents.length === 0) {
    return <p className="px-4 py-10 text-center text-xs text-muted-foreground">No subagents in this chat yet</p>;
  }
  const active = agents.filter((agent) => agent.status === "running");
  const done = agents.filter((agent) => agent.status !== "running");
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-3">
      <AgentSection title="Active" agents={active} onOpenAgent={onOpenAgent} />
      <AgentSection title="Done" agents={[...done].reverse()} onOpenAgent={onOpenAgent} />
    </div>
  );
}

function workedForLabel(agent: SubagentEntry, now: number): string {
  const seconds = elapsedSeconds(agent, now);
  if (seconds === null) return SUBAGENT_STATUS_LABEL[agent.status];
  const verb = agent.status === "running" ? "Working" : "Worked";
  return `${verb} for ${formatDuration(seconds)}`;
}

function AgentDetail({ agent }: { agent: SubagentEntry }) {
  const isRunning = agent.status === "running";
  const now = useNow(isRunning);
  const liveStepId = isRunning ? agent.steps.at(-1)?.id : undefined;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      <p
        className={cn(
          "border-b border-border py-3 text-sm text-muted-foreground tabular-nums",
          agent.status === "failed" && "text-error-foreground",
        )}
      >
        <span className={cn(isRunning && "live-tool-shine")}>{workedForLabel(agent, now)}</span>
      </p>
      {agent.steps.length === 0 && <p className="pt-3 text-xs text-muted-foreground">No activity yet</p>}
      {agent.steps.length > 0 && (
        <div className="flex flex-col pt-2">
          {agent.steps.map((step) => (
            <StepRow key={step.id} step={step} isLive={step.id === liveStepId} />
          ))}
        </div>
      )}
      {!isRunning && agent.summary && (
        <Markdown source={agent.summary} className="mt-3 border-t border-border pt-3 text-sm" />
      )}
    </div>
  );
}

export function SubagentsPanel({ task, projectPath, agentId, onOpenAgent }: SubagentsPanelProps) {
  const agents = useSubagentEntries(task);
  const opened = agents.find((agent) => agent.toolUseId === agentId) ?? null;

  return (
    <>
      {opened && (
        <header className={SIDE_PANEL_TOOLBAR}>
          <button
            type="button"
            className={ICON_BUTTON}
            aria-label="Back to subagents"
            title="Back to subagents"
            onClick={() => onOpenAgent(null)}
          >
            <ChevronLeft />
          </button>
          <AgentGlyph agentId={opened.toolUseId} className="size-5" />
          <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={subagentTitle(opened)}>
            {subagentTitle(opened)}
          </span>
          <span className="shrink-0 truncate text-xs text-muted-foreground">{opened.agentType}</span>
        </header>
      )}
      <ProjectRootsContext value={projectRootsOf(task, projectPath)}>
        {opened ? <AgentDetail agent={opened} /> : <AgentList agents={agents} onOpenAgent={onOpenAgent} />}
      </ProjectRootsContext>
    </>
  );
}
