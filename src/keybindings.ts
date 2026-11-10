export type ShortcutCommand =
  | "newChat"
  | "toggleSidebar"
  | "toggleChangesPanel"
  | "toggleTerminal"
  | "toggleFilesPanel"
  | "nextChat"
  | "previousChat";

export interface Keybinding {
  combo: string;
  command: ShortcutCommand;
}

export const KEYBINDINGS: Keybinding[] = [
  { combo: "n", command: "newChat" },
  { combo: "shift+o", command: "newChat" },
  { combo: "b", command: "toggleSidebar" },
  { combo: "d", command: "toggleChangesPanel" },
  { combo: "alt+b", command: "toggleChangesPanel" },
  { combo: "j", command: "toggleTerminal" },
  { combo: "shift+e", command: "toggleFilesPanel" },
  { combo: "ctrl+tab", command: "nextChat" },
  { combo: "ctrl+shift+tab", command: "previousChat" },
];

export const SHORTCUT_COMMAND_TITLES: Record<ShortcutCommand, string> = {
  newChat: "New chat",
  toggleSidebar: "Toggle sidebar",
  toggleChangesPanel: "Toggle changes panel",
  toggleTerminal: "Toggle terminal",
  toggleFilesPanel: "Toggle files panel",
  nextChat: "Next chat",
  previousChat: "Previous chat",
};

const CONTROL_MODIFIER = "ctrl";
const COMMAND_GLYPH = "⌘";
const MODIFIER_GLYPHS: Record<string, string> = { [CONTROL_MODIFIER]: "⌃", shift: "⇧", alt: "⌥" };
const KEY_GLYPHS: Record<string, string> = { tab: "⇥" };

export function shortcutCommandFor(event: KeyboardEvent): ShortcutCommand | null {
  if (event.metaKey === event.ctrlKey) return null;
  const modifiers = [event.ctrlKey && CONTROL_MODIFIER, event.shiftKey && "shift", event.altKey && "alt"];
  const combo = [...modifiers.filter(Boolean), event.code.replace(/^Key/, "").toLowerCase()].join("+");
  return KEYBINDINGS.find((binding) => binding.combo === combo)?.command ?? null;
}

export function comboKeys(combo: string): string[] {
  const parts = combo.split("+");
  const key = parts.pop() ?? "";
  const command = parts.includes(CONTROL_MODIFIER) ? [] : [COMMAND_GLYPH];
  const modifiers = parts.map((modifier) => MODIFIER_GLYPHS[modifier] ?? modifier);
  return [...command, ...modifiers, KEY_GLYPHS[key] ?? key.toUpperCase()];
}
