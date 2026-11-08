import { useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChartNoAxesColumn,
  CircleAlert,
  CircleDashed,
  Eye,
  FolderPlus,
  GitBranch,
  MessageCircleQuestion,
  Plus,
  Search,
  Settings,
  ShieldQuestion,
  SquareKanban,
  SquarePen,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CollapsedSections } from "../collapsedSections";
import { STATUS_GROUPS, tasksInGroup, type StatusGroup } from "../status";
import type { Task, TaskStatus, Workspace } from "../types";
import type { ProjectBranches } from "../useProjectBranches";
import { cn, FOCUS_RING, ICON_BUTTON } from "./ui";

export interface SidebarActions {
  onSelect: (taskId: string) => void;
  onMarkDone: (taskId: string) => void;
  onReopen: (taskId: string) => void;
  onNewChat: (projectId?: string) => void;
  onAddProject: () => void;
  onToggleBoard: () => void;
}

interface SidebarProps {
  workspace: Workspace;
  tasks: Task[];
  branches: ProjectBranches;
  sections: CollapsedSections;
  selectedTaskId: string | null;
  isOpen: boolean;
  isBoardActive: boolean;
  header: ReactNode;
  actions: SidebarActions;
}

const SECTION_TITLES: Record<string, string> = {
  waiting: "Needs you",
  running: "Running",
  failed: "Failed",
  done: "Done",
};

function matchesQuery(task: Task, query: string): boolean {
  return task.title.toLowerCase().includes(query.trim().toLowerCase());
}

interface RowStatus {
  label: string;
  icon: LucideIcon;
  className: string;
}

const ROW_STATUS: Partial<Record<TaskStatus, RowStatus>> = {
  running: { label: "Working", icon: CircleDashed, className: "text-info-foreground" },
  permission: { label: "Approval", icon: ShieldQuestion, className: "text-warning-foreground" },
  question: { label: "Input", icon: MessageCircleQuestion, className: "text-indigo-600 dark:text-indigo-300" },
  failed: { label: "Failed", icon: CircleAlert, className: "text-error-foreground" },
  review: { label: "Review", icon: Eye, className: "text-primary" },
};

const SIDEBAR_HEADER_ICON_BUTTON = cn(
  "relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-(--control-radius)",
  "font-medium text-sidebar-muted-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
  "[&>svg]:size-4 [&>svg]:shrink-0",
  FOCUS_RING,
);

const ROW_ACTION_CLASS = cn(
  "pointer-events-none absolute inset-y-0 right-0 inline-flex cursor-pointer items-center rounded-md px-1.5",
  "text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:pointer-events-auto",
  "focus-visible:opacity-100 group-hover/row:pointer-events-auto group-hover/row:opacity-100",
);

function RowStatusSlot({ task }: { task: Task }) {
  const status = ROW_STATUS[task.status];
  if (!status) return null;
  const Icon = status.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", status.className)}>
      <Icon aria-hidden className="size-3 shrink-0" />
      {status.label}
    </span>
  );
}

function SettleButton({ task, actions }: { task: Task; actions: SidebarActions }) {
  const isSettled = task.status === "done";
  const label = isSettled ? "Reopen" : "Mark done";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={ROW_ACTION_CLASS}
      onClick={() => (isSettled ? actions.onReopen(task.id) : actions.onMarkDone(task.id))}
    >
      {isSettled ? <Undo2 className="mb-px size-3.5" /> : <Check className="size-3" />}
    </button>
  );
}

function MetaDot() {
  return (
    <span aria-hidden="true" className="shrink-0 text-muted-foreground/50">
      ·
    </span>
  );
}

interface RowMetaProps {
  projectName: string;
  branch: string | null;
  elapsed: string;
}

function RowMeta({ projectName, branch, elapsed }: RowMetaProps) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs text-secondary-label group-hover/row:pe-6">
      <span className="max-w-1/2 shrink-0 truncate">{projectName}</span>
      {branch && (
        <>
          <MetaDot />
          <span className="flex min-w-0 items-center gap-1" title={branch}>
            <GitBranch aria-hidden className="size-3 shrink-0" />
            <span className="min-w-0 truncate">{branch}</span>
          </span>
        </>
      )}
      <MetaDot />
      <span className="shrink-0 tabular-nums">{elapsed}</span>
    </span>
  );
}

interface ThreadRowProps {
  task: Task;
  projectName: string;
  branch: string | null;
  isActive: boolean;
  actions: SidebarActions;
}

function ThreadRow({ task, projectName, branch, isActive, actions }: ThreadRowProps) {
  const isSettled = task.status === "done";
  return (
    <li className="group/row relative list-none">
      <button
        type="button"
        aria-current={isActive}
        title={task.title}
        onClick={() => actions.onSelect(task.id)}
        className={cn(
          "relative flex w-full cursor-pointer select-none flex-col gap-0.5 rounded-md px-2 py-1.5 text-left",
          FOCUS_RING,
          isActive
            ? "bg-sidebar-row-active text-sidebar-foreground ring-1 ring-sidebar-border/70 ring-inset dark:ring-0"
            : "hover:bg-sidebar-row-hover",
        )}
      >
        <span
          className={cn(
            "line-clamp-2 min-w-0 text-sm leading-5 [overflow-wrap:anywhere]",
            isSettled ? "font-normal text-foreground/75 group-hover/row:text-foreground" : "font-medium",
          )}
        >
          <span className="float-right ms-2 flex h-5 items-center tabular-nums">
            <RowStatusSlot task={task} />
          </span>
          {task.title}
        </span>
        <RowMeta projectName={projectName} branch={branch} elapsed={task.elapsed} />
      </button>
      <span className="absolute right-2 bottom-1.5 flex h-4 items-center">
        <SettleButton task={task} actions={actions} />
      </span>
    </li>
  );
}

interface SectionHeaderProps {
  title: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function SectionHeader({ title, count, isExpanded, onToggle }: SectionHeaderProps) {
  return (
    <button
      type="button"
      aria-expanded={isExpanded}
      onClick={onToggle}
      className={cn(
        "flex h-7 w-full cursor-pointer items-center gap-1 rounded-md px-2 text-left text-xs font-medium",
        "text-sidebar-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset",
        "focus-visible:ring-ring/70",
      )}
    >
      <span className="min-w-0 truncate">{title}</span>
      <span aria-hidden className="invisible h-px min-w-2 flex-1" />
      <span className="font-normal tabular-nums">{count}</span>
      <ChevronDown
        aria-hidden
        className={cn("size-3 shrink-0 transition-transform", !isExpanded && "-rotate-90")}
      />
    </button>
  );
}

interface StatusSectionProps {
  group: StatusGroup;
  tasks: Task[];
  isExpanded: boolean;
  onToggle: () => void;
  row: (task: Task) => ReactNode;
}

function StatusSection({ group, tasks, isExpanded, onToggle, row }: StatusSectionProps) {
  return (
    <li className="list-none">
      <SectionHeader
        title={SECTION_TITLES[group.id]}
        count={tasks.length}
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
      {isExpanded && <ul className="flex flex-col gap-0.5 pt-0.5">{tasks.map(row)}</ul>}
    </li>
  );
}

interface UtilityItemProps {
  icon: ReactNode;
  label: string;
  isActive?: boolean;
  disabledReason?: string;
  onClick?: () => void;
}

function UtilityItem({ icon, label, isActive = false, disabledReason, onClick }: UtilityItemProps) {
  return (
    <span title={disabledReason ?? label} className="shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-pressed={isActive}
        disabled={disabledReason !== undefined}
        onClick={onClick}
        className={cn(
          "flex size-8 cursor-pointer items-center justify-center rounded-(--control-radius) font-medium",
          "text-sidebar-muted-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
          "disabled:pointer-events-none disabled:opacity-64 [&>svg]:size-4 [&>svg]:shrink-0",
          "aria-pressed:bg-sidebar-row-active aria-pressed:text-sidebar-foreground",
          FOCUS_RING,
        )}
      >
        {icon}
      </button>
    </span>
  );
}

function SearchField({ query, onChange }: { query: string; onChange: (query: string) => void }) {
  return (
    <div
      className={cn(
        "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium",
        "text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
        "focus-within:bg-sidebar-row-hover focus-within:text-sidebar-foreground",
        "focus-within:ring-1 focus-within:ring-ring/70 focus-within:ring-inset",
      )}
    >
      <Search className="size-4 shrink-0" />
      <input
        type="search"
        value={query}
        placeholder="Search"
        aria-label="Search chats"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && onChange("")}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-sm font-medium text-sidebar-foreground outline-none",
          "placeholder:text-sidebar-muted-foreground [&::-webkit-search-cancel-button]:hidden",
        )}
      />
      {query && (
        <button
          type="button"
          className={cn(ICON_BUTTON, "size-5 [&_svg]:size-3")}
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <X />
        </button>
      )}
    </div>
  );
}

function EmptyProjects({ onAddProject }: { onAddProject: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-6 text-center text-xs text-muted-foreground/60">
      <span>No projects yet</span>
      <button
        type="button"
        onClick={onAddProject}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-sidebar-border px-2.5 py-1",
          "text-2xs font-medium text-sidebar-muted-foreground transition-colors",
          "hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
        )}
      >
        <Plus className="size-3" />
        Add project
      </button>
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  const { workspace, tasks, branches, sections, selectedTaskId, isOpen, isBoardActive, header, actions } = props;
  const [query, setQuery] = useState("");
  const isSearching = query.trim().length > 0;
  const visibleTasks = isSearching ? tasks.filter((task) => matchesQuery(task, query)) : tasks;
  const sectionTasks = STATUS_GROUPS.map((group) => ({ group, tasks: tasksInGroup(visibleTasks, group) })).filter(
    (section) => section.tasks.length > 0,
  );

  function projectName(projectId: string): string {
    return workspace.projects.find((project) => project.id === projectId)?.name ?? "Removed project";
  }

  function row(task: Task) {
    return (
      <ThreadRow
        key={task.id}
        task={task}
        projectName={projectName(task.projectId)}
        branch={branches[task.projectId] ?? null}
        isActive={task.id === selectedTaskId}
        actions={actions}
      />
    );
  }

  return (
    <aside
      aria-label="Projects and chats"
      inert={!isOpen}
      className={cn(
        "relative h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out",
        "motion-reduce:transition-none",
        isOpen ? "w-(--sidebar-width)" : "w-0",
      )}
    >
      <div
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col border-r border-sidebar-border bg-sidebar",
          "text-sidebar-foreground",
        )}
      >
        <div
          data-tauri-drag-region
          className={cn(
            "flex h-(--topbar-height) shrink-0 items-center gap-2 pr-3 pl-(--workspace-titlebar-content-left)",
            "transition-[padding-left] duration-200 ease-out motion-reduce:transition-none",
          )}
        >
          {header}
        </div>
        <div className="flex shrink-0 items-center gap-1 p-2">
          <SearchField query={query} onChange={setQuery} />
          <button
            type="button"
            className={SIDEBAR_HEADER_ICON_BUTTON}
            aria-label="Add project"
            title="Add project"
            onClick={actions.onAddProject}
          >
            <FolderPlus />
          </button>
          <button
            type="button"
            className={SIDEBAR_HEADER_ICON_BUTTON}
            aria-label="New chat"
            title="New chat (⌘N)"
            onClick={() => actions.onNewChat()}
          >
            <SquarePen />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {workspace.projects.length === 0 && <EmptyProjects onAddProject={actions.onAddProject} />}
          {isSearching && sectionTasks.length === 0 && (
            <p role="status" className="px-2 py-6 text-center text-xs text-sidebar-muted-foreground">
              No chats found
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {sectionTasks.map((section) => (
              <StatusSection
                key={section.group.id}
                group={section.group}
                tasks={section.tasks}
                isExpanded={isSearching || !sections.isCollapsed(section.group.id)}
                onToggle={() => sections.toggle(section.group.id)}
                row={row}
              />
            ))}
          </ul>
        </nav>
        <div className="flex shrink-0 flex-row items-center gap-1 px-2 pt-1 pb-2">
          <UtilityItem icon={<Settings />} label="Settings" disabledReason="Settings coming later" />
          <UtilityItem
            icon={<SquareKanban />}
            label="Board"
            isActive={isBoardActive}
            onClick={actions.onToggleBoard}
          />
          <UtilityItem icon={<ChartNoAxesColumn />} label="Usage" disabledReason="Usage coming later" />
        </div>
      </div>
    </aside>
  );
}
