import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Ellipsis, Folder, FolderPlus, Pencil, Plus, X } from "lucide-react";
import type { Tag, Task, Workspace } from "../types";
import { isWaiting } from "../status";
import { NameField } from "./NameField";
import { TagChip } from "./TagChip";
import { cn, FOCUS_RING, ICON_BUTTON, Kbd, MENU_ITEM, MENU_POPUP, MenuLabel, MenuSeparator } from "./ui";
import { useDismiss } from "./useDismiss";
import { useWorkspaceDrag } from "./useWorkspaceDrag";
import { WorkspaceSettingsDialog, type WorkspaceSettingsActions } from "./WorkspaceSettingsDialog";

export interface WorkspaceActions extends WorkspaceSettingsActions {
  onSelect: (workspaceId: string) => void;
  onCreate: (name: string) => void;
  onReorder: (workspaceIds: string[]) => void;
  onAddProject: () => void;
  onRemoveProject: (projectId: string) => void;
}

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  current: Workspace;
  tags: Tag[];
  tasks: Task[];
  actions: WorkspaceActions;
}

type Editing = { kind: "none" } | { kind: "create" } | { kind: "rename"; workspaceId: string };

const NOT_EDITING: Editing = { kind: "none" };

const DROP_INDICATOR = "pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-primary";

function describeWorkspace(workspace: Workspace, tasks: Task[]): string {
  const projectIds = new Set(workspace.projects.map((project) => project.id));
  const workspaceTasks = tasks.filter((task) => projectIds.has(task.projectId));
  const running = workspaceTasks.filter((task) => task.status === "running").length;
  const waiting = workspaceTasks.filter((task) => isWaiting(task.status)).length;
  const projectCount = `${workspace.projects.length} project${workspace.projects.length === 1 ? "" : "s"}`;
  const activity = waiting > 0 ? `${waiting} waiting` : running > 0 ? `${running} running` : "idle";
  return `${projectCount}, ${activity}`;
}

function WorkspaceMark({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md bg-foreground text-[11px] font-semibold",
        "text-background uppercase",
      )}
    >
      {name.charAt(0)}
    </span>
  );
}

export function WorkspaceSwitcher({ workspaces, current, tags, tasks, actions }: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Editing>(NOT_EDITING);
  const [settingsWorkspaceId, setSettingsWorkspaceId] = useState<string | null>(null);
  const settingsWorkspace = workspaces.find((workspace) => workspace.id === settingsWorkspaceId) ?? null;
  const rootRef = useRef<HTMLDivElement>(null);
  const { onSelect } = actions;
  const drag = useWorkspaceDrag({
    workspaceIds: workspaces.map((workspace) => workspace.id),
    onReorder: actions.onReorder,
  });

  const close = useCallback(() => {
    setIsOpen(false);
    setEditing(NOT_EDITING);
  }, []);

  useDismiss(rootRef, isOpen, close);

  useEffect(() => {
    function selectByShortcut(event: KeyboardEvent) {
      if (!event.metaKey) return;
      const workspace = workspaces[Number(event.key) - 1];
      if (!workspace) return;
      event.preventDefault();
      onSelect(workspace.id);
    }
    window.addEventListener("keydown", selectByShortcut);
    return () => window.removeEventListener("keydown", selectByShortcut);
  }, [workspaces, onSelect]);

  function choose(workspaceId: string) {
    onSelect(workspaceId);
    close();
  }

  function openSettings(workspaceId: string) {
    setSettingsWorkspaceId(workspaceId);
    close();
  }

  function addProject() {
    actions.onAddProject();
    close();
  }

  function renderWorkspaceRow(workspace: Workspace, index: number) {
    const isCurrent = workspace.id === current.id;
    if (editing.kind === "rename" && editing.workspaceId === workspace.id) {
      return (
        <div className={MENU_ITEM}>
          <WorkspaceMark name={workspace.name} />
          <NameField
            initialValue={workspace.name}
            label="Workspace name"
            onCommit={(name) => {
              actions.onRename(workspace.id, name);
              setEditing(NOT_EDITING);
            }}
            onCancel={() => setEditing(NOT_EDITING)}
          />
        </div>
      );
    }
    return (
      <div
        {...drag.sourceProps(workspace.id)}
        className={cn("group/workspace relative", drag.draggedId === workspace.id && "opacity-50")}
      >
        <button
          type="button"
          role="menuitemradio"
          aria-checked={isCurrent}
          className={cn(MENU_ITEM, "py-1.5")}
          onClick={() => choose(workspace.id)}
          onDoubleClick={() => setEditing({ kind: "rename", workspaceId: workspace.id })}
        >
          <WorkspaceMark name={workspace.name} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate font-medium">{workspace.name}</span>
              {workspace.tags.map((tag) => (
                <TagChip key={tag.id} tag={tag} />
              ))}
            </span>
            <span className="truncate text-xs text-muted-foreground">{describeWorkspace(workspace, tasks)}</span>
          </span>
          <span className="flex shrink-0 group-hover/workspace:invisible group-focus-within/workspace:invisible">
            {isCurrent ? <Check className="size-3.5" /> : <Kbd>⌘{index + 1}</Kbd>}
          </span>
        </button>
        <button
          type="button"
          className={cn(
            ICON_BUTTON,
            "absolute top-1/2 right-1.5 size-6 -translate-y-1/2 opacity-0 group-hover/workspace:opacity-100",
            "group-focus-within/workspace:opacity-100",
            "hover:bg-foreground/[0.08] [&_svg]:size-3.5",
          )}
          aria-label={`${workspace.name} settings`}
          title="Workspace settings"
          onClick={() => openSettings(workspace.id)}
        >
          <Ellipsis />
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        className={cn(
          "flex h-7 max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-sm font-medium",
          "tracking-tight text-foreground hover:bg-sidebar-row-hover aria-expanded:bg-sidebar-row-hover",
          FOCUS_RING,
        )}
      >
        <WorkspaceMark name={current.name} />
        <span className="truncate">{current.name}</span>
        <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" />
      </button>
      {isOpen && (
        <div role="menu" aria-label="Workspaces" className={cn(
            MENU_POPUP,
            "fixed top-[calc(var(--topbar-height)-0.5rem)] left-(--workspace-titlebar-content-left) w-72",
          )}>
          <MenuLabel>Workspaces</MenuLabel>
          {workspaces.map((workspace, index) => (
            <div key={workspace.id} className="relative" {...drag.targetProps(index)}>
              {drag.indicatorAt(index) === "before" && (
                <span aria-hidden="true" className={cn(DROP_INDICATOR, "-top-px")} />
              )}
              {renderWorkspaceRow(workspace, index)}
              {workspace.id === current.id && workspace.projects.length > 0 && (
                <ul className="mb-1 ms-4 flex flex-col border-l border-border ps-2">
                  {workspace.projects.map((project) => (
                    <li
                      key={project.id}
                      className="group/project flex h-7 min-w-0 items-center gap-2 rounded-sm px-1.5 hover:bg-accent"
                    >
                      <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="shrink-0 text-xs font-medium">{project.name}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={project.path}>
                        {project.path}
                      </span>
                      <button
                        type="button"
                        className={cn(ICON_BUTTON, "size-5 opacity-0 group-hover/project:opacity-100 [&_svg]:size-3")}
                        aria-label={`Remove ${project.name}`}
                        title="Remove from workspace"
                        onClick={() => actions.onRemoveProject(project.id)}
                      >
                        <X />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {drag.indicatorAt(index) === "after" && (
                <span aria-hidden="true" className={cn(DROP_INDICATOR, "-bottom-px")} />
              )}
            </div>
          ))}
          <MenuSeparator />
          <button type="button" className={MENU_ITEM} onClick={addProject}>
            <FolderPlus />
            Add project…
          </button>
          <button
            type="button"
            className={MENU_ITEM}
            onClick={() => setEditing({ kind: "rename", workspaceId: current.id })}
          >
            <Pencil />
            Rename {current.name}
          </button>
          {editing.kind === "create" ? (
            <div className={MENU_ITEM}>
              <Plus />
              <NameField
                initialValue=""
                label="New workspace name"
                onCommit={(name) => {
                  actions.onCreate(name);
                  setEditing(NOT_EDITING);
                }}
                onCancel={() => setEditing(NOT_EDITING)}
              />
            </div>
          ) : (
            <button type="button" className={MENU_ITEM} onClick={() => setEditing({ kind: "create" })}>
              <Plus />
              New workspace
            </button>
          )}
        </div>
      )}
      {settingsWorkspace && (
        <WorkspaceSettingsDialog
          key={settingsWorkspace.id}
          workspace={settingsWorkspace}
          tags={tags}
          actions={actions}
          onClose={() => setSettingsWorkspaceId(null)}
        />
      )}
    </div>
  );
}
