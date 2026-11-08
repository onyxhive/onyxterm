export type DiffLineKind = "context" | "addition" | "deletion";

export interface DiffLine {
  kind: DiffLineKind;
  oldNumber: number | null;
  newNumber: number | null;
  text: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface ParsedFileDiff {
  path: string;
  hunks: DiffHunk[];
  isBinary: boolean;
}

const FILE_START = /^diff --git a\/(.+?) b\/(.+)$/;
const HUNK_START = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;
const BINARY_MARKER = "Binary files";
const NO_NEWLINE_MARKER = "\\";
const TRAILING_NEWLINE = /\n$/;

interface Cursor {
  oldNumber: number;
  newNumber: number;
}

function lineFrom(raw: string, cursor: Cursor): DiffLine | null {
  const sign = raw[0];
  const text = raw.slice(1);
  if (sign === "+") return { kind: "addition", oldNumber: null, newNumber: cursor.newNumber++, text };
  if (sign === "-") return { kind: "deletion", oldNumber: cursor.oldNumber++, newNumber: null, text };
  if (sign === " " || raw === "") {
    return { kind: "context", oldNumber: cursor.oldNumber++, newNumber: cursor.newNumber++, text };
  }
  return null;
}

export function parseUnifiedDiff(text: string): ParsedFileDiff[] {
  const files: ParsedFileDiff[] = [];
  let file: ParsedFileDiff | null = null;
  let hunk: DiffHunk | null = null;
  const cursor: Cursor = { oldNumber: 0, newNumber: 0 };

  for (const raw of text.replace(TRAILING_NEWLINE, "").split("\n")) {
    const fileStart = FILE_START.exec(raw);
    if (fileStart) {
      file = { path: fileStart[2], hunks: [], isBinary: false };
      hunk = null;
      files.push(file);
      continue;
    }
    if (!file) continue;
    const hunkStart = HUNK_START.exec(raw);
    if (hunkStart) {
      cursor.oldNumber = Number(hunkStart[1]);
      cursor.newNumber = Number(hunkStart[2]);
      hunk = { header: raw, lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (raw.startsWith(BINARY_MARKER)) file.isBinary = true;
    if (!hunk || raw.startsWith(NO_NEWLINE_MARKER)) continue;
    const line = lineFrom(raw, cursor);
    if (line) hunk.lines.push(line);
  }

  return files;
}
