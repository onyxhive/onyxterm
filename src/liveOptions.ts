import { isFullAccess, type PermissionMode } from "./permissionModes";

export interface OptionChange {
  command?: string;
  effort?: string;
  permissionMode?: PermissionMode;
}

export type OptionLock = (change: OptionChange) => string | undefined;

export const RESPAWN_LOCKED = "Wait for this turn to finish or stop it: this change restarts the agent";

const LIVE_EFFORT_LEVELS = new Set(["low", "medium", "high", "xhigh"]);

export function needsRespawn(current: Required<OptionChange>, change: OptionChange): boolean {
  const { command, effort, permissionMode } = change;
  const changesCommand = command !== undefined && command !== current.command;
  const needsEffortFlag = effort !== undefined && effort !== current.effort && !LIVE_EFFORT_LEVELS.has(effort);
  const entersFullAccess =
    permissionMode !== undefined && permissionMode !== current.permissionMode && isFullAccess(permissionMode);
  return changesCommand || needsEffortFlag || entersFullAccess;
}
