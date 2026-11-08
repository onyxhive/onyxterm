import { Check, Shield, ShieldCheck, ShieldEllipsis, ShieldOff, type LucideIcon } from "lucide-react";
import { isFullAccess, PERMISSION_MODE_INFO, PERMISSION_MODES, type PermissionMode } from "../permissionModes";
import { CONTROL_CLASS, POPUP_SIDE_CLASS, type PopupSide } from "./ComposerControls";
import { cn, MENU_ITEM, MENU_POPUP, MenuLabel } from "./ui";
import { usePopup } from "./usePopup";

export const PERMISSION_MODE_LOCKED = "Wait for this turn to finish or stop it to change the permission mode";

const MODE_ICONS: Record<PermissionMode, LucideIcon> = {
  default: Shield,
  acceptEdits: ShieldCheck,
  plan: ShieldEllipsis,
  bypassPermissions: ShieldOff,
};

const WARNING_TEXT = "text-warning-foreground!";

function toneOf(mode: PermissionMode): string | undefined {
  return isFullAccess(mode) ? WARNING_TEXT : undefined;
}

interface PermissionModePickerProps {
  mode: PermissionMode;
  onChange: (mode: PermissionMode) => void;
  side?: PopupSide;
  disabledReason?: string;
}

export function PermissionModePicker({ mode, onChange, side = "bottom", disabledReason }: PermissionModePickerProps) {
  const popup = usePopup();
  const CurrentIcon = MODE_ICONS[mode];
  const current = PERMISSION_MODE_INFO[mode];

  function choose(next: PermissionMode) {
    popup.close();
    if (next !== mode) onChange(next);
  }

  return (
    <div className="relative" ref={popup.rootRef} title={disabledReason ?? current.description}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={popup.isOpen}
        aria-label={`Permission mode: ${current.label}`}
        className={CONTROL_CLASS}
        disabled={disabledReason !== undefined}
        onClick={popup.toggle}
      >
        <CurrentIcon className={toneOf(mode)} />
        <span className={cn(toneOf(mode), "@max-[30rem]:hidden")}>{current.shortLabel}</span>
      </button>
      {popup.isOpen && (
        <div
          role="menu"
          aria-label="Permission mode"
          className={cn(MENU_POPUP, "absolute left-0 w-72", POPUP_SIDE_CLASS[side])}
        >
          <MenuLabel>Permissions</MenuLabel>
          {PERMISSION_MODES.map((candidate) => {
            const Icon = MODE_ICONS[candidate];
            const info = PERMISSION_MODE_INFO[candidate];
            const isSelected = candidate === mode;
            return (
              <button
                key={candidate}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                className={cn(MENU_ITEM, "items-start py-1.5")}
                onClick={() => choose(candidate)}
              >
                <Icon className={cn("mt-0.5", toneOf(candidate))} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("leading-5", toneOf(candidate))}>{info.label}</span>
                  <span className="text-xs leading-4 text-muted-foreground">{info.description}</span>
                </span>
                <Check className={cn("mt-0.5 size-3.5", !isSelected && "invisible")} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
