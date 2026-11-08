import { ChevronDown } from "lucide-react";
import { isFullAccess, PERMISSION_MODE_INFO, type PermissionMode } from "../permissionModes";
import {
  CommandOptions,
  CONTROL_CLASS,
  EffortGlyph,
  ModelOptions,
  POPUP_ALIGN_CLASS,
  POPUP_SIDE_CLASS,
  type AgentChoice,
  type ModelChoice,
  type PopupAlign,
  type PopupSide,
} from "./ComposerControls";
import { PermissionModeOptions } from "./PermissionModeOptions";
import { ProviderLogo } from "./ProviderLogo";
import { cn, MENU_POPUP, MenuLabel, MenuSeparator } from "./ui";
import { usePopup } from "./usePopup";

interface AgentPickerProps {
  choice: AgentChoice;
  models: ModelChoice[];
  efforts: string[];
  permissionMode: PermissionMode;
  onChange: (update: Partial<AgentChoice>) => void;
  onPermissionModeChange: (mode: PermissionMode) => void;
  side?: PopupSide;
  align?: PopupAlign;
  disabledReason?: string;
}

function commandNameOf(command: string): string {
  return command.replace(/^claude-?/, "") || "claude";
}

interface EffortOptionsProps {
  efforts: string[];
  effort: string;
  onPick: (effort: string) => void;
}

function EffortOptions({ efforts, effort, onPick }: EffortOptionsProps) {
  return (
    <div className="border-t border-border/70 px-1 pt-1">
      <MenuLabel>Effort</MenuLabel>
      <div role="radiogroup" aria-label="Effort" className="flex gap-0.5 rounded-lg bg-muted p-0.5">
        {efforts.map((level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={level === effort}
            className={cn(
              "h-6 min-w-0 flex-1 cursor-pointer rounded-md px-1.5 text-xs text-muted-foreground capitalize",
              "transition-colors hover:text-foreground aria-checked:bg-card aria-checked:text-foreground",
              "aria-checked:shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
            onClick={() => onPick(level)}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AgentPicker(props: AgentPickerProps) {
  const { choice, models, efforts, permissionMode, onChange, onPermissionModeChange } = props;
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
          aria-label="Choose the agent, model, effort and permissions"
          className={cn(
            MENU_POPUP,
            "absolute grid w-[34rem] grid-cols-[12rem_minmax(0,1fr)] overflow-hidden p-0",
            POPUP_SIDE_CLASS[side],
            POPUP_ALIGN_CLASS[align],
          )}
        >
          <div className="border-r border-border/70 bg-muted/40 p-1">
            <CommandOptions choice={choice} onChoose={onChange} />
            <MenuSeparator />
            <PermissionModeOptions mode={permissionMode} onPick={onPermissionModeChange} />
          </div>
          <div className="flex min-w-0 flex-col pb-1">
            <div className="flex min-h-0 flex-col p-1">
              <ModelOptions choice={choice} models={models} onChoose={onChange} />
            </div>
            {efforts.length > 0 && (
              <EffortOptions efforts={efforts} effort={choice.effort} onPick={(effort) => onChange({ effort })} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
