import type { DiffHunk, DiffLine, DiffLineKind, ParsedFileDiff } from "../diffText";
import { cn } from "./ui";

const LINE_SURFACE: Record<DiffLineKind, string> = {
  context: "",
  addition: "bg-success/8",
  deletion: "bg-error/8",
};

const GUTTER_SURFACE: Record<DiffLineKind, string> = {
  context: "text-muted-foreground/60",
  addition: "bg-success/14 text-diff-addition",
  deletion: "bg-error/14 text-diff-deletion",
};

const SIGN: Record<DiffLineKind, string> = {
  context: " ",
  addition: "+",
  deletion: "-",
};

const SIGN_TONE: Record<DiffLineKind, string> = {
  context: "text-muted-foreground/50",
  addition: "text-diff-addition",
  deletion: "text-diff-deletion",
};

const GUTTER_CELL = "w-11 shrink-0 select-none px-2 text-right tabular-nums";

function LineRow({ line }: { line: DiffLine }) {
  return (
    <div className={cn("flex min-w-full", LINE_SURFACE[line.kind])}>
      <span aria-hidden className={cn(GUTTER_CELL, GUTTER_SURFACE[line.kind])}>
        {line.oldNumber ?? ""}
      </span>
      <span aria-hidden className={cn(GUTTER_CELL, GUTTER_SURFACE[line.kind])}>
        {line.newNumber ?? ""}
      </span>
      <span
        aria-hidden
        className={cn("w-5 shrink-0 select-none text-center", SIGN_TONE[line.kind])}
      >
        {SIGN[line.kind]}
      </span>
      <span className="pe-4 whitespace-pre text-foreground/90">{line.text || " "}</span>
    </div>
  );
}

function HunkRows({ hunk }: { hunk: DiffHunk }) {
  return (
    <>
      <div className="flex min-w-full bg-info/8 text-muted-foreground">
        <span className="w-22 shrink-0" />
        <span className="truncate px-2 whitespace-pre">{hunk.header}</span>
      </div>
      {hunk.lines.map((line, index) => (
        <LineRow key={index} line={line} />
      ))}
    </>
  );
}

export function UnifiedDiff({ diff }: { diff: ParsedFileDiff }) {
  if (diff.isBinary) return <p className="p-4 text-xs text-muted-foreground">Binary file, no text diff to show</p>;
  return (
    <div className="overflow-x-auto bg-code font-mono text-xs leading-5">
      <div className="inline-flex min-w-full flex-col">
        {diff.hunks.map((hunk, index) => (
          <HunkRows key={index} hunk={hunk} />
        ))}
      </div>
    </div>
  );
}
