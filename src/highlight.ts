import type { HLJSApi, LanguageFn } from "highlight.js";

type LanguageModule = { default: LanguageFn };

const MAX_HIGHLIGHT_LENGTH = 200_000;

const LANGUAGE_LOADERS: Record<string, () => Promise<LanguageModule>> = {
  typescript: () => import("highlight.js/lib/languages/typescript"),
  javascript: () => import("highlight.js/lib/languages/javascript"),
  json: () => import("highlight.js/lib/languages/json"),
  rust: () => import("highlight.js/lib/languages/rust"),
  python: () => import("highlight.js/lib/languages/python"),
  go: () => import("highlight.js/lib/languages/go"),
  css: () => import("highlight.js/lib/languages/css"),
  scss: () => import("highlight.js/lib/languages/scss"),
  xml: () => import("highlight.js/lib/languages/xml"),
  markdown: () => import("highlight.js/lib/languages/markdown"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
  ini: () => import("highlight.js/lib/languages/ini"),
  bash: () => import("highlight.js/lib/languages/bash"),
  sql: () => import("highlight.js/lib/languages/sql"),
  swift: () => import("highlight.js/lib/languages/swift"),
  java: () => import("highlight.js/lib/languages/java"),
  kotlin: () => import("highlight.js/lib/languages/kotlin"),
  c: () => import("highlight.js/lib/languages/c"),
  cpp: () => import("highlight.js/lib/languages/cpp"),
  ruby: () => import("highlight.js/lib/languages/ruby"),
  dockerfile: () => import("highlight.js/lib/languages/dockerfile"),
};

const EXTENSION_LANGUAGES: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  rs: "rust",
  py: "python",
  go: "go",
  css: "css",
  scss: "scss",
  html: "xml",
  xml: "xml",
  svg: "xml",
  plist: "xml",
  md: "markdown",
  mdx: "markdown",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  swift: "swift",
  java: "java",
  kt: "kotlin",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  hpp: "cpp",
  rb: "ruby",
};

const FILE_NAME_LANGUAGES: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "bash",
  ".zshrc": "bash",
  ".bashrc": "bash",
};

let core: Promise<HLJSApi> | null = null;

export function languageOf(path: string): string | null {
  const name = (path.split("/").pop() ?? path).toLowerCase();
  const extension = name.includes(".") ? (name.split(".").pop() ?? "") : "";
  return FILE_NAME_LANGUAGES[name] ?? EXTENSION_LANGUAGES[extension] ?? null;
}

async function loadedCore(): Promise<HLJSApi> {
  core ??= import("highlight.js/lib/core").then((module) => module.default);
  return core;
}

export async function highlightedHtml(text: string, language: string | null): Promise<string | null> {
  const loader = language ? LANGUAGE_LOADERS[language] : undefined;
  if (!language || !loader || text.length > MAX_HIGHLIGHT_LENGTH) return null;
  const highlighter = await loadedCore();
  if (!highlighter.getLanguage(language)) highlighter.registerLanguage(language, (await loader()).default);
  return highlighter.highlight(text, { language, ignoreIllegals: true }).value;
}
