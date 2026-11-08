import { useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Eye,
  FilePlus,
  FolderTree,
  Globe,
  ListTodo,
  Search,
  SquarePen,
  SquareTerminal,
  Terminal,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import type { PermissionDecision, Step } from "../types";
import { useShortPaths } from "./projectPaths";
import { cn } from "./ui";

const VERB_ICONS: Record<string, LucideIcon> = {
  Ran: SquareTerminal,
  Read: Eye,
  Edited: SquarePen,
  Wrote: FilePlus,
  Searched: Search,
  Listed: FolderTree,
  Fetched: Globe,
  "Searched the web for": Globe,
  Started: Bot,
  Updated: ListTodo,
};

function verbIcon(verb: string): LucideIcon {
  return VERB_ICONS[verb] ?? Wrench;
}

const DECISION_BADGES: Record<PermissionDecision, string> = {
  once: "Allowed once",
  always: "Allowed for this task",
  deny: "Declined",
};

function DecisionBadge({ decision }: { decision: PermissionDecision }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border border-border px-1.5 py-px text-3xs text-muted-foreground",
        decision === "deny" && "text-error-foreground",
      )}
    >
      {DECISION_BADGES[decision]}
    </span>
  );
}

export function StepRow({ step, isLive }: { step: Step; isLive: boolean }) {
  const Icon = verbIcon(step.verb);
  const shortPaths = useShortPaths();
  return (
    <div className="flex min-h-6 min-w-0 items-center gap-2 text-xs leading-relaxed">
      <Icon aria-hidden className={cn("size-3.5 shrink-0 text-icon-muted", step.isFailed && "text-error")} />
      <span className={cn("min-w-0 flex-1 truncate text-muted-foreground", isLive && "live-tool-shine")}>
        <span className="text-foreground/80">{step.verb}</span> {shortPaths(step.detail)}
      </span>
      {step.decision && <DecisionBadge decision={step.decision} />}
      {step.isFailed && <X aria-label="Failed" className="size-3 shrink-0 text-error" />}
    </div>
  );
}

type ToolAction = readonly [verb: string, singular: string, plural: string];

const COMMAND: ToolAction = ["Ran", "command", "commands"];
const READ: ToolAction = ["Read", "file", "files"];
const CHANGE: ToolAction = ["Changed", "file", "files"];
const CODE_SEARCH: ToolAction = ["Searched code", "time", "times"];
const WEB_SEARCH: ToolAction = ["Searched the web", "time", "times"];
const OTHER_TOOL: ToolAction = ["Used", "tool", "tools"];

const VERB_ACTIONS: Record<string, ToolAction> = {
  Ran: COMMAND,
  Read: READ,
  Edited: CHANGE,
  Wrote: CHANGE,
  Searched: CODE_SEARCH,
  Fetched: WEB_SEARCH,
  "Searched the web for": WEB_SEARCH,
};

function actionLabel([verb, singular, plural]: ToolAction, count: number): string {
  return `${verb} ${count} ${count === 1 ? singular : plural}`;
}

function joinSentence(labels: string[]): string {
  const lowered = labels.map((label, index) => (index === 0 ? label : label[0].toLowerCase() + label.slice(1)));
  if (lowered.length < 3) return lowered.join(" and ");
  return `${lowered.slice(0, -1).join(", ")}, and ${lowered.at(-1)}`;
}

export function summarizeSteps(steps: Step[]): string {
  const counts = new Map<ToolAction, number>();
  for (const step of steps) {
    const action = VERB_ACTIONS[step.verb] ?? OTHER_TOOL;
    counts.set(action, (counts.get(action) ?? 0) + 1);
  }
  return joinSentence([...counts].map(([action, count]) => actionLabel(action, count)));
}

interface WorkGroupProps {
  steps: Step[];
  time: string;
  liveStepId: string | null;
}

export function WorkGroup({ steps, time, liveStepId }: WorkGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const liveStep = steps.find((step) => step.id === liveStepId);
  const hasFailure = steps.some((step) => step.isFailed);
  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  return (
    <div className="pb-3">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "group/tools flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-1 text-left text-sm",
          "text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-inset",
        )}
      >
        <Terminal aria-hidden strokeWidth={1.5} className={cn("size-3.5 shrink-0", hasFailure && "text-error")} />
        <span className="min-w-0 truncate">{summarizeSteps(steps)}</span>
        <Chevron aria-hidden className="size-3.5 shrink-0 opacity-70" />
        <span className="ms-auto shrink-0 text-xs text-muted-foreground/80 tabular-nums">{time}</span>
      </button>
      {isExpanded && (
        <div className="ms-2.5 mt-1 flex flex-col border-l border-border ps-3">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} isLive={step.id === liveStepId} />
          ))}
        </div>
      )}
      {!isExpanded && liveStep && (
        <div className="ms-2.5 mt-1 border-l border-border ps-3">
          <StepRow step={liveStep} isLive />
        </div>
      )}
    </div>
  );
}
