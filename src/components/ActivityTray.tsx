import { ChevronUp, PanelRight, SquareTerminal } from "lucide-react";
import type { ReactNode } from "react";
import type { RunningShell, Step } from "../types";
import { useShortPaths } from "./projectPaths";
import { AgentElapsed, AgentGlyph, AgentStack } from "./SubagentRow";
import { NEEDS_APPROVAL_LABEL } from "./SubagentsPanel";
import { cn, FOCUS_RING, ICON_BUTTON } from "./ui";
import { useNow } from "./useNow";
import { subagentTitle, type SubagentEntry } from "./useSubagentEntries";
import { formatDuration } from "./WorkingRow";

const MS_PER_SECOND = 1000;
const IDLE_ACTIVITY = "Thinking";
const COLLAPSE_TRANSITION = "grid transition-all duration-200 ease-out motion-reduce:transition-none";
const ROW = "flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 text-left";

interface ActivityTrayProps {
  agents: SubagentEntry[];
  shells: RunningShell[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onOpenAgent: (agentId: string | null) => void;
}

interface Activity {
  label: string;
  startedAt: number;
}

function stepActivity(step: Step | undefined): string {
  if (!step) return IDLE_ACTIVITY;
  return step.description || `${step.verb} ${step.detail}`;
}

function shellLabel(shell: RunningShell): string {
  return shell.description || shell.command;
}

function agentActivityTime(agent: SubagentEntry): number {
  return Date.parse(agent.lastActivityAt ?? agent.startedAt ?? "") || 0;
}

function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function countLabel(agents: number, commands: number): string {
  return [agents > 0 && countOf(agents, "agent"), commands > 0 && countOf(commands, "command")]
    .filter(Boolean)
    .join(" · ");
}

function latestActivity(activities: Activity[]): string {
  return activities.toSorted((left, right) => right.startedAt - left.startedAt)[0]?.label ?? "";
}

function ShellGlyph() {
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-card">
      <SquareTerminal aria-hidden className="size-3 text-muted-foreground" />
    </span>
  );
}

function AgentActivityRow({ agent, onOpen }: { agent: SubagentEntry; onOpen: () => void }) {
  const shortPaths = useShortPaths();
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(ROW, "h-8 cursor-pointer transition-colors hover:bg-accent/60", FOCUS_RING)}
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

function ShellActivityRow({ shell }: { shell: RunningShell }) {
  const now = useNow(true);
  const seconds = Math.max(0, Math.floor((now - shell.startedAt) / MS_PER_SECOND));

  return (
    <li className={cn(ROW, "py-1.5")}>
      <ShellGlyph />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="live-tool-shine truncate text-sm text-foreground">{shellLabel(shell)}</span>
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

function TraySection({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={label}>
      <div className="flex h-7 items-center justify-between pr-0.5 pl-2 text-xs text-muted-foreground">
        {label}
        {action}
      </div>
      <ul className="m-0 list-none p-0">{children}</ul>
    </section>
  );
}

export function ActivityTray(props: ActivityTrayProps) {
  const { agents, shells, isExpanded, onToggleExpanded, onOpenAgent } = props;
  const shortPaths = useShortPaths();
  const isVisible = agents.length > 0 || shells.length > 0;
  const summary = latestActivity([
    ...agents.map((agent) => ({
      label: `${subagentTitle(agent)} · ${shortPaths(stepActivity(agent.steps.at(-1)))}`,
      startedAt: agentActivityTime(agent),
    })),
    ...shells.map((shell) => ({ label: shellLabel(shell), startedAt: shell.startedAt })),
  ]);

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
          aria-label="Running work"
          className="rounded-t-2xl border border-b-0 border-(--composer-outline) bg-popover px-1.5 pt-1 pb-5"
        >
          <div
            inert={!isExpanded}
            className={cn(COLLAPSE_TRANSITION, isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr] opacity-0")}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="flex max-h-[40vh] flex-col gap-1 overflow-y-auto border-b border-border pb-1">
                {agents.length > 0 && (
                  <TraySection
                    label="Agents"
                    action={
                      <button
                        type="button"
                        className={ICON_BUTTON}
                        aria-label="Open subagents"
                        title="Open subagents"
                        onClick={() => onOpenAgent(null)}
                      >
                        <PanelRight />
                      </button>
                    }
                  >
                    {agents.map((agent) => (
                      <AgentActivityRow
                        key={agent.toolUseId}
                        agent={agent}
                        onOpen={() => onOpenAgent(agent.toolUseId)}
                      />
                    ))}
                  </TraySection>
                )}
                {shells.length > 0 && (
                  <TraySection label="Commands">
                    {shells.map((shell) => (
                      <ShellActivityRow key={shell.toolUseId} shell={shell} />
                    ))}
                  </TraySection>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={onToggleExpanded}
            className={cn(
              "flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-xs",
              "text-muted-foreground transition-colors hover:text-foreground",
              FOCUS_RING,
            )}
          >
            {agents.length > 0 ? (
              <AgentStack agentIds={agents.map((agent) => agent.toolUseId)} ringClassName="ring-popover" />
            ) : (
              <ShellGlyph />
            )}
            <span className="live-tool-shine min-w-0 flex-1 truncate">{summary}</span>
            <span className="shrink-0 tabular-nums">{countLabel(agents.length, shells.length)}</span>
            <ChevronUp
              aria-hidden
              className={cn(
                "size-3.5 shrink-0 transition-transform motion-reduce:transition-none",
                isExpanded && "rotate-180",
              )}
            />
          </button>
        </section>
      </div>
    </div>
  );
}
