import type { Settings } from "./api";

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

export const DEFAULT_PERMISSION_MODE: PermissionMode = "acceptEdits";

export function defaultPermissionModeOf(settings: Settings | null): PermissionMode {
  return PERMISSION_MODES.find((mode) => mode === settings?.[PERMISSION_MODE_SETTING]) ?? DEFAULT_PERMISSION_MODE;
}
