import { cn } from "./ui";

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
