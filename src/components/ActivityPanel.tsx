import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AgentCardRow, type SubagentEntry } from "./AgentCardRow";
import { cn, FOCUS_RING } from "./ui";

function finishedLabel(agents: SubagentEntry[]): string {
  const failed = agents.filter((agent) => agent.status === "failed").length;
  const done = `${agents.length} done`;
  return failed > 0 ? `${done} · ${failed} failed` : done;
}

function FinishedAgents({ agents }: { agents: SubagentEntry[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  return (
    <>
      <li className="border-b border-border last:border-b-0">
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            "flex w-full cursor-pointer items-center gap-1.5 px-3.5 py-1.5 text-left text-xs text-muted-foreground",
            "tabular-nums transition-colors hover:bg-accent/60 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <Chevron aria-hidden className="size-3.5" />
          {finishedLabel(agents)}
        </button>
      </li>
      {isExpanded && agents.map((agent) => <AgentCardRow key={agent.toolUseId} agent={agent} />)}
    </>
  );
}

export function ActivityPanel({ agents }: { agents: SubagentEntry[] }) {
  if (agents.length === 0) return null;
  const running = agents.filter((agent) => agent.status === "running");
  const finished = agents.filter((agent) => agent.status !== "running");

  return (
    <section aria-label="Working now" className="shrink-0 px-5 pt-3">
      <ul
        className={cn(
          "mx-auto max-h-[40vh] w-full max-w-(--chat-content-max-width) overflow-y-auto rounded-xl border",
          "border-border bg-card",
        )}
      >
        {running.map((agent) => (
          <AgentCardRow key={agent.toolUseId} agent={agent} />
        ))}
        {finished.length > 0 && <FinishedAgents agents={finished} />}
      </ul>
    </section>
  );
}
