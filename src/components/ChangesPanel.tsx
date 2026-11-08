import { FileDiff, FileText, FolderOpen, SquareTerminal } from "lucide-react";
import type { ChangedFile, Project, Work } from "../types";
import { cn, FOCUS_RING } from "./ui";

interface ChangesPanelProps {
  work: Work;
  project: Project | undefined;
}

function totalLines(files: ChangedFile[], key: "added" | "removed"): number {
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

function folderOf(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

interface ChangedFilesCardProps {
  files: ChangedFile[];
  className?: string;
  onOpenDiff?: () => void;
}

function OpenDiffButton({ onOpenDiff }: { onOpenDiff: () => void }) {
  return (
    <button
      type="button"
      aria-label="Open diff"
      title="Open the full diff"
      onClick={onOpenDiff}
      className={cn(
        "inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium",
        "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        FOCUS_RING,
      )}
    >
      <FileDiff className="size-3" />
      <span className="hidden @[24rem]/changed-files:inline">Open diff</span>
    </button>
  );
}

export function ChangedFilesCard({ files, className, onOpenDiff }: ChangedFilesCardProps) {
  return (
    <div className={cn("@container/changed-files rounded-lg bg-secondary dark:bg-input/20", className)}>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 text-xs font-medium text-foreground">
          <span>
            {files.length} changed file{files.length === 1 ? "" : "s"}
          </span>
          <DiffStat added={totalLines(files, "added")} removed={totalLines(files, "removed")} className="text-xs" />
        </div>
        {onOpenDiff && <OpenDiffButton onOpenDiff={onOpenDiff} />}
      </div>
      <ul className="p-2 pt-0">
        {files.map((file) => (
          <li
            key={file.path}
            title={file.path}
            className="group flex h-7 min-w-0 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-accent/60"
          >
            <FileText className="size-3.5 shrink-0 text-muted-foreground/70" />
            <span className="min-w-0 truncate font-mono text-xs text-foreground/85 group-hover:text-foreground">
              {fileName(file.path)}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground/70">
              {folderOf(file.path)}
            </span>
            <DiffStat added={file.added} removed={file.removed} className="shrink-0 text-3xs" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChangesPanel({ work, project }: ChangesPanelProps) {
  return (
    <aside
      aria-label="Changed files"
      className="flex h-full w-(--changes-panel-width) shrink-0 flex-col border-l border-border bg-background"
    >
      <header
        data-tauri-drag-region
        className="flex h-(--topbar-height) shrink-0 items-center gap-2 border-b border-border px-4 text-sm"
      >
        <span className="font-medium">Changed files</span>
        <DiffStat
          added={totalLines(work.files, "added")}
          removed={totalLines(work.files, "removed")}
          className="text-xs"
        />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={project?.path}>
          <FolderOpen className="size-3.5 shrink-0" />
          <span className="shrink-0 font-medium text-foreground/85">{project?.name ?? "Removed project"}</span>
          <span className="min-w-0 truncate">{project?.path}</span>
        </div>
        {work.runningNow && (
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <SquareTerminal className="size-4 shrink-0 text-icon-muted" />
            <code className="live-tool-shine min-w-0 truncate font-mono text-xs">{work.runningNow}</code>
          </div>
        )}
        {work.files.length > 0 ? (
          <ChangedFilesCard files={work.files} />
        ) : (
          <p className="py-8 text-center text-xs text-muted-foreground">No changes yet</p>
        )}
      </div>
    </aside>
  );
}
