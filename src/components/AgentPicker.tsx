import { useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search, Star, Zap } from "lucide-react";
import { CLAUDE_COMMANDS } from "../agentOptions";
import { isFullAccess, PERMISSION_MODE_INFO, type PermissionMode } from "../permissionModes";
import {
  CONTROL_CLASS,
  EffortGlyph,
  POPUP_ALIGN_CLASS,
  POPUP_SIDE_CLASS,
  type AgentChoice,
  type ModelChoice,
  type PopupAlign,
  type PopupSide,
} from "./ComposerControls";
import { PermissionModeMenu } from "./PermissionModeMenu";
import { ProviderLogo } from "./ProviderLogo";
import { cn, Kbd, MENU_POPUP } from "./ui";
import { useFavoriteModels, type FavoriteModel } from "./useFavoriteModels";
import { usePopup } from "./usePopup";

interface FastMode {
  isEnabled: boolean;
  onChange: (isEnabled: boolean) => void;
}

interface AgentPickerProps {
  choice: AgentChoice;
  models: ModelChoice[];
  efforts: string[];
  permissionMode: PermissionMode;
  onChange: (update: Partial<AgentChoice>) => void;
  onPermissionModeChange: (mode: PermissionMode) => void;
  fastMode?: FastMode;
  side?: PopupSide;
  align?: PopupAlign;
  disabledReason?: string;
}

const FAVORITES_TAB = "favorites";
const CLAUDE_PROVIDER = "Claude Code";
const MAX_JUMP_SHORTCUTS = 9;
const EFFORT_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
};
const RAIL_BUTTON = cn(
  "relative flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground",
  "transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:bg-foreground/10",
  "focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
);
const PICKER_ROW = cn(
  "group flex h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none",
  "data-[active=true]:bg-accent",
);

function commandNameOf(command: string): string {
  return command.replace(/^claude-?/, "") || "claude";
}

function effortLabelOf(effort: string): string {
  return EFFORT_LABELS[effort] ?? effort.charAt(0).toUpperCase() + effort.slice(1);
}

function RailIndicator() {
  return <span aria-hidden="true" className="absolute top-1.5 -left-1 h-5 w-0.75 rounded-full bg-primary" />;
}

interface ProviderRailProps {
  tab: string;
  onTab: (tab: string) => void;
}

function ProviderRail({ tab, onTab }: ProviderRailProps) {
  return (
    <div role="tablist" aria-orientation="vertical" className="flex flex-col items-center gap-1 border-r border-border/70 p-1">
      <button
        type="button"
        role="tab"
        aria-selected={tab === FAVORITES_TAB}
        aria-label="Favorites"
        title="Favorites"
        className={RAIL_BUTTON}
        onClick={() => onTab(FAVORITES_TAB)}
      >
        {tab === FAVORITES_TAB && <RailIndicator />}
        <Star className="size-4 fill-current" />
      </button>
      <span aria-hidden="true" className="h-px w-6 bg-border" />
      {CLAUDE_COMMANDS.map((command) => (
        <button
          key={command}
          type="button"
          role="tab"
          aria-selected={tab === command}
          aria-label={command}
          title={command}
          className={cn(RAIL_BUTTON, "flex-col gap-0.5 size-auto h-10 w-8")}
          onClick={() => onTab(command)}
        >
          {tab === command && <RailIndicator />}
          <ProviderLogo provider={CLAUDE_PROVIDER} size={16} />
          <span className="max-w-8 truncate text-[9px] leading-none">{commandNameOf(command)}</span>
        </button>
      ))}
      <button
        type="button"
        role="tab"
        aria-selected={false}
        aria-label="Codex"
        title="Codex, coming next"
        disabled
        className={RAIL_BUTTON}
      >
        <ProviderLogo provider="Codex" size={16} />
      </button>
    </div>
  );
}

interface ModelRowProps {
  row: FavoriteModel;
  index: number;
  isActive: boolean;
  isSelected: boolean;
  isFavorite: boolean;
  onPick: () => void;
  onHighlight: () => void;
  onToggleFavorite: () => void;
}

function ModelRow(props: ModelRowProps) {
  const { row, index, isActive, isSelected, isFavorite, onPick, onHighlight, onToggleFavorite } = props;
  return (
    <li
      role="option"
      aria-selected={isSelected}
      data-active={isActive}
      title={row.command}
      className={PICKER_ROW}
      onMouseMove={() => !isActive && onHighlight()}
      onClick={onPick}
    >
      <ProviderLogo provider={CLAUDE_PROVIDER} size={14} />
      <span className="min-w-0 truncate">{row.label}</span>
      {isSelected && <Check aria-hidden className="size-3.5 shrink-0" />}
      <span className="ms-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          className={cn(
            "flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground",
            "hover:text-foreground",
            !isFavorite && "opacity-0 group-hover:opacity-100 group-data-[active=true]:opacity-100",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite();
          }}
        >
          <Star className={cn("size-3", isFavorite && "fill-current text-warning")} />
        </button>
        {index < MAX_JUMP_SHORTCUTS && <Kbd className="h-4.5 text-2xs">⌘{index + 1}</Kbd>}
      </span>
    </li>
  );
}

interface ReasoningColumnProps {
  modelLabel: string;
  efforts: string[];
  effort: string;
  onPick: (effort: string) => void;
}

function ReasoningColumn({ modelLabel, efforts, effort, onPick }: ReasoningColumnProps) {
  return (
    <div className="flex w-44 shrink-0 flex-col border-l border-border/70 p-1">
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
        <span className="font-medium text-muted-foreground">Reasoning</span>
        <span className="ms-auto min-w-0 truncate text-muted-foreground/70">{modelLabel}</span>
      </div>
      {efforts.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Not adjustable</p>}
      <div role="radiogroup" aria-label="Reasoning" className="flex flex-col gap-px">
        {efforts.map((level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={level === effort}
            className={cn(PICKER_ROW, "hover:bg-accent")}
            onClick={() => onPick(level)}
          >
            <span className="min-w-0 flex-1 truncate">{effortLabelOf(level)}</span>
            {level === effort && <Check aria-hidden className="size-3.5 shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function SpeedToggle({ isEnabled, onChange }: FastMode) {
  const segment = cn(
    "inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-muted-foreground",
    "transition-colors hover:text-foreground aria-checked:bg-card aria-checked:text-foreground aria-checked:shadow-xs",
  );
  return (
    <div role="radiogroup" aria-label="Speed" className="flex gap-0.5 rounded-lg bg-muted p-0.5">
      <button type="button" role="radio" aria-checked={!isEnabled} className={segment} onClick={() => onChange(false)}>
        Standard
      </button>
      <button type="button" role="radio" aria-checked={isEnabled} className={segment} onClick={() => onChange(true)}>
        <Zap className="size-3" />
        Fast
      </button>
    </div>
  );
}

function cycle(index: number, step: number, length: number): number {
  return (index + step + length) % length;
}

function jumpIndexOf(event: KeyboardEvent): number | null {
  if (!event.metaKey) return null;
  const digit = Number(event.key);
  return Number.isInteger(digit) && digit >= 1 && digit <= MAX_JUMP_SHORTCUTS ? digit - 1 : null;
}

interface PickerPanelProps extends AgentPickerProps {
  onClose: () => void;
}

function PickerPanel(props: PickerPanelProps) {
  const { choice, models, efforts, permissionMode, onChange, onPermissionModeChange, fastMode, onClose } = props;
  const [tab, setTab] = useState(choice.command);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const favorites = useFavoriteModels();

  const tabRows: FavoriteModel[] =
    tab === FAVORITES_TAB
      ? favorites.favorites
      : models.map((model) => ({ command: choice.command, model: model.value, label: model.label }));
  const rows = tabRows.filter((row) => row.label.toLowerCase().includes(query.trim().toLowerCase()));
  const active = Math.min(activeIndex, rows.length - 1);
  const modelLabel = models.find((model) => model.value === choice.model)?.label ?? choice.model;

  function pick(row: FavoriteModel | undefined) {
    if (!row) return;
    onChange({ provider: CLAUDE_PROVIDER, command: row.command, model: row.model });
    onClose();
  }

  function switchTab(next: string) {
    setTab(next);
    setActiveIndex(0);
    if (next !== FAVORITES_TAB) onChange({ provider: CLAUDE_PROVIDER, command: next });
  }

  function navigate(event: KeyboardEvent) {
    const jump = jumpIndexOf(event);
    const moves: Record<string, () => void> = {
      ArrowDown: () => setActiveIndex(cycle(active, 1, rows.length)),
      ArrowUp: () => setActiveIndex(cycle(active, -1, rows.length)),
      Enter: () => pick(rows[active]),
    };
    const move = jump !== null ? () => pick(rows[jump]) : moves[event.key];
    if (!move || rows.length === 0) return;
    event.preventDefault();
    move();
  }

  return (
    <div className="flex min-h-0 flex-col" onKeyDown={navigate}>
      <div className="flex min-h-0">
        <ProviderRail tab={tab} onTab={switchTab} />
        <div className="flex min-w-0 flex-1 flex-col">
          <label className="flex h-9 items-center gap-2 border-b border-border/70 px-3 text-muted-foreground">
            <Search className="size-3.5 shrink-0" />
            <input
              autoFocus
              value={query}
              placeholder="Search models…"
              aria-label="Search models"
              className={cn(
                "min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none",
                "placeholder:text-muted-foreground",
              )}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
            />
          </label>
          <ul
            role="listbox"
            aria-label="Models"
            className="flex max-h-64 min-h-32 flex-col gap-px overflow-y-auto p-1"
          >
            {rows.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">
                {tab === FAVORITES_TAB && !query ? "Star a model to keep it here." : "No matching models."}
              </li>
            )}
            {rows.map((row, index) => (
              <ModelRow
                key={`${row.command}:${row.model}`}
                row={row}
                index={index}
                isActive={index === active}
                isSelected={row.command === choice.command && row.model === choice.model}
                isFavorite={favorites.isFavorite(row)}
                onPick={() => pick(row)}
                onHighlight={() => setActiveIndex(index)}
                onToggleFavorite={() => favorites.toggle(row)}
              />
            ))}
          </ul>
        </div>
        <ReasoningColumn
          modelLabel={modelLabel}
          efforts={efforts}
          effort={choice.effort}
          onPick={(effort) => onChange({ effort })}
        />
      </div>
      <div className="flex items-center gap-2 border-t border-border/70 px-2 py-1.5">
        {fastMode && <SpeedToggle {...fastMode} />}
        <span className="ms-auto">
          <PermissionModeMenu mode={permissionMode} onPick={onPermissionModeChange} />
        </span>
      </div>
    </div>
  );
}

export function AgentPicker(props: AgentPickerProps) {
  const { choice, models, efforts, permissionMode } = props;
  const { side = "bottom", align = "start", disabledReason } = props;
  const popup = usePopup();
  const modelLabel = models.find((model) => model.value === choice.model)?.label ?? choice.model;
  const hasFullAccess = isFullAccess(permissionMode);
  const permissionLabel = PERMISSION_MODE_INFO[permissionMode].shortLabel;

  return (
    <div className="relative" ref={popup.rootRef} title={disabledReason}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={popup.isOpen}
        aria-label={`Agent: ${choice.command}, ${modelLabel}, ${choice.effort} effort, ${permissionLabel}`}
        className={CONTROL_CLASS}
        disabled={disabledReason !== undefined}
        onClick={popup.toggle}
      >
        <ProviderLogo provider={choice.provider} size={14} />
        <span className="max-w-36 truncate">{modelLabel}</span>
        {efforts.length > 0 && <EffortGlyph levels={efforts} current={choice.effort} />}
        <span className="font-normal text-muted-foreground @max-[30rem]:hidden">{commandNameOf(choice.command)}</span>
        <ChevronDown className="-me-1 size-3.5" />
        {hasFullAccess && (
          <span
            aria-hidden="true"
            title={permissionLabel}
            className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-warning ring-2 ring-card"
          />
        )}
      </button>
      {popup.isOpen && (
        <div
          role="dialog"
          aria-label="Choose the agent, model, reasoning and permissions"
          className={cn(
            MENU_POPUP,
            "absolute w-[36rem] max-w-[calc(100vw-2rem)] overflow-visible p-0",
            POPUP_SIDE_CLASS[side],
            POPUP_ALIGN_CLASS[align],
          )}
        >
          <PickerPanel {...props} onClose={popup.close} />
        </div>
      )}
    </div>
  );
}
