import type { Settings } from "./api";
import { choiceOf } from "./preferences";

export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "bypassPermissions"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const PERMISSION_MODE_SETTING = "permissionMode";

interface PermissionModeInfo {
  label: string;
  shortLabel: string;
  description: string;
}

export const PERMISSION_MODE_INFO: Record<PermissionMode, PermissionModeInfo> = {
  default: {
    label: "Supervised",
    shortLabel: "Supervised",
    description: "Ask before commands and file changes.",
  },
  acceptEdits: {
    label: "Auto-accept edits",
    shortLabel: "Accept edits",
    description: "Auto-approve edits, ask before other actions.",
  },
  plan: {
    label: "Plan",
    shortLabel: "Plan",
    description: "Explore and propose a plan without changing anything.",
  },
  bypassPermissions: {
    label: "Full access",
    shortLabel: "Full access",
    description: "Allow commands and edits without prompts.",
  },
};

export function isFullAccess(mode: PermissionMode): boolean {
  return mode === "bypassPermissions";
}

export function defaultPermissionModeOf(settings: Settings | null): PermissionMode {
  return choiceOf(PERMISSION_MODES, settings?.[PERMISSION_MODE_SETTING]);
}
