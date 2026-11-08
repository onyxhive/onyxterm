import type { Settings } from "./api";

export const COLOR_SCHEME_SETTING = "colorScheme";
export const CHAT_WIDTH_SETTING = "chatWidth";
export const DIFF_COLOR_SCHEME_SETTING = "diffColorScheme";
export const TIMESTAMP_FORMAT_SETTING = "timestampFormat";
export const SEND_SHORTCUT_SETTING = "sendShortcut";
export const IN_APP_NOTIFICATIONS_SETTING = "inAppNotifications";
export const BRANCH_PREFIX_SETTING = "worktreeBranchPrefix";
export const START_FROM_REMOTE_SETTING = "worktreesStartFromRemote";
export const DEFAULT_BRANCH_PREFIX = "onyx/";

export const COLOR_SCHEMES = ["system", "light", "dark"] as const;
export const CHAT_WIDTHS = ["comfortable", "wide", "full"] as const;
export const DIFF_COLOR_SCHEMES = ["red-green", "blue-orange"] as const;
export const TIMESTAMP_FORMATS = ["locale", "12-hour", "24-hour"] as const;
export const SEND_SHORTCUTS = ["enter", "mod-enter-multiline", "mod-enter"] as const;

export type ColorScheme = (typeof COLOR_SCHEMES)[number];
export type ChatWidth = (typeof CHAT_WIDTHS)[number];
export type DiffColorScheme = (typeof DIFF_COLOR_SCHEMES)[number];
export type TimestampFormat = (typeof TIMESTAMP_FORMATS)[number];
export type SendShortcut = (typeof SEND_SHORTCUTS)[number];

const BRANCH_PREFIX_PATTERN = /^(?![-_./])(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]{0,32}$/;
const MULTILINE = /[\r\n]/;

export function choiceOf<T extends string>(choices: readonly T[], value: string | undefined): T {
  return choices.find((choice) => choice === value) ?? choices[0];
}

export function isValidBranchPrefix(prefix: string): boolean {
  return BRANCH_PREFIX_PATTERN.test(prefix);
}

export function isToggleOn(settings: Settings, key: string, isOnByDefault: boolean): boolean {
  const saved = settings[key];
  return saved === undefined ? isOnByDefault : saved === "true";
}

let appliedSettings: Settings = {};

export function applyPreferences(settings: Settings) {
  appliedSettings = settings;
  const root = document.documentElement.dataset;
  root.chatWidth = choiceOf(CHAT_WIDTHS, settings[CHAT_WIDTH_SETTING]);
  root.diffColorScheme = choiceOf(DIFF_COLOR_SCHEMES, settings[DIFF_COLOR_SCHEME_SETTING]);
}

export function timestampFormat(): TimestampFormat {
  return choiceOf(TIMESTAMP_FORMATS, appliedSettings[TIMESTAMP_FORMAT_SETTING]);
}

export function areInAppNotificationsOn(): boolean {
  return isToggleOn(appliedSettings, IN_APP_NOTIFICATIONS_SETTING, true);
}

export function sendNeedsModifier(prompt: string): boolean {
  const shortcut = choiceOf(SEND_SHORTCUTS, appliedSettings[SEND_SHORTCUT_SETTING]);
  return shortcut === "mod-enter" || (shortcut === "mod-enter-multiline" && MULTILINE.test(prompt));
}
