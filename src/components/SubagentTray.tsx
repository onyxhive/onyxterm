import { ChevronDown, PanelRight } from "lucide-react";
import type { Provider, Step } from "../types";
import { ProviderLogo } from "./ProviderLogo";
import { useShortPaths } from "./projectPaths";
import { AgentElapsed, AgentGlyph, AgentStack } from "./SubagentRow";
import { NEEDS_APPROVAL_LABEL } from "./SubagentsPanel";
import { cn, FOCUS_RING, ICON_BUTTON } from "./ui";
import { subagentTitle, type SubagentEntry } from "./useSubagentEntries";

const MAX_TRAY_ROWS = 3;
const IDLE_ACTIVITY = "Thinking";
const COLLAPSE_TRANSITION = "grid transition-all duration-200 ease-out motion-reduce:transition-none";

interface SubagentTrayProps {
  provider: Provider;
  agents: SubagentEntry[];
  isVisible: boolean;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenAgent: (agentId: string | null) => void;
}

function stepActivity(step: Step | undefined): string {
  if (!step) return IDLE_ACTIVITY;
  return step.description || `${step.verb} ${step.detail}`;
}

function countLabel(running: number, done: number): string {
  return [running > 0 && `${running} working`, done > 0 && `${done} done`].filter(Boolean).join(" · ");
}

function TrayRow({ agent, onOpen }: { agent: SubagentEntry; onOpen: () => void }) {
  const shortPaths = useShortPaths();
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex h-8 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-left transition-colors",
          "hover:bg-accent/60",
          FOCUS_RING,
        )}
      >
        <AgentGlyph agentId={agent.toolUseId} className="size-5" />
        <span className="max-w-[45%] shrink-0 truncate text-sm text-foreground">{subagentTitle(agent)}</span>
        <span className="live-tool-shine min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {shortPaths(stepActivity(agent.steps.at(-1)))}
        </span>
        {agent.needsApproval && (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-approval">
            <span aria-hidden="true" className="size-1.5 animate-status-pulse rounded-full bg-approval-dot" />
            {NEEDS_APPROVAL_LABEL}
          </span>
        )}
        <span className="shrink-0 text-xs text-muted-foreground">
          <AgentElapsed agent={agent} />
        </span>
      </button>
    </li>
  );
}

function MoreRow({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex h-7 w-full cursor-pointer items-center rounded-lg px-2 text-left text-xs text-muted-foreground",
          "tabular-nums transition-colors hover:bg-accent/60 hover:text-foreground",
          FOCUS_RING,
        )}
      >
        +{count} more
      </button>
    </li>
  );
}

export function SubagentTray(props: SubagentTrayProps) {
  const { provider, agents, isVisible, isCollapsed, onToggleCollapsed, onOpenAgent } = props;
  const running = agents.filter((agent) => agent.status === "running");
  const stacked = running.length > 0 ? running : agents;
  const hiddenCount = running.length - MAX_TRAY_ROWS;
  const doneCount = agents.length - running.length;

  return (
    <div
      inert={!isVisible}
      className={cn(
        "mx-auto w-full max-w-(--chat-content-max-width)",
        COLLAPSE_TRANSITION,
        isVisible ? "-mb-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <section
          aria-label="Subagents"
          className="rounded-t-2xl border border-b-0 border-(--composer-outline) bg-popover px-1.5 pt-1 pb-5"
        >
          <div className="flex h-8 items-center gap-1">
            <button
              type="button"
              aria-expanded={!isCollapsed}
              onClick={onToggleCollapsed}
              className={cn(
                "flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-xs",
                "text-muted-foreground transition-colors hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <ProviderLogo provider={provider} size={14} />
              {isCollapsed && (
                <AgentStack agentIds={stacked.map((agent) => agent.toolUseId)} ringClassName="ring-popover" />
              )}
              <span className="truncate tabular-nums">{countLabel(running.length, doneCount)}</span>
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-3.5 shrink-0 transition-transform motion-reduce:transition-none",
                  isCollapsed && "-rotate-90",
                )}
              />
            </button>
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label="Open subagents"
              title="Open subagents"
              onClick={() => onOpenAgent(null)}
            >
              <PanelRight />
            </button>
          </div>
          <div
            inert={isCollapsed}
            className={cn(COLLAPSE_TRANSITION, isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]")}
          >
            <ul className="m-0 min-h-0 list-none overflow-hidden p-0">
              {running.slice(0, MAX_TRAY_ROWS).map((agent) => (
                <TrayRow key={agent.toolUseId} agent={agent} onOpen={() => onOpenAgent(agent.toolUseId)} />
              ))}
              {hiddenCount > 0 && <MoreRow count={hiddenCount} onOpen={() => onOpenAgent(null)} />}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
