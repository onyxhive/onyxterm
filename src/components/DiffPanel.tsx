import { useState } from "react";
import { Check, ChevronDown, FileText, RotateCw } from "lucide-react";
import { parseUnifiedDiff, type ParsedFileDiff } from "../diffText";
import { gitApi } from "../gitApi";
import type { DiffFile, Project, Task } from "../types";
import { useLoaded } from "../useLoaded";
import { DiffStat } from "./ChangesPanel";
import { Segmented } from "./Segmented";
import { UnifiedDiff } from "./UnifiedDiff";
import { cn, FOCUS_RING, ICON_BUTTON, MENU_ITEM, MENU_POPUP } from "./ui";
import { usePopup } from "./usePopup";

export type DiffScope = { kind: "turn"; turn: number | null } | { kind: "workingTree" };

export const LATEST_TURN_SCOPE: DiffScope = { kind: "turn", turn: null };

type ScopeKind = DiffScope["kind"];

const SCOPE_OPTIONS = [
  { value: "turn" as const, label: "This turn" },
  { value: "workingTree" as const, label: "Working tree" },
];

interface DiffPanelProps {
  task: Task;
  project: Project | undefined;
  scope: DiffScope;
  onScopeChange: (scope: DiffScope) => void;
}

interface DiffFiles {
  files: DiffFile[];
  error: string | null;
  isLoading: boolean;
}

interface TurnDiffState extends DiffFiles {
  turns: number[];
  diffs: ParsedFileDiff[];
  isTruncated: boolean;
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

function useTurnDiff(chatId: string, turn: number | null, revision: string): TurnDiffState {
  const turns = useLoaded(`${chatId}:${revision}`, () => gitApi.checkpointTurns(chatId));
  const finished = turns.data ?? [];
  const selected = turn ?? finished.at(-1) ?? null;
  const diff = useLoaded(selected === null ? null : `${chatId}:${selected}:${revision}`, () =>
    gitApi.turnDiff(chatId, selected ?? 0),
  );
  return {
    turns: finished,
    files: diff.data?.files ?? [],
    diffs: parseUnifiedDiff(diff.data?.text ?? ""),
    isTruncated: diff.data?.isTruncated ?? false,
    error: turns.error ?? diff.error,
    isLoading: turns.isLoading || diff.isLoading,
  };
}

function useWorkingTreeFiles(chatId: string, isActive: boolean, revision: string): DiffFiles {
  const status = useLoaded(isActive ? `${chatId}:${revision}` : null, () => gitApi.status({ chat: chatId }));
  const files = (status.data?.files ?? []).map(({ path, added, removed }) => ({ path, added, removed }));
  return { files, error: status.error, isLoading: status.isLoading };
}

function useWorkingFileDiff(chatId: string, path: string | null, revision: string) {
  const diff = useLoaded(path ? `${chatId}:${path}:${revision}` : null, () => gitApi.diff({ chat: chatId }, path));
  return {
    diffs: parseUnifiedDiff(diff.data?.text ?? ""),
    isTruncated: diff.data?.isTruncated ?? false,
    isLoading: diff.isLoading,
  };
}

function emptyMessageFor(scope: DiffScope, turns: number[]): string {
  if (scope.kind === "workingTree") return "The working tree is clean";
  return turns.length === 0 ? "No finished turns with changes yet" : "This turn changed no files";
}

function TurnPicker({ turns, current, onPick }: { turns: number[]; current: number; onPick: (turn: number) => void }) {
  const popup = usePopup();
  return (
    <div className="relative" ref={popup.rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={popup.isOpen}
        onClick={popup.toggle}
        className={cn(
          "inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-xs font-medium",
          "text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent",
          FOCUS_RING,
        )}
      >
        Turn {current}
        <ChevronDown className="size-3.5 opacity-70" />
      </button>
      {popup.isOpen && (
        <div role="menu" aria-label="Turns" className={cn(MENU_POPUP, "absolute top-full right-0 mt-1 w-36")}>
          {[...turns].reverse().map((turn) => (
            <button
              key={turn}
              type="button"
              role="menuitemradio"
              aria-checked={turn === current}
              className={MENU_ITEM}
              onClick={() => {
                onPick(turn);
                popup.close();
              }}
            >
              Turn {turn}
              {turn === turns.at(-1) && <span className="text-xs text-muted-foreground">latest</span>}
              <Check className={cn("ms-auto size-3.5", turn !== current && "invisible")} />
            </button>
          ))}
        </div>
      )}
    </div>
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

export function DiffPanel({ task, project, scope, onScopeChange }: DiffPanelProps) {
  const [chosenPath, setChosenPath] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const revision = `${task.status}:${refreshCount}`;
  const isWorkingTree = scope.kind === "workingTree";
  const turnDiff = useTurnDiff(task.id, scope.kind === "turn" ? scope.turn : null, revision);
  const workingTree = useWorkingTreeFiles(task.id, isWorkingTree, revision);
  const listed = isWorkingTree ? workingTree : turnDiff;
  const selectedPath = listed.files.some((file) => file.path === chosenPath)
    ? chosenPath
    : (listed.files[0]?.path ?? null);
  const workingFileDiff = useWorkingFileDiff(task.id, isWorkingTree ? selectedPath : null, revision);
  const shown = isWorkingTree ? workingFileDiff : turnDiff;
  const selectedDiff = shown.diffs.find((diff) => diff.path === selectedPath) ?? null;
  const currentTurn = scope.kind === "turn" ? (scope.turn ?? turnDiff.turns.at(-1) ?? null) : null;

  function changeScope(kind: ScopeKind) {
    setChosenPath(null);
    onScopeChange(kind === "turn" ? LATEST_TURN_SCOPE : { kind: "workingTree" });
  }

  return (
    <aside
      aria-label="Diff"
      className="island flex h-full w-(--diff-panel-width) shrink-0 flex-col bg-background"
    >
      <header
        data-tauri-drag-region
        className="flex h-(--island-header-height) shrink-0 items-center gap-2 border-b border-border px-3 text-sm"
      >
        <Segmented label="Diff scope" options={SCOPE_OPTIONS} value={scope.kind} onChange={changeScope} />
        {currentTurn !== null && turnDiff.turns.length > 1 && (
          <TurnPicker
            turns={turnDiff.turns}
            current={currentTurn}
            onPick={(turn) => onScopeChange({ kind: "turn", turn })}
          />
        )}
        <span data-tauri-drag-region className="min-w-0 flex-1" />
        <DiffStat
          added={totalOf(listed.files, "added")}
          removed={totalOf(listed.files, "removed")}
          className="text-xs"
        />
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
          {shown.isTruncated && " · the diff is too large and was cut short"}
        </p>
      )}
      {listed.error && <p className="px-4 py-6 text-center text-xs text-error-foreground">{listed.error}</p>}
      {!listed.error && listed.files.length === 0 && (
        <p className="px-4 py-10 text-center text-xs text-muted-foreground">
          {listed.isLoading ? "Loading…" : emptyMessageFor(scope, turnDiff.turns)}
        </p>
      )}
      {listed.files.length > 0 && (
        <>
          <div className="max-h-[38%] shrink-0 overflow-y-auto">
            <FileList files={listed.files} selectedPath={selectedPath} onSelect={setChosenPath} />
          </div>
          {selectedPath && <SelectedFileDiff path={selectedPath} diff={selectedDiff} isLoading={shown.isLoading} />}
        </>
      )}
    </aside>
  );
}
