import { ChevronUp, Shield, ShieldCheck, ShieldEllipsis, ShieldHalf, ShieldOff, type LucideIcon } from "lucide-react";
import { isFullAccess, PERMISSION_MODE_INFO, PERMISSION_MODES, type PermissionMode } from "../permissionModes";
import { cn, MENU_POPUP } from "./ui";
import { usePopup } from "./usePopup";

const MODE_ICONS: Record<PermissionMode, LucideIcon> = {
  default: Shield,
  acceptEdits: ShieldCheck,
  auto: ShieldHalf,
  plan: ShieldEllipsis,
  bypassPermissions: ShieldOff,
};

interface PermissionModeMenuProps {
  mode: PermissionMode;
  onPick: (mode: PermissionMode) => void;
}

function ModeSegments({ mode, onPick }: PermissionModeMenuProps) {
  return (
    <div role="radiogroup" aria-label="Permissions" className="flex gap-0.5 rounded-lg bg-muted p-0.5">
      {PERMISSION_MODES.map((candidate) => {
        const Icon = MODE_ICONS[candidate];
        return (
          <button
            key={candidate}
            type="button"
            role="radio"
            aria-checked={candidate === mode}
            aria-label={PERMISSION_MODE_INFO[candidate].shortLabel}
            title={PERMISSION_MODE_INFO[candidate].shortLabel}
            className={cn(
              "flex h-7 flex-1 cursor-pointer items-center justify-center rounded-md text-muted-foreground",
              "transition-colors hover:text-foreground aria-checked:bg-card aria-checked:text-foreground",
              "aria-checked:shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              isFullAccess(candidate) && "aria-checked:text-warning-foreground",
            )}
            onClick={() => onPick(candidate)}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}

export function PermissionModeMenu({ mode, onPick }: PermissionModeMenuProps) {
  const popup = usePopup();
  const info = PERMISSION_MODE_INFO[mode];
  const Icon = MODE_ICONS[mode];

  return (
    <div ref={popup.rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={popup.isOpen}
        aria-label={`Permissions: ${info.shortLabel}`}
        className={cn(
          "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground",
          "hover:bg-accent hover:text-foreground aria-expanded:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
          "focus-visible:outline-none",
          isFullAccess(mode) && "text-warning-foreground",
        )}
        onClick={popup.toggle}
      >
        <Icon className="size-3.5" />
        {info.shortLabel}
        <ChevronUp className="size-3" />
      </button>
      {popup.isOpen && (
        <div
          role="dialog"
          aria-label="Permissions"
          className={cn(MENU_POPUP, "absolute right-0 bottom-full mb-1.5 w-64 p-2")}
        >
          <ModeSegments mode={mode} onPick={onPick} />
          <p className={cn("px-0.5 pt-2 text-sm font-medium", isFullAccess(mode) && "text-warning-foreground")}>
            {info.label}
          </p>
          <p className="px-0.5 pt-0.5 text-xs text-muted-foreground">{info.description}</p>
        </div>
      )}
    </div>
  );
}
