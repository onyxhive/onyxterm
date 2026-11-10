import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, RotateCw, Search } from "lucide-react";
import { insertIntoComposer } from "../composerInsertions";
import { desktopApi, type GitTarget } from "../gitApi";
import type { Task } from "../types";
import { targetKey } from "../useGit";
import { useLoaded } from "../useLoaded";
import { useProjectFiles } from "../useProjectFiles";
import { useEditors } from "../useProjectTools";
import { explorerApi, type DirEntry } from "../workbenchApi";
import { FileIcon, FolderIcon } from "./FileIcon";
import { FileViewer } from "./FileViewer";
import { cn, FOCUS_RING, ICON_BUTTON, SIDE_PANEL_TOOLBAR } from "./ui";
import { preferredOf } from "./WorkspaceRows";

const ROOT_PATH = "";
const MAX_FILTER_RESULTS = 200;
const INDENT_PER_LEVEL = 12;
const ROW_INSET = 8;

interface FilesPanelProps {
  task: Task;
  preferredEditor: string | undefined;
  onError: (message: string) => void;
}

type Listing = { entries: DirEntry[] } | { error: string };

function childPath(parent: string, name: string): string {
  return parent === ROOT_PATH ? name : `${parent}/${name}`;
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function folderOf(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

function useDirectoryTree(target: GitTarget) {
  const [listings, setListings] = useState<Record<string, Listing>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([ROOT_PATH]));
  const key = targetKey(target);

  const load = useCallback(
    (path: string) => {
      explorerApi.listDir(target, path).then(
        (entries) => setListings((current) => ({ ...current, [path]: { entries } })),
        (error) => setListings((current) => ({ ...current, [path]: { error: String(error) } })),
      );
    },
    [key],
  );

  useEffect(() => {
    setListings({});
    setExpanded(new Set([ROOT_PATH]));
    load(ROOT_PATH);
  }, [load]);

  function toggle(path: string) {
    const next = new Set(expanded);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
      load(path);
    }
    setExpanded(next);
  }

  function reload() {
    expanded.forEach(load);
  }

  return { listings, expanded, toggle, reload };
}

interface TreeRowProps {
  label: string;
  depth: number;
  isSelected?: boolean;
  isDimmed?: boolean;
  title?: string;
  onClick: () => void;
  icon: ReactNode;
  trailing?: ReactNode;
  isExpanded?: boolean;
}

function TreeRow({ label, depth, isSelected, isDimmed, title, onClick, icon, trailing, isExpanded }: TreeRowProps) {
  return (
    <button
      type="button"
      title={title ?? label}
      aria-pressed={isSelected}
      aria-expanded={isExpanded}
      onClick={onClick}
      style={{ paddingInlineStart: ROW_INSET + depth * INDENT_PER_LEVEL }}
      className={cn(
        "group flex h-6.5 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md pe-2 text-left",
        "transition-colors hover:bg-accent/60 aria-pressed:bg-accent",
        isDimmed && "opacity-55",
        FOCUS_RING,
      )}
    >
      {icon}
      <span className="min-w-0 truncate text-xs text-foreground/85 group-hover:text-foreground">{label}</span>
      {trailing}
    </button>
  );
}

interface FolderRowsProps {
  path: string;
  depth: number;
  tree: ReturnType<typeof useDirectoryTree>;
  selectedPath: string | null;
  onOpenFile: (path: string) => void;
}

function FolderRows({ path, depth, tree, selectedPath, onOpenFile }: FolderRowsProps) {
  const listing = tree.listings[path];
  if (!listing) return <p className="px-3 py-1 text-2xs text-muted-foreground">Loading…</p>;
  if ("error" in listing) return <p className="px-3 py-1 text-2xs text-error-foreground">{listing.error}</p>;
  if (listing.entries.length === 0 && depth === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">This folder is empty.</p>;
  }
  return (
    <ul role="group">
      {listing.entries.map((entry) => {
        const entryPath = childPath(path, entry.name);
        const isExpanded = entry.isDir && tree.expanded.has(entryPath);
        const chevron = (
          <ChevronRight
            aria-hidden
            className={cn("size-3 shrink-0 text-muted-foreground/70 transition-transform", isExpanded && "rotate-90")}
          />
        );
        return (
          <li key={entry.name}>
            {entry.isDir ? (
              <TreeRow
                label={entry.name}
                title={entryPath}
                depth={depth}
                isDimmed={entry.isIgnored}
                isExpanded={isExpanded}
                icon={
                  <>
                    {chevron}
                    <FolderIcon isOpen={isExpanded} />
                  </>
                }
                onClick={() => tree.toggle(entryPath)}
              />
            ) : (
              <TreeRow
                label={entry.name}
                title={entryPath}
                depth={depth}
                isDimmed={entry.isIgnored}
                isSelected={entryPath === selectedPath}
                icon={<FileIcon name={entry.name} className="ms-4.5" />}
                onClick={() => onOpenFile(entryPath)}
              />
            )}
            {isExpanded && (
              <FolderRows
                path={entryPath}
                depth={depth + 1}
                tree={tree}
                selectedPath={selectedPath}
                onOpenFile={onOpenFile}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface FilteredFilesProps {
  files: string[];
  query: string;
  selectedPath: string | null;
  onOpenFile: (path: string) => void;
}

function FilteredFiles({ files, query, selectedPath, onOpenFile }: FilteredFilesProps) {
  const needle = query.toLowerCase();
  const matches = files
    .filter((path) => !path.endsWith("/") && path.toLowerCase().includes(needle))
    .slice(0, MAX_FILTER_RESULTS);
  if (matches.length === 0) return <p className="px-3 py-2 text-xs text-muted-foreground">No files match.</p>;
  return (
    <ul>
      {matches.map((path) => (
        <li key={path}>
          <TreeRow
            label={fileName(path)}
            title={path}
            depth={0}
            isSelected={path === selectedPath}
            icon={<FileIcon name={path} />}
            trailing={
              <span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground/70">
                {folderOf(path)}
              </span>
            }
            onClick={() => onOpenFile(path)}
          />
        </li>
      ))}
    </ul>
  );
}

export function FilesPanel({ task, preferredEditor, onError }: FilesPanelProps) {
  const target = useMemo<GitTarget>(() => ({ chat: task.id }), [task.id]);
  const tree = useDirectoryTree(target);
  const editor = preferredOf(useEditors().data ?? [], preferredEditor);
  const projectFiles = useProjectFiles(target);
  const [query, setQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const file = useLoaded(selectedPath === null ? null : `${task.id}:${selectedPath}`, () =>
    explorerApi.readFile(target, selectedPath ?? ROOT_PATH),
  );
  const isFiltering = query.trim() !== "";

  function openInEditor() {
    if (!editor) return;
    desktopApi.openInEditor(target, editor.id).catch((error) => onError(String(error)));
  }

  return (
    <>
      <header className={SIDE_PANEL_TOOLBAR}>
        <label className="relative flex min-w-0 flex-1 items-center">
          <Search aria-hidden className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
          <input
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter files"
            aria-label="Filter files"
            className={cn(
              "h-7 w-full min-w-0 rounded-md border border-input bg-background ps-7 pe-2 text-xs text-foreground",
              "outline-none placeholder:text-placeholder focus-visible:border-ring dark:bg-input/32",
            )}
          />
        </label>
        <button
          type="button"
          className={cn(ICON_BUTTON, "size-7 [&_svg]:size-3.5")}
          aria-label="Refresh files"
          title="Refresh files"
          onClick={tree.reload}
        >
          <RotateCw />
        </button>
      </header>
      <nav
        aria-label="File tree"
        className={cn("min-h-0 overflow-y-auto p-1.5", selectedPath ? "max-h-[38%] shrink-0" : "flex-1")}
      >
        {isFiltering ? (
          <FilteredFiles
            files={projectFiles}
            query={query.trim()}
            selectedPath={selectedPath}
            onOpenFile={setSelectedPath}
          />
        ) : (
          <FolderRows path={ROOT_PATH} depth={0} tree={tree} selectedPath={selectedPath} onOpenFile={setSelectedPath} />
        )}
      </nav>
      {selectedPath && (
        <FileViewer
          path={selectedPath}
          content={file.isLoading ? null : file.data}
          error={file.error}
          editorName={editor?.name ?? null}
          actions={{
            onMention: (path) => insertIntoComposer(`@${path} `),
            onOpenInEditor: editor ? openInEditor : null,
            onClose: () => setSelectedPath(null),
          }}
        />
      )}
    </>
  );
}
