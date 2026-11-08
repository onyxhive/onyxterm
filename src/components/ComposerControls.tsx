import { useCallback, useRef, useState, type ReactNode } from "react";
import { Asterisk, Box, Check, ChevronDown, Gauge, SquareTerminal } from "lucide-react";
import { CLAUDE_COMMANDS } from "../agentOptions";
import type { Provider } from "../types";
import { cn, MENU_ITEM, MENU_POPUP, MenuLabel } from "./ui";
import { useDismiss } from "./useDismiss";

export interface ModelChoice {
  value: string;
  label: string;
  description: string;
}

export interface AgentChoice {
  provider: Provider;
  command: string;
  model: string;
  effort: string;
}

const CODEX_COMING = "Coming next";
const EFFORT_BAR_STEP = 4;
const EFFORT_GLYPH_HEIGHT = 14;
const EFFORT_BASELINE_INSET = 2;
const SPECIAL_EFFORTS = new Set(["max"]);

export const CONTROL_CLASS = cn(
  "relative inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap px-2",
  "rounded-(--control-radius) text-sm font-medium text-foreground/80 outline-none hover:bg-accent",
  "hover:text-foreground aria-expanded:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
  "focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-64",
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg:not([class*='text-'])]:text-muted-foreground",
);

const STATIC_CONTROL_CLASS = cn(
  "inline-flex h-7 shrink-0 items-center gap-1.5 px-2 text-xs whitespace-nowrap text-muted-foreground/80",
  "[&_svg]:size-3.5 [&_svg]:shrink-0",
);

export function ProviderIcon({ provider }: { provider: Provider }) {
  return provider === "Codex" ? <Box /> : <Asterisk className="text-(--provider-claude)" />;
}

function usePopup() {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(rootRef, isOpen, close);
  return { isOpen, rootRef, close, toggle: () => setIsOpen(!isOpen) };
}

export function EffortGlyph({ levels, current }: { levels: string[]; current: string }) {
  const ordinary = levels.filter((level) => !SPECIAL_EFFORTS.has(level));
  const filled = SPECIAL_EFFORTS.has(current) ? ordinary.length : ordinary.indexOf(current) + 1;
  if (ordinary.length < 2) return null;
  const width = EFFORT_BAR_STEP * ordinary.length - 2;
  const maxBar = EFFORT_GLYPH_HEIGHT - EFFORT_BASELINE_INSET;
  const step = Math.max(1, Math.round(maxBar / 2 / (ordinary.length - 1)));
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={EFFORT_GLYPH_HEIGHT}
      viewBox={`0 0 ${width} ${EFFORT_GLYPH_HEIGHT}`}
      style={{ width, height: EFFORT_GLYPH_HEIGHT }}
      className="shrink-0 text-current"
    >
      {ordinary.map((level, position) => {
        const barHeight = maxBar - (ordinary.length - 1 - position) * step;
        return (
          <rect
            key={level}
            x={position * EFFORT_BAR_STEP}
            y={maxBar - barHeight}
            width={2}
            height={barHeight}
            rx={1}
            fill="currentColor"
            opacity={position < filled ? 1 : 0.28}
          />
        );
      })}
    </svg>
  );
}

interface ModelPickerProps {
  choice: AgentChoice;
  models: ModelChoice[];
  onChange: (update: Partial<AgentChoice>) => void;
}

function OptionCheck({ isSelected }: { isSelected: boolean }) {
  return <Check className={cn("ms-auto size-3.5", !isSelected && "invisible")} />;
}

export function ModelPicker({ choice, models, onChange }: ModelPickerProps) {
  const popup = usePopup();
  const selectedModel = models.find((model) => model.value === choice.model);
  const commandName = choice.command.replace(/^claude-?/, "") || "claude";

  function choose(update: Partial<AgentChoice>) {
    onChange(update);
    if (update.model) popup.close();
  }

  return (
    <div className="relative" ref={popup.rootRef}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={popup.isOpen}
        aria-label={`Agent: ${choice.provider}, ${choice.command}, ${selectedModel?.label ?? choice.model}`}
        className={CONTROL_CLASS}
        onClick={popup.toggle}
      >
        <ProviderIcon provider={choice.provider} />
        <span className="max-w-40 truncate">{selectedModel?.label ?? choice.model}</span>
        <span className="font-normal text-muted-foreground">{commandName}</span>
        <ChevronDown className="-me-1 size-3.5" />
      </button>
      {popup.isOpen && (
        <div
          role="dialog"
          aria-label="Choose the agent and model"
          className={cn(MENU_POPUP, "absolute top-full left-0 mt-2 flex w-[30rem] overflow-hidden p-0")}
        >
          <div className="flex w-48 shrink-0 flex-col border-r border-border/70 bg-muted/40 p-1">
            <MenuLabel>Claude Code</MenuLabel>
            {CLAUDE_COMMANDS.map((command) => {
              const isSelected = choice.provider === "Claude Code" && choice.command === command;
              return (
                <button
                  key={command}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  className={MENU_ITEM}
                  onClick={() => choose({ provider: "Claude Code", command })}
                >
                  <SquareTerminal />
                  <span className="truncate">{command}</span>
                  <OptionCheck isSelected={isSelected} />
                </button>
              );
            })}
            <MenuLabel>Codex</MenuLabel>
            <button type="button" role="menuitemradio" aria-checked={false} className={MENU_ITEM} disabled>
              <Box />
              <span className="truncate">codex</span>
              <span className="ms-auto text-2xs text-muted-foreground">{CODEX_COMING}</span>
            </button>
          </div>
          <div className="flex max-h-80 min-w-0 flex-1 flex-col overflow-y-auto p-1">
            <MenuLabel>Model</MenuLabel>
            {models.map((model) => (
              <button
                key={model.value}
                type="button"
                role="menuitemradio"
                aria-checked={model.value === choice.model}
                className={cn(MENU_ITEM, "items-start py-1.5")}
                onClick={() => choose({ model: model.value })}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{model.label}</span>
                  {model.description && (
                    <span className="text-xs text-pretty text-muted-foreground">{model.description}</span>
                  )}
                </span>
                <OptionCheck isSelected={model.value === choice.model} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface EffortPickerProps {
  effort: string;
  levels: string[];
  onChange: (effort: string) => void;
}

export function EffortPicker({ effort, levels, onChange }: EffortPickerProps) {
  const popup = usePopup();
  return (
    <div className="relative" ref={popup.rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={popup.isOpen}
        aria-label={`Effort: ${effort}`}
        className={CONTROL_CLASS}
        onClick={popup.toggle}
      >
        <Gauge />
        <span className="capitalize">{effort}</span>
        <EffortGlyph levels={levels} current={effort} />
      </button>
      {popup.isOpen && (
        <div role="menu" aria-label="Effort" className={cn(MENU_POPUP, "absolute top-full left-0 mt-2 w-44")}>
          <MenuLabel>Effort</MenuLabel>
          {levels.map((level) => (
            <button
              key={level}
              type="button"
              role="menuitemradio"
              aria-checked={level === effort}
              className={cn(MENU_ITEM, "capitalize")}
              onClick={() => {
                onChange(level);
                popup.close();
              }}
            >
              {level}
              <OptionCheck isSelected={level === effort} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function StaticControl({ icon, children, title }: { icon: ReactNode; children: ReactNode; title: string }) {
  return (
    <span className={STATIC_CONTROL_CLASS} title={title}>
      {icon}
      {children}
    </span>
  );
}
