import { Shield, ShieldCheck, ShieldEllipsis, ShieldHalf, ShieldOff, type LucideIcon } from "lucide-react";
import { isFullAccess, PERMISSION_MODE_INFO, PERMISSION_MODES, type PermissionMode } from "../permissionModes";
import { OptionCheck } from "./ComposerControls";
import { cn, MENU_ITEM, MenuLabel } from "./ui";

const MODE_ICONS: Record<PermissionMode, LucideIcon> = {
  default: Shield,
  acceptEdits: ShieldCheck,
  auto: ShieldHalf,
  plan: ShieldEllipsis,
  bypassPermissions: ShieldOff,
};

const WARNING_TEXT = "text-warning-foreground!";

function toneOf(mode: PermissionMode): string | undefined {
  return isFullAccess(mode) ? WARNING_TEXT : undefined;
}

interface PermissionModeOptionsProps {
  mode: PermissionMode;
  onPick: (mode: PermissionMode) => void;
}

export function PermissionModeOptions({ mode, onPick }: PermissionModeOptionsProps) {
  return (
    <div className="flex flex-col gap-px">
      <MenuLabel>Permissions</MenuLabel>
      {PERMISSION_MODES.map((candidate) => {
        const Icon = MODE_ICONS[candidate];
        const info = PERMISSION_MODE_INFO[candidate];
        return (
          <button
            key={candidate}
            type="button"
            role="menuitemradio"
            aria-checked={candidate === mode}
            title={info.description}
            className={MENU_ITEM}
            onClick={() => onPick(candidate)}
          >
            <Icon className={toneOf(candidate)} />
            <span className={cn("min-w-0 flex-1 truncate", toneOf(candidate))}>{info.shortLabel}</span>
            <OptionCheck isSelected={candidate === mode} />
          </button>
        );
      })}
    </div>
  );
}
