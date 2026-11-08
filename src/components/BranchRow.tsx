import { useState, type FormEvent } from "react";
import { Check, ChevronDown, GitBranch, GitBranchPlus, Search, TriangleAlert } from "lucide-react";
import { gitApi } from "../gitApi";
import { elapsedSince } from "../tasks";
import type { GitBranch as Branch } from "../types";
import { useBranches } from "../useGit";
import { DETAILS_ANCHORED_POPUP, DETAILS_ICON, DETAILS_LABEL, DETAILS_SELECT_ROW } from "./detailsStyles";
import { cn, MENU_ITEM, MENU_POPUP, MenuLabel, MenuSeparator, PRIMARY_BUTTON, TEXT_INPUT } from "./ui";
import { usePopup } from "./usePopup";

const DIRTY_TREE_MARKER = "uncommitted changes";

interface BranchRowProps {
  projectId: string;
  branch: string | null;
  onChanged: () => void;
}

function friendlyCheckoutError(error: unknown, target: string): string {
  const message = String(error);
  if (message.includes(DIRTY_TREE_MARKER)) {
    return `You have uncommitted changes. Commit or stash them before switching to ${target}.`;
  }
  return message.replace(/^git: /, "");
}

function matching(branches: Branch[], query: string): Branch[] {
  const needle = query.trim().toLowerCase();
  return branches.filter((branch) => branch.name.toLowerCase().includes(needle));
}

interface BranchOptionProps {
  branch: Branch;
  onPick: (name: string) => void;
}

function BranchOption({ branch, onPick }: BranchOptionProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={branch.isCurrent}
      className={cn(MENU_ITEM, "aria-selected:bg-foreground/[0.06]")}
      onClick={() => onPick(branch.name)}
    >
      <GitBranch />
      <span className="min-w-0 flex-1 truncate">{branch.name}</span>
      <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
        {elapsedSince(branch.lastCommitAt, Date.now())}
      </span>
      <Check className={cn("size-3.5", !branch.isCurrent && "invisible")} />
    </button>
  );
}

interface CreateBranchFormProps {
  initialName: string;
  isBusy: boolean;
  onCreate: (name: string) => void;
}

function CreateBranchForm({ initialName, isBusy, onCreate }: CreateBranchFormProps) {
  const [name, setName] = useState(initialName);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) onCreate(name.trim());
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1.5 p-1.5" aria-label="Create branch">
      <input
        autoFocus
        className={cn(TEXT_INPUT, "h-7 font-mono text-xs")}
        placeholder="New branch name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" className={cn(PRIMARY_BUTTON, "h-7 px-2.5 text-xs")} disabled={!name.trim() || isBusy}>
        Create
      </button>
    </form>
  );
}

function BranchPicker({ projectId, onChanged, close }: Omit<BranchRowProps, "branch"> & { close: () => void }) {
  const branches = useBranches(projectId);
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const all = branches.data?.branches ?? [];
  const found = matching(all, query);
  const local = found.filter((branch) => !branch.isRemote);
  const remote = found.filter((branch) => branch.isRemote);
  const typed = query.trim();
  const canCreateTyped = typed !== "" && !all.some((branch) => branch.name === typed);

  async function run(action: () => Promise<unknown>, target: string) {
    setIsBusy(true);
    setProblem(null);
    try {
      await action();
      onChanged();
      close();
    } catch (error) {
      setProblem(friendlyCheckoutError(error, target));
    } finally {
      setIsBusy(false);
    }
  }

  const checkout = (name: string) => run(() => gitApi.checkout(projectId, name), name);
  const create = (name: string) => run(() => gitApi.createBranch(projectId, name), name);

  return (
    <div role="dialog" aria-label="Switch branch" className={cn(MENU_POPUP, DETAILS_ANCHORED_POPUP, "p-0")}>
      <div className="px-3 pt-2.5">
        <div className="relative border-b border-border/70 pb-1.5 transition-colors focus-within:border-ring">
          <Search aria-hidden className="pointer-events-none absolute top-1.5 left-0 size-4 text-muted-foreground/55" />
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-label="Search branches"
            placeholder="Search branches…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && canCreateTyped && create(typed)}
            className="h-6.5 w-full bg-transparent ps-6 text-sm outline-none placeholder:text-placeholder"
          />
        </div>
      </div>
      {problem && (
        <p
          role="alert"
          className="mx-2 mt-2 flex gap-2 rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning-foreground"
        >
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          <span>{problem}</span>
        </p>
      )}
      <div role="listbox" aria-label="Branches" className="max-h-64 overflow-y-auto p-1">
        {canCreateTyped && (
          <button type="button" className={MENU_ITEM} disabled={isBusy} onClick={() => create(typed)}>
            <GitBranchPlus />
            <span className="min-w-0 truncate">Create branch “{typed}”</span>
          </button>
        )}
        {local.length > 0 && <MenuLabel>Local</MenuLabel>}
        {local.map((branch) => (
          <BranchOption key={branch.name} branch={branch} onPick={checkout} />
        ))}
        {remote.length > 0 && <MenuLabel>Remote</MenuLabel>}
        {remote.map((branch) => (
          <BranchOption key={branch.name} branch={branch} onPick={checkout} />
        ))}
        {found.length === 0 && !canCreateTyped && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            {branches.isLoading ? "Loading branches…" : "No branches match"}
          </p>
        )}
      </div>
      <MenuSeparator />
      {isCreating ? (
        <CreateBranchForm initialName={typed} isBusy={isBusy} onCreate={create} />
      ) : (
        <div className="p-1 pt-0">
          <button type="button" className={MENU_ITEM} onClick={() => setIsCreating(true)}>
            <GitBranchPlus />
            Create branch…
          </button>
        </div>
      )}
    </div>
  );
}

export function BranchRow({ projectId, branch, onChanged }: BranchRowProps) {
  const popup = usePopup();
  const label = branch ?? "Detached HEAD";
  return (
    <div className="relative" ref={popup.rootRef}>
      <button
        type="button"
        aria-label={`Branch: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={popup.isOpen}
        className={DETAILS_SELECT_ROW}
        onClick={popup.toggle}
      >
        <span className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-2.5">
          <GitBranch aria-hidden className={DETAILS_ICON} />
          <span className={DETAILS_LABEL} title={label}>
            {label}
          </span>
        </span>
        <span className="flex h-full w-8 shrink-0 items-center justify-center">
          <ChevronDown aria-hidden className={DETAILS_ICON} />
        </span>
      </button>
      {popup.isOpen && <BranchPicker projectId={projectId} onChanged={onChanged} close={popup.close} />}
    </div>
  );
}
