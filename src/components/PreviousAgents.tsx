import { useState } from "react";
import { Bot, ChevronDown } from "lucide-react";
import type { Subagent } from "../types";
import { useSubagents } from "../useGit";
import { DETAILS_ICON, DETAILS_LABEL, DETAILS_ROW } from "./detailsStyles";
import { AgentElapsed, AgentGlyph, SubagentDetails } from "./SubagentRow";
import { cn } from "./ui";

function failedCount(subagents: Subagent[]): number {
  return subagents.filter((subagent) => subagent.status === "failed").length;
}

function PreviousAgentRow({ agent }: { agent: Subagent }) {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <li>
      <button
        type="button"
        aria-expanded={isExpanded}
        title={`${agent.agentType}: ${agent.description}`}
        className={cn(DETAILS_ROW, "aria-expanded:bg-black/[0.035] dark:aria-expanded:bg-white/[0.08]")}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <AgentGlyph status={agent.status} />
        <span className="min-w-0 flex-1 truncate text-left text-sm leading-4 text-foreground/85">
          {agent.description}
        </span>
        <span
          className={cn(
            "shrink-0 text-2xs font-normal",
            agent.status === "failed" ? "text-error-foreground" : "text-muted-foreground",
          )}
        >
          <AgentElapsed agent={agent} />
        </span>
      </button>
      {isExpanded && (
        <div className="ms-[1.3rem] mb-1 border-l border-border ps-3 pe-2 pt-0.5">
          <p className="mb-1 text-2xs text-muted-foreground">{agent.agentType}</p>
          <SubagentDetails agent={agent} />
        </div>
      )}
    </li>
  );
}

export function PreviousAgents({ chatId }: { chatId: string }) {
  const { subagents } = useSubagents(chatId);
  const [isExpanded, setIsExpanded] = useState(true);
  if (subagents.length === 0) return null;
  const failed = failedCount(subagents);
  return (
    <div>
      <button
        type="button"
        aria-expanded={isExpanded}
        className={DETAILS_ROW}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Bot aria-hidden className={DETAILS_ICON} />
        <span className={cn(DETAILS_LABEL, "flex-1")}>Previous agents</span>
        {failed > 0 && <span className="shrink-0 text-xs font-normal text-error-foreground">{failed} failed</span>}
        {!isExpanded && (
          <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">{subagents.length}</span>
        )}
        <ChevronDown aria-hidden className={cn(DETAILS_ICON, "transition-transform", !isExpanded && "-rotate-90")} />
      </button>
      {isExpanded && (
        <ul className="m-0 max-h-[13.5rem] list-none overflow-y-auto overscroll-contain p-0">
          {[...subagents].reverse().map((agent) => (
            <PreviousAgentRow key={agent.toolUseId} agent={agent} />
          ))}
        </ul>
      )}
    </div>
  );
}
