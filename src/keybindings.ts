export type ShortcutCommand =
  | "newChat"
  | "toggleSidebar"
  | "toggleChangesPanel"
  | "toggleTerminal"
  | "toggleFilesPanel";

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
];

export const SHORTCUT_COMMAND_TITLES: Record<ShortcutCommand, string> = {
  newChat: "New chat",
  toggleSidebar: "Toggle sidebar",
  toggleChangesPanel: "Toggle changes panel",
  toggleTerminal: "Toggle terminal",
  toggleFilesPanel: "Toggle files panel",
};

const MODIFIER_GLYPHS: Record<string, string> = { shift: "⇧", alt: "⌥" };

export function shortcutCommandFor(event: KeyboardEvent): ShortcutCommand | null {
  if (!event.metaKey || event.ctrlKey) return null;
  const modifiers = [event.shiftKey && "shift", event.altKey && "alt"].filter(Boolean);
  const combo = [...modifiers, event.code.replace(/^Key/, "").toLowerCase()].join("+");
  return KEYBINDINGS.find((binding) => binding.combo === combo)?.command ?? null;
}

export function comboKeys(combo: string): string[] {
  const parts = combo.split("+");
  const key = parts.pop() ?? "";
  return ["⌘", ...parts.map((modifier) => MODIFIER_GLYPHS[modifier] ?? modifier), key.toUpperCase()];
}
