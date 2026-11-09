import { useState } from "react";
import { ChevronLeft, ChevronRight, FileText, FolderGit2, RotateCw } from "lucide-react";
import { parseUnifiedDiff, type ParsedFileDiff } from "../diffText";
import { gitApi } from "../gitApi";
import type { DiffFile, Project, SessionWorktree, Task } from "../types";
import { useLoaded } from "../useLoaded";
import { DiffStat } from "./DiffStat";
import { UnifiedDiff } from "./UnifiedDiff";
import { cn, FOCUS_RING, ICON_BUTTON, SIDE_PANEL } from "./ui";

interface DiffPanelProps {
  task: Task;
  project: Project | undefined;
}

interface OpenWorktree {
  chatId: string;
  worktree: SessionWorktree;
  revision: string;
}

function totalOf(files: DiffFile[], key: "added" | "removed"): number {
  return files.reduce((sum, file) => sum + file[key], 0);
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function folderOf(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

function fileCountLabel(files: DiffFile[]): string {
  if (files.length === 0) return "No changes";
  return `${files.length} file${files.length === 1 ? "" : "s"}`;
}

function useWorktreeFileDiff({ chatId, worktree, revision }: OpenWorktree, path: string | null) {
  const key = path ? `${chatId}:${worktree.path}:${path}:${revision}` : null;
  const diff = useLoaded(key, () => gitApi.sessionWorktreeDiff(chatId, worktree.path, path));
  return {
    diffs: parseUnifiedDiff(diff.data?.text ?? ""),
    isTruncated: diff.data?.isTruncated ?? false,
    isLoading: diff.isLoading,
    error: diff.error,
  };
}

function WorktreeList({ worktrees, onOpen }: { worktrees: SessionWorktree[]; onOpen: (path: string) => void }) {
  return (
    <ul className="flex flex-col p-2">
      {worktrees.map((worktree) => (
        <li key={worktree.path}>
          <button
            type="button"
            title={worktree.path}
            onClick={() => onOpen(worktree.path)}
            className={cn(
              "group flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left",
              "transition-colors hover:bg-accent/60",
              FOCUS_RING,
            )}
          >
            <FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
                <span className="truncate">{worktree.name}</span>
                {worktree.isChatRoot && <span className="shrink-0 text-2xs text-muted-foreground">this chat</span>}
              </span>
              <span className="truncate font-mono text-2xs text-muted-foreground">
                {worktree.branch ?? "detached"}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5 text-2xs text-muted-foreground tabular-nums">
              {fileCountLabel(worktree.files)}
              {worktree.files.length > 0 && (
                <DiffStat added={totalOf(worktree.files, "added")} removed={totalOf(worktree.files, "removed")} />
              )}
            </span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70 group-hover:text-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}

interface FileListProps {
  files: DiffFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

function FileList({ files, selectedPath, onSelect }: FileListProps) {
  return (
    <ul className="flex flex-col p-2">
      {files.map((file) => (
        <li key={file.path}>
          <button
            type="button"
            title={file.path}
            aria-pressed={file.path === selectedPath}
            onClick={() => onSelect(file.path)}
            className={cn(
              "group flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 text-left",
              "transition-colors hover:bg-accent/60 aria-pressed:bg-accent",
              FOCUS_RING,
            )}
          >
            <FileText className="size-3.5 shrink-0 text-muted-foreground/70" />
            <span className="min-w-0 truncate font-mono text-xs text-foreground/85 group-hover:text-foreground">
              {fileName(file.path)}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground/70">
              {folderOf(file.path)}
            </span>
            <DiffStat added={file.added} removed={file.removed} className="shrink-0 text-3xs" />
          </button>
        </li>
      ))}
    </ul>
  );
}

interface SelectedFileDiffProps {
  path: string;
  diff: ParsedFileDiff | null;
  isLoading: boolean;
}

function SelectedFileDiff({ path, diff, isLoading }: SelectedFileDiffProps) {
  return (
    <section aria-label={`Diff of ${path}`} className="min-h-0 flex-1 overflow-y-auto border-t border-border">
      <header
        className={cn(
          "sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-border bg-background/95 px-3",
          "backdrop-blur-sm",
        )}
      >
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-mono text-xs text-foreground" title={path}>
          {path}
        </span>
      </header>
      {diff && <UnifiedDiff diff={diff} />}
      {!diff && (
        <p className="p-4 text-xs text-muted-foreground">
          {isLoading ? "Loading the diff…" : "No text diff for this file"}
        </p>
      )}
    </section>
  );
}

function WorktreeChanges(open: OpenWorktree) {
  const [chosenPath, setChosenPath] = useState<string | null>(null);
  const { files } = open.worktree;
  const selectedPath = files.some((file) => file.path === chosenPath) ? chosenPath : (files[0]?.path ?? null);
  const shown = useWorktreeFileDiff(open, selectedPath);
  const selectedDiff = shown.diffs.find((diff) => diff.path === selectedPath) ?? null;

  if (files.length === 0) {
    return <p className="px-4 py-10 text-center text-xs text-muted-foreground">This worktree has no changes</p>;
  }
  return (
    <>
      {shown.isTruncated && (
        <p className="px-4 pt-2 text-2xs text-muted-foreground">The diff is too large and was cut short</p>
      )}
      {shown.error && <p className="px-4 pt-2 text-2xs text-error-foreground">{shown.error}</p>}
      <div className="max-h-[38%] shrink-0 overflow-y-auto">
        <FileList files={files} selectedPath={selectedPath} onSelect={setChosenPath} />
      </div>
      {selectedPath && <SelectedFileDiff path={selectedPath} diff={selectedDiff} isLoading={shown.isLoading} />}
    </>
  );
}

export function DiffPanel({ task, project }: DiffPanelProps) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const revision = `${task.status}:${refreshCount}`;
  const loaded = useLoaded(`${task.id}:${revision}`, () => gitApi.sessionWorktrees(task.id));
  const worktrees = loaded.data ?? [];
  const opened = worktrees.find((worktree) => worktree.path === openPath) ?? null;

  return (
    <aside
      aria-label="Diff"
      className={SIDE_PANEL}
    >
      <header
        data-tauri-drag-region
        className="flex h-(--topbar-height) shrink-0 items-center gap-2 border-b border-border px-3 text-sm"
      >
        {opened ? (
          <>
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label="Back to worktrees"
              title="Back to worktrees"
              onClick={() => setOpenPath(null)}
            >
              <ChevronLeft />
            </button>
            <span className="min-w-0 truncate font-medium text-foreground" title={opened.path}>
              {opened.name}
            </span>
            <span data-tauri-drag-region className="min-w-0 flex-1" />
            <DiffStat
              added={totalOf(opened.files, "added")}
              removed={totalOf(opened.files, "removed")}
              className="text-xs"
            />
          </>
        ) : (
          <>
            <span className="px-1 font-medium text-foreground">Worktrees</span>
            <span data-tauri-drag-region className="min-w-0 flex-1" />
          </>
        )}
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label="Refresh diff"
          title="Refresh"
          onClick={() => setRefreshCount((count) => count + 1)}
        >
          <RotateCw />
        </button>
      </header>
      {project && (
        <p className="truncate px-4 pt-2 text-2xs text-muted-foreground" title={project.path}>
          {project.name}
        </p>
      )}
      {loaded.error && <p className="px-4 py-6 text-center text-xs text-error-foreground">{loaded.error}</p>}
      {!loaded.error && worktrees.length === 0 && (
        <p className="px-4 py-10 text-center text-xs text-muted-foreground">
          {loaded.isLoading ? "Loading…" : "No worktrees for this chat"}
        </p>
      )}
      {opened && <WorktreeChanges key={opened.path} chatId={task.id} worktree={opened} revision={revision} />}
      {!opened && worktrees.length > 0 && <WorktreeList worktrees={worktrees} onOpen={setOpenPath} />}
    </aside>
  );
}
