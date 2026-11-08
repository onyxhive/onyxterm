import type { ITheme } from "@xterm/xterm";

const DARK_SCHEME = "(prefers-color-scheme: dark)";

const LIGHT_ANSI: ITheme = {
  black: "#3f3f46",
  red: "#c9302c",
  green: "#1a7f4b",
  yellow: "#a15c07",
  blue: "#2457d6",
  magenta: "#9b3fb5",
  cyan: "#0e7490",
  white: "#71717a",
  brightBlack: "#52525b",
  brightRed: "#dc2626",
  brightGreen: "#15803d",
  brightYellow: "#b45309",
  brightBlue: "#1d4ed8",
  brightMagenta: "#a21caf",
  brightCyan: "#0f766e",
  brightWhite: "#27272a",
};

const DARK_ANSI: ITheme = {
  black: "#27272a",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#facc15",
  blue: "#60a5fa",
  magenta: "#e879f9",
  cyan: "#22d3ee",
  white: "#d4d4d8",
  brightBlack: "#71717a",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde047",
  brightBlue: "#93c5fd",
  brightMagenta: "#f0abfc",
  brightCyan: "#67e8f9",
  brightWhite: "#fafafa",
};

function hexOf(cssColor: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return cssColor;
  context.fillStyle = cssColor;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function resolvedColor(variable: string, alpha = 1): string {
  const probe = document.createElement("span");
  probe.style.color = `color-mix(in srgb, var(${variable}) ${alpha * 100}%, var(--background))`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return hexOf(color);
}

export function isDarkScheme(): boolean {
  return window.matchMedia(DARK_SCHEME).matches;
}

export function terminalTheme(): ITheme {
  return {
    ...(isDarkScheme() ? DARK_ANSI : LIGHT_ANSI),
    background: resolvedColor("--background"),
    foreground: resolvedColor("--foreground"),
    cursor: resolvedColor("--foreground"),
    cursorAccent: resolvedColor("--background"),
    selectionBackground: resolvedColor("--primary", 0.28),
  };
}

export function onSchemeChange(listener: () => void): () => void {
  const query = window.matchMedia(DARK_SCHEME);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
