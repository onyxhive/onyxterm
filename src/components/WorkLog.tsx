import { useState, type ComponentProps, type ReactNode } from "react";
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
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Step } from "../types";
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

export function verbIcon(verb: string): LucideIcon {
  return VERB_ICONS[verb] ?? Wrench;
}

interface WorkLogLineProps {
  icon: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  isWrapping?: boolean;
}

export function WorkLogLine({ icon, label, trailing, isWrapping = false }: WorkLogLineProps) {
  return (
    <div
      className={cn(
        "flex min-h-6 min-w-0 gap-1.5 text-sm leading-relaxed",
        isWrapping ? "items-start" : "items-center",
      )}
    >
      <span className="flex size-6 shrink-0 items-center justify-center text-icon-muted">{icon}</span>
      <div className={cn("min-w-0 flex-1 text-secondary-label", !isWrapping && "truncate")}>{label}</div>
      {trailing}
    </div>
  );
}

export const TIMELINE_ROW_CLASS =
  "group/timeline-row relative w-full min-w-0 rounded-md px-0.5 py-0.5 text-left transition-colors";

export function WorkLogRow({
  icon,
  label,
  trailing,
  isWrapping,
  children,
  ...rowProps
}: WorkLogLineProps & Omit<ComponentProps<"div">, "className">) {
  return (
    <div {...rowProps} className={TIMELINE_ROW_CLASS}>
      <WorkLogLine icon={icon} label={label} trailing={trailing} isWrapping={isWrapping} />
      {children}
    </div>
  );
}

function StepRow({ step, isLive }: { step: Step; isLive: boolean }) {
  const Icon = verbIcon(step.verb);
  return (
    <WorkLogRow
      icon={<Icon className={cn("size-4", step.isFailed && "text-error")} strokeWidth={2} />}
      label={
        <span className={cn("block truncate", isLive && "live-tool-shine")}>
          <span className="text-foreground/80">{step.verb}</span> {step.detail}
        </span>
      }
      trailing={
        <span className="flex shrink-0 items-center gap-1.5">
          {step.isNested && (
            <span className="rounded-full border border-border/70 px-1.5 py-px text-3xs text-muted-foreground">
              subagent
            </span>
          )}
          {step.isFailed && <X aria-label="Failed" className="size-3 text-error" />}
        </span>
      }
    />
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
  liveStepId: string | null;
}

export function WorkGroup({ steps, liveStepId }: WorkGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const liveStep = steps.find((step) => step.id === liveStepId);
  const hasFailure = steps.some((step) => step.isFailed);
  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  return (
    <div className="pb-2">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          TIMELINE_ROW_CLASS,
          "cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-ring/70 focus-visible:ring-inset",
        )}
      >
        <WorkLogLine
          icon={<Wrench className={cn("size-4", hasFailure && "text-error")} strokeWidth={2} />}
          label={
            <span className="flex items-center gap-1 group-hover/timeline-row:text-foreground">
              {summarizeSteps(steps)}
              <Chevron className="size-3.5" />
            </span>
          }
        />
      </button>
      {isExpanded && (
        <div className="flex flex-col">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} isLive={step.id === liveStepId} />
          ))}
        </div>
      )}
      {!isExpanded && liveStep && <StepRow step={liveStep} isLive />}
    </div>
  );
}
