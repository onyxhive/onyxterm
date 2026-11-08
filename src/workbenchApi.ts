import { invoke } from "@tauri-apps/api/core";
import type { GitTarget } from "./gitApi";

export const TERMINAL_OUTPUT = "terminal-output";
export const TERMINAL_EXITED = "terminal-exited";

export interface TerminalOutput {
  terminalId: string;
  data: string;
}

export interface TerminalExited {
  terminalId: string;
  code: number | null;
}

export interface DirEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: number | null;
  isIgnored: boolean;
}

export interface FileContent {
  text: string | null;
  isBinary: boolean;
  isTruncated: boolean;
  size: number;
}

export const terminalApi = {
  open: (target: GitTarget, cols: number, rows: number) => invoke<string>("terminal_open", { target, cols, rows }),
  write: (terminalId: string, data: string) => invoke<void>("terminal_write", { terminalId, data }),
  resize: (terminalId: string, cols: number, rows: number) =>
    invoke<void>("terminal_resize", { terminalId, cols, rows }),
  close: (terminalId: string) => invoke<void>("terminal_close", { terminalId }),
};

export const explorerApi = {
  listDir: (target: GitTarget, relPath: string) => invoke<DirEntry[]>("list_dir", { target, relPath }),
  readFile: (target: GitTarget, relPath: string) => invoke<FileContent>("read_file", { target, relPath }),
};
