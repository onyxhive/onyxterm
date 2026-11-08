import { useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChartNoAxesColumn,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Folder,
  FolderPlus,
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
import type { Project, Task, TaskStatus, Workspace } from "../types";
import { StatusDot } from "./StatusBadge";
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
  selectedTaskId: string | null;
  isOpen: boolean;
  isBoardActive: boolean;
  header: ReactNode;
  actions: SidebarActions;
}

const FOLDER_ATTENTION_ORDER: TaskStatus[] = ["permission", "question", "failed", "running", "review"];

function mostUrgentStatus(tasks: Task[]): TaskStatus | null {
  return FOLDER_ATTENTION_ORDER.find((status) => tasks.some((task) => task.status === status)) ?? null;
}

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
  review: { label: "Done", icon: CircleCheck, className: "text-success-foreground" },
};

const ROW_ACTION_CLASS = cn(
  "pointer-events-none absolute inset-y-0 right-0 inline-flex cursor-pointer items-center rounded-md px-2",
  "text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:pointer-events-auto",
  "focus-visible:opacity-100 group-hover/row:pointer-events-auto group-hover/row:opacity-100",
);

function RowStatusSlot({ task }: { task: Task }) {
  const status = ROW_STATUS[task.status];
  if (!status) return <span className="text-xs">{task.elapsed}</span>;
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

function ThreadRow({ task, isActive, actions }: { task: Task; isActive: boolean; actions: SidebarActions }) {
  const isSettled = task.status === "done";
  return (
    <li className="group/row relative list-none">
      <button
        type="button"
        aria-current={isActive}
        onClick={() => actions.onSelect(task.id)}
        className={cn(
          "relative flex h-9 w-full cursor-pointer select-none items-center gap-2.5 rounded-md ps-9 pe-2.5",
          "text-left",
          FOCUS_RING,
          isActive
            ? "bg-sidebar-row-active text-sidebar-foreground ring-1 ring-sidebar-border/70 ring-inset dark:ring-0"
            : "hover:bg-sidebar-row-hover",
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            isSettled ? "font-normal text-foreground/75 group-hover/row:text-foreground" : "font-medium",
          )}
        >
          {task.title}
        </span>
        <span className="ml-auto flex h-6 min-w-8 shrink-0 items-center justify-end">
          <span className="inline-flex justify-end tabular-nums text-secondary-label group-hover/row:opacity-0">
            <RowStatusSlot task={task} />
          </span>
        </span>
      </button>
      <span className="absolute inset-y-0 right-2.5 flex items-center">
        <SettleButton task={task} actions={actions} />
      </span>
    </li>
  );
}

interface ProjectFolderProps {
  project: Project;
  tasks: Task[];
  selectedTaskId: string | null;
  isCollapsed: boolean;
  onToggle: () => void;
  actions: SidebarActions;
}

function ProjectFolder({ project, tasks, selectedTaskId, isCollapsed, onToggle, actions }: ProjectFolderProps) {
  const attention = isCollapsed ? mostUrgentStatus(tasks) : null;
  return (
    <li className="group/folder relative mt-2 list-none first:mt-0">
      <button
        type="button"
        aria-expanded={!isCollapsed}
        title={project.path}
        onClick={onToggle}
        className={cn(
          "flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-(--control-radius) px-2.5 text-left",
          "hover:bg-sidebar-row-hover",
          FOCUS_RING,
        )}
      >
        <Folder className="size-4 shrink-0 text-sidebar-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-sidebar-foreground/90">{project.name}</span>
        {attention && <StatusDot status={attention} />}
        {isCollapsed && tasks.length > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-sidebar-muted-foreground group-hover/folder:invisible">
            {tasks.length}
          </span>
        )}
        <ChevronDown
          className={cn(
            "size-3 shrink-0 text-sidebar-muted-foreground transition-transform",
            isCollapsed && "-rotate-90",
          )}
        />
      </button>
      <span
        className={cn(
          "absolute top-0 right-6 flex h-8 items-center opacity-0 focus-within:opacity-100",
          "group-hover/folder:opacity-100",
        )}
      >
        <button
          type="button"
          className={cn(ICON_BUTTON, "size-6 [&_svg]:size-3.5")}
          aria-label={`New chat in ${project.name}`}
          title={`New chat in ${project.name}`}
          onClick={() => actions.onNewChat(project.id)}
        >
          <SquarePen />
        </button>
      </span>
      {!isCollapsed && tasks.length > 0 && (
        <ul className="mt-px flex flex-col gap-px">
          {tasks.map((task) => (
            <ThreadRow key={task.id} task={task} isActive={task.id === selectedTaskId} actions={actions} />
          ))}
        </ul>
      )}
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
        "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-sm font-medium text-sidebar-muted-foreground",
        "hover:bg-sidebar-row-hover focus-within:bg-sidebar-row-hover focus-within:text-sidebar-foreground",
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
  const { workspace, tasks, selectedTaskId, isOpen, isBoardActive, header, actions } = props;
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const isSearching = query.trim().length > 0;

  function toggleProject(projectId: string) {
    const next = new Set(collapsedProjects);
    if (next.has(projectId)) next.delete(projectId);
    else next.add(projectId);
    setCollapsedProjects(next);
  }

  const folders = workspace.projects
    .map((project) => ({
      project,
      tasks: tasks.filter((task) => task.projectId === project.id && (!isSearching || matchesQuery(task, query))),
    }))
    .filter((folder) => !isSearching || folder.tasks.length > 0);

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
          className="flex h-(--topbar-height) shrink-0 items-center ps-[calc(var(--traffic-light-inset)+2.25rem)] pe-3"
        >
          {header}
        </div>
        <div className="flex shrink-0 items-center gap-1 p-2">
          <SearchField query={query} onChange={setQuery} />
          <button
            type="button"
            className={ICON_BUTTON}
            aria-label="Add project"
            title="Add project"
            onClick={actions.onAddProject}
          >
            <FolderPlus />
          </button>
          <button
            type="button"
            className={ICON_BUTTON}
            aria-label="New chat"
            title="New chat (⌘N)"
            onClick={() => actions.onNewChat()}
          >
            <SquarePen />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {workspace.projects.length === 0 && <EmptyProjects onAddProject={actions.onAddProject} />}
          {isSearching && folders.length === 0 && (
            <p role="status" className="px-2 py-6 text-center text-xs text-sidebar-muted-foreground">
              No chats found
            </p>
          )}
          <ul className="flex flex-col">
            {folders.map((folder) => (
              <ProjectFolder
                key={folder.project.id}
                project={folder.project}
                tasks={folder.tasks}
                selectedTaskId={selectedTaskId}
                isCollapsed={!isSearching && collapsedProjects.has(folder.project.id)}
                onToggle={() => toggleProject(folder.project.id)}
                actions={actions}
              />
            ))}
          </ul>
        </nav>
        <div className="flex shrink-0 flex-row items-center px-2 pt-1 pb-2">
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
