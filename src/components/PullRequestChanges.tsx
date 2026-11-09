import { useMemo, useState } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { parseUnifiedDiff, type ParsedFileDiff } from "../diffText";
import { prApi } from "../gitApi";
import type { PrFile } from "../types";
import { useLoaded } from "../useLoaded";
import { DiffStat } from "./DiffStat";
import { UnifiedDiff } from "./UnifiedDiff";
import { cn, FOCUS_RING } from "./ui";

interface PullRequestChangesProps {
  projectId: string;
  number: number;
  files: PrFile[];
}

interface FileDiffCardProps {
  file: PrFile;
  diff: ParsedFileDiff | null;
  isLoading: boolean;
}

function totalOf(files: PrFile[], key: "additions" | "deletions"): number {
  return files.reduce((sum, file) => sum + file[key], 0);
}

function filesLabel(count: number): string {
  return count === 1 ? "1 file changed" : `${count} files changed`;
}

function FileDiffCard({ file, diff, isLoading }: FileDiffCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  return (
    <section aria-label={`Changes to ${file.path}`} className="overflow-clip rounded-lg border border-border">
      <button
        type="button"
        title={file.path}
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
        className={cn(
          "sticky top-0 z-10 flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 bg-background/95 px-3",
          "text-left backdrop-blur-sm hover:bg-accent/60 aria-expanded:border-b aria-expanded:border-border",
          FOCUS_RING,
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", isExpanded && "rotate-90")}
        />
        <FileText aria-hidden className="size-3.5 shrink-0 text-muted-foreground/70" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{file.path}</span>
        <DiffStat added={file.additions} removed={file.deletions} className="shrink-0 text-xs" />
      </button>
      {isExpanded && diff && <UnifiedDiff diff={diff} />}
      {isExpanded && !diff && (
        <p className="p-4 text-xs text-muted-foreground">
          {isLoading ? "Loading the diff…" : "No text diff for this file"}
        </p>
      )}
    </section>
  );
}

export function PullRequestChanges({ projectId, number, files }: PullRequestChangesProps) {
  const patch = useLoaded(`${projectId}:${number}:diff`, () => prApi.diff(projectId, number));
  const text = patch.data?.text ?? "";
  const diffs = useMemo(() => parseUnifiedDiff(text), [text]);

  function diffOf(path: string): ParsedFileDiff | null {
    return diffs.find((diff) => diff.path === path) ?? null;
  }

  return (
    <section aria-label="Changes" className="flex flex-col gap-3">
      <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <span className="font-medium">{filesLabel(files.length)}</span>
        <DiffStat added={totalOf(files, "additions")} removed={totalOf(files, "deletions")} />
        {patch.data?.isTruncated && <span>· the diff is too large and was cut short</span>}
      </p>
      {patch.error && <p className="px-1 text-xs text-error-foreground">{patch.error}</p>}
      {files.map((file) => (
        <FileDiffCard key={file.path} file={file} diff={diffOf(file.path)} isLoading={patch.isLoading} />
      ))}
    </section>
  );
}
