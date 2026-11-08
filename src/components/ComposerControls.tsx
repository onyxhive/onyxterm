import type { ReactNode } from "react";
import type { Provider } from "../types";
import { Check, ChevronDown, FolderGit2, Gauge, GitBranch, SquareTerminal } from "lucide-react";
import { CLAUDE_COMMANDS } from "../agentOptions";
import { ProviderLogo } from "./ProviderLogo";
import { cn, MENU_ITEM, MENU_POPUP, MenuLabel } from "./ui";
import { usePopup } from "./usePopup";

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

export type PopupSide = "top" | "bottom";

const POPUP_SIDE_CLASS: Record<PopupSide, string> = {
  top: "bottom-full mb-2",
  bottom: "top-full mt-2",
};

interface PickerPlacement {
  side?: PopupSide;
  disabledReason?: string;
}

interface ModelPickerProps extends PickerPlacement {
  choice: AgentChoice;
  models: ModelChoice[];
  onChange: (update: Partial<AgentChoice>) => void;
}

function OptionCheck({ isSelected }: { isSelected: boolean }) {
  return <Check className={cn("ms-auto size-3.5", !isSelected && "invisible")} />;
}

const MODEL_ROW = cn(
  "flex w-full shrink-0 cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground",
  "outline-none hover:bg-accent focus-visible:bg-accent aria-checked:bg-foreground/[0.06]",
);

function GroupLabel({ provider, children }: { provider: Provider; children: ReactNode }) {
  return (
    <div className="flex h-7 items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground">
      <ProviderLogo provider={provider} size={14} />
      {children}
    </div>
  );
}

export function ModelPicker({ choice, models, onChange, side = "bottom", disabledReason }: ModelPickerProps) {
  const popup = usePopup();
  const selectedModel = models.find((model) => model.value === choice.model);
  const commandName = choice.command.replace(/^claude-?/, "") || "claude";

  function choose(update: Partial<AgentChoice>) {
    onChange(update);
    if (update.model) popup.close();
  }

  return (
    <div className="relative" ref={popup.rootRef} title={disabledReason}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={popup.isOpen}
        aria-label={`Agent: ${choice.provider}, ${choice.command}, ${selectedModel?.label ?? choice.model}`}
        className={CONTROL_CLASS}
        disabled={disabledReason !== undefined}
        onClick={popup.toggle}
      >
        <ProviderLogo provider={choice.provider} size={15} />
        <span className="max-w-40 truncate">{selectedModel?.label ?? choice.model}</span>
        <span className="font-normal text-muted-foreground">{commandName}</span>
        <ChevronDown className="-me-1 size-3.5" />
      </button>
      {popup.isOpen && (
        <div
          role="dialog"
          aria-label="Choose the agent and model"
          className={cn(
            MENU_POPUP,
            "absolute left-0 grid w-[32rem] grid-cols-[12rem_minmax(0,1fr)] overflow-hidden p-0",
            POPUP_SIDE_CLASS[side],
          )}
        >
          <div className="flex flex-col gap-px border-r border-border/70 bg-muted/40 p-1">
            <GroupLabel provider="Claude Code">Claude Code</GroupLabel>
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
            <GroupLabel provider="Codex">Codex</GroupLabel>
            <button type="button" role="menuitemradio" aria-checked={false} className={MENU_ITEM} disabled>
              <SquareTerminal />
              <span className="truncate">codex</span>
              <span className="ms-auto text-2xs text-muted-foreground">{CODEX_COMING}</span>
            </button>
          </div>
          <div className="flex min-w-0 flex-col p-1">
            <div className="flex h-7 shrink-0 items-center px-2 text-xs font-medium text-muted-foreground">Model</div>
            <div className="flex max-h-72 flex-col gap-px overflow-y-auto">
              {models.map((model) => (
                <button
                  key={model.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={model.value === choice.model}
                  className={MODEL_ROW}
                  onClick={() => choose({ model: model.value })}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate leading-5">{model.label}</span>
                    {model.description && (
                      <span className="line-clamp-2 text-xs leading-4 text-muted-foreground">{model.description}</span>
                    )}
                  </span>
                  <span className="flex h-5 shrink-0 items-center">
                    <OptionCheck isSelected={model.value === choice.model} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface EffortPickerProps extends PickerPlacement {
  effort: string;
  levels: string[];
  onChange: (effort: string) => void;
}

export function EffortPicker({ effort, levels, onChange, side = "bottom", disabledReason }: EffortPickerProps) {
  const popup = usePopup();
  return (
    <div className="relative" ref={popup.rootRef} title={disabledReason}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={popup.isOpen}
        aria-label={`Effort: ${effort}`}
        className={CONTROL_CLASS}
        disabled={disabledReason !== undefined}
        onClick={popup.toggle}
      >
        <Gauge />
        <span className="capitalize">{effort}</span>
        <EffortGlyph levels={levels} current={effort} />
      </button>
      {popup.isOpen && (
        <div role="menu" aria-label="Effort" className={cn(MENU_POPUP, "absolute left-0 w-44", POPUP_SIDE_CLASS[side])}>
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

interface ChatWorkspaceControlsProps {
  worktreePath: string | null;
  branch: string | null;
}

export function ChatWorkspaceControls({ worktreePath, branch }: ChatWorkspaceControlsProps) {
  return (
    <>
      {worktreePath && (
        <StaticControl icon={<FolderGit2 />} title={`Worktree: ${worktreePath}`}>
          Worktree
        </StaticControl>
      )}
      {branch && (
        <StaticControl icon={<GitBranch />} title={`Branch: ${branch}`}>
          <span className="max-w-40 truncate">{branch}</span>
        </StaticControl>
      )}
    </>
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
