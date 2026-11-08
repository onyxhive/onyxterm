import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { useSyncExternalStore } from "react";
import { onSchemeChange, terminalTheme } from "./terminalTheme";
import {
  TERMINAL_EXITED,
  TERMINAL_OUTPUT,
  terminalApi,
  type TerminalExited,
  type TerminalOutput,
} from "./workbenchApi";

const INITIAL_COLUMNS = 80;
const INITIAL_ROWS = 24;
const FONT_SIZE = 12;
const TERMINAL_FONT = 'ui-monospace, "SF Mono", Menlo, monospace';
const SCROLLBACK_LINES = 5000;
const EXITED_NOTICE = "\r\n\x1b[2m[process exited]\x1b[0m\r\n";

export interface TerminalSession {
  id: string;
  chatId: string;
  label: string;
  terminal: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
  isAttached: boolean;
  hasExited: boolean;
}

export interface ChatTerminals {
  sessions: TerminalSession[];
  activeId: string | null;
}

const NO_TERMINALS: ChatTerminals = { sessions: [], activeId: null };

let sessions: TerminalSession[] = [];
const activeByChat = new Map<string, string>();
const labelCounts = new Map<string, number>();
const openingCounts = new Map<string, number>();
const earlyOutput = new Map<string, string[]>();
const snapshots = new Map<string, ChatTerminals>();
const subscribers = new Set<() => void>();
let isListening = false;

function notify() {
  snapshots.clear();
  subscribers.forEach((subscriber) => subscriber());
}

function sessionWith(terminalId: string): TerminalSession | undefined {
  return sessions.find((session) => session.id === terminalId);
}

function receiveOutput({ terminalId, data }: TerminalOutput) {
  const session = sessionWith(terminalId);
  if (session) {
    session.terminal.write(data);
    return;
  }
  earlyOutput.set(terminalId, [...(earlyOutput.get(terminalId) ?? []), data]);
}

function receiveExit({ terminalId }: TerminalExited) {
  const session = sessionWith(terminalId);
  if (!session || session.hasExited) return;
  session.hasExited = true;
  session.terminal.write(EXITED_NOTICE);
  notify();
}

function startListening() {
  if (isListening) return;
  isListening = true;
  void listen<TerminalOutput>(TERMINAL_OUTPUT, (event) => receiveOutput(event.payload));
  void listen<TerminalExited>(TERMINAL_EXITED, (event) => receiveExit(event.payload));
  onSchemeChange(() => {
    const theme = terminalTheme();
    sessions.forEach((session) => (session.terminal.options.theme = theme));
  });
}

function nextLabel(chatId: string): string {
  const count = (labelCounts.get(chatId) ?? 0) + 1;
  labelCounts.set(chatId, count);
  return `Terminal ${count}`;
}

function createTerminal(): { terminal: Terminal; fit: FitAddon } {
  const terminal = new Terminal({
    fontFamily: TERMINAL_FONT,
    fontSize: FONT_SIZE,
    cursorBlink: true,
    scrollback: SCROLLBACK_LINES,
    theme: terminalTheme(),
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.loadAddon(new WebLinksAddon());
  return { terminal, fit };
}

function register(session: TerminalSession) {
  sessions = [...sessions, session];
  activeByChat.set(session.chatId, session.id);
  earlyOutput.get(session.id)?.forEach((data) => session.terminal.write(data));
  earlyOutput.delete(session.id);
  session.terminal.onData((data) => void terminalApi.write(session.id, data).catch(() => undefined));
  session.terminal.onResize(({ cols, rows }) => {
    if (!session.hasExited) void terminalApi.resize(session.id, cols, rows).catch(() => undefined);
  });
  notify();
}

function countOpening(chatId: string, change: number) {
  openingCounts.set(chatId, (openingCounts.get(chatId) ?? 0) + change);
}

async function spawnShell(chatId: string): Promise<string> {
  countOpening(chatId, 1);
  try {
    return await terminalApi.open({ chat: chatId }, INITIAL_COLUMNS, INITIAL_ROWS);
  } finally {
    countOpening(chatId, -1);
  }
}

export async function openTerminal(chatId: string, initialInput?: string): Promise<void> {
  startListening();
  const { terminal, fit } = createTerminal();
  let terminalId: string;
  try {
    terminalId = await spawnShell(chatId);
  } catch (error) {
    terminal.dispose();
    throw error;
  }
  const host = document.createElement("div");
  host.className = "h-full w-full";
  const label = nextLabel(chatId);
  register({ id: terminalId, chatId, label, terminal, fit, host, isAttached: false, hasExited: false });
  if (initialInput) await terminalApi.write(terminalId, `${initialInput}\r`);
}

export async function openFirstTerminal(chatId: string): Promise<void> {
  const isOpening = (openingCounts.get(chatId) ?? 0) > 0;
  if (isOpening || sessions.some((session) => session.chatId === chatId)) return;
  await openTerminal(chatId);
}

export function closeTerminal(terminalId: string) {
  const session = sessionWith(terminalId);
  if (!session) return;
  if (!session.hasExited) void terminalApi.close(terminalId).catch(() => undefined);
  session.terminal.dispose();
  session.host.remove();
  sessions = sessions.filter((candidate) => candidate.id !== terminalId);
  if (activeByChat.get(session.chatId) === terminalId) {
    const fallback = sessions.findLast((candidate) => candidate.chatId === session.chatId);
    if (fallback) activeByChat.set(session.chatId, fallback.id);
    else activeByChat.delete(session.chatId);
  }
  notify();
}

export function selectTerminal(session: TerminalSession) {
  activeByChat.set(session.chatId, session.id);
  notify();
}

export function attachTerminal(session: TerminalSession, container: HTMLElement) {
  container.append(session.host);
  if (session.isAttached) return;
  session.isAttached = true;
  session.terminal.open(session.host);
}

function chatTerminals(chatId: string): ChatTerminals {
  const cached = snapshots.get(chatId);
  if (cached) return cached;
  const owned = sessions.filter((session) => session.chatId === chatId);
  const snapshot = owned.length === 0 ? NO_TERMINALS : { sessions: owned, activeId: activeByChat.get(chatId) ?? null };
  snapshots.set(chatId, snapshot);
  return snapshot;
}

function subscribe(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function useChatTerminals(chatId: string): ChatTerminals {
  return useSyncExternalStore(subscribe, () => chatTerminals(chatId));
}
