import type { DiffFile } from "../types";
import { cn } from "./ui";

type LineCounts = Pick<DiffFile, "added" | "removed">;

export function totalOf(files: LineCounts[], key: keyof LineCounts): number {
  return files.reduce((sum, file) => sum + file[key], 0);
}

export function DiffStat({ added, removed, className }: { added: number; removed: number; className?: string }) {
  return (
    <span
      role="group"
      aria-label={`${added} additions, ${removed} deletions`}
      className={cn("inline-flex items-center gap-1 font-mono tabular-nums", className)}
    >
      <span aria-hidden="true" className="text-diff-addition">
        +{added}
      </span>
      <span aria-hidden="true" className="text-diff-deletion">
        -{removed}
      </span>
    </span>
  );
}
