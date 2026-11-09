import { useState } from "react";
import { ChevronDown, ChevronRight, SquareTerminal } from "lucide-react";
import type { RunningShell } from "../types";
import { AgentCardRow, type SubagentEntry } from "./AgentCardRow";
import { cn, FOCUS_RING } from "./ui";
import { useNow } from "./useNow";
import { formatDuration } from "./WorkingRow";

const MS_PER_SECOND = 1000;

interface ActivityPanelProps {
  agents: SubagentEntry[];
  shells: RunningShell[];
}

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

function ShellRow({ shell }: { shell: RunningShell }) {
  const now = useNow(true);
  const seconds = Math.max(0, Math.floor((now - shell.startedAt) / MS_PER_SECOND));

  return (
    <li className="flex min-w-0 items-center gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0">
      <span
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-card"
      >
        <SquareTerminal aria-hidden className="size-3.5 text-muted-foreground" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="live-tool-shine truncate text-sm text-foreground">{shell.description || shell.command}</span>
        {shell.description && (
          <code className="truncate font-mono text-xs text-muted-foreground" title={shell.command}>
            {shell.command}
          </code>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
        <span>{shell.isBackground ? "In background" : "Running"}</span>
        <span>{formatDuration(seconds)}</span>
      </span>
    </li>
  );
}

export function ActivityPanel({ agents, shells }: ActivityPanelProps) {
  if (agents.length === 0 && shells.length === 0) return null;
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
        {shells.map((shell) => (
          <ShellRow key={shell.toolUseId} shell={shell} />
        ))}
        {finished.length > 0 && <FinishedAgents agents={finished} />}
      </ul>
    </section>
  );
}
