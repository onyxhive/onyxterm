import { Compass, Feather, Flame, Leaf, Orbit, Rocket, Sparkles, Telescope, type LucideIcon } from "lucide-react";
import type { Subagent, SubagentStatus } from "../types";
import { cn } from "./ui";
import { useNow } from "./useNow";
import { formatDuration } from "./WorkingRow";

const MS_PER_SECOND = 1000;

export const SUBAGENT_STATUS_LABEL: Record<SubagentStatus, string> = {
  running: "Working",
  completed: "Done",
  failed: "Failed",
};

const AGENT_TONES = [
  "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  "bg-orange-500/15 text-orange-600 dark:text-orange-400",
];

const AGENT_ICONS: LucideIcon[] = [Sparkles, Rocket, Compass, Feather, Flame, Leaf, Telescope, Orbit];
const HASH_MULTIPLIER = 31;
const MAX_STACKED_AGENTS = 3;

export type SubagentView = Pick<Subagent, "agentType" | "description" | "status" | "lastTool" | "summary"> &
  Partial<Pick<Subagent, "startedAt" | "lastActivityAt">>;

function hashOf(agentId: string): number {
  let hash = 0;
  for (const char of agentId) hash = (hash * HASH_MULTIPLIER + char.charCodeAt(0)) >>> 0;
  return hash;
}

function identityOf(agentId: string): { tone: string; Icon: LucideIcon } {
  const hash = hashOf(agentId);
  return {
    tone: AGENT_TONES[hash % AGENT_TONES.length],
    Icon: AGENT_ICONS[Math.floor(hash / AGENT_TONES.length) % AGENT_ICONS.length],
  };
}

interface AgentGlyphProps {
  agentId: string;
  className?: string;
}

export function AgentGlyph({ agentId, className }: AgentGlyphProps) {
  const { tone, Icon } = identityOf(agentId);
  return (
    <span className={cn("relative inline-flex size-4 shrink-0 rounded-full bg-background", className)}>
      <span className={cn("inline-flex size-full items-center justify-center rounded-full", tone)}>
        <Icon aria-hidden className="size-[62%]" />
      </span>
    </span>
  );
}

interface AgentStackProps {
  agentIds: string[];
  ringClassName?: string;
}

export function AgentStack({ agentIds, ringClassName = "ring-background" }: AgentStackProps) {
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {agentIds.slice(0, MAX_STACKED_AGENTS).map((agentId) => (
        <AgentGlyph key={agentId} agentId={agentId} className={cn("size-5 ring-2", ringClassName)} />
      ))}
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
