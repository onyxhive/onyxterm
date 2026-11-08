import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderGit2, FolderPlus, Pencil, Plus, X } from "lucide-react";
import type { Task, Workspace } from "../types";
import { isWaiting } from "../status";
import { NameField } from "./NameField";

export interface WorkspaceActions {
  onSelect: (workspaceId: string) => void;
  onCreate: (name: string) => void;
  onRename: (workspaceId: string, name: string) => void;
  onAddProject: () => void;
  onRemoveProject: (projectId: string) => void;
}

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  current: Workspace;
  tasks: Task[];
  actions: WorkspaceActions;
}

type Editing = { kind: "none" } | { kind: "create" } | { kind: "rename"; workspaceId: string };

const NOT_EDITING: Editing = { kind: "none" };

function describeWorkspace(workspace: Workspace, tasks: Task[]): string {
  const projectIds = new Set(workspace.projects.map((project) => project.id));
  const workspaceTasks = tasks.filter((task) => projectIds.has(task.projectId));
  const running = workspaceTasks.filter((task) => task.status === "running").length;
  const waiting = workspaceTasks.filter((task) => isWaiting(task.status)).length;
  const projectCount = `${workspace.projects.length} project${workspace.projects.length === 1 ? "" : "s"}`;
  const activity = waiting > 0 ? `${waiting} waiting` : running > 0 ? `${running} running` : "idle";
  return `${projectCount}, ${activity}`;
}

export function WorkspaceMark({ name }: { name: string }) {
  return (
    <span className="workspace-mark" aria-hidden="true">
      {name.charAt(0)}
    </span>
  );
}

export function WorkspaceSwitcher({ workspaces, current, tasks, actions }: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Editing>(NOT_EDITING);
  const rootRef = useRef<HTMLDivElement>(null);
  const { onSelect } = actions;

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

  useEffect(() => {
    if (!isOpen) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function close() {
    setIsOpen(false);
    setEditing(NOT_EDITING);
  }

  function choose(workspaceId: string) {
    onSelect(workspaceId);
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
        <div className="switcher__row">
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
      <button
        type="button"
        className="switcher__row"
        aria-current={isCurrent}
        onClick={() => choose(workspace.id)}
        onDoubleClick={() => setEditing({ kind: "rename", workspaceId: workspace.id })}
      >
        <WorkspaceMark name={workspace.name} />
        <span className="switcher__text">
          <span className="switcher__name">{workspace.name}</span>
          <span className="switcher__meta">{describeWorkspace(workspace, tasks)}</span>
        </span>
        {isCurrent ? <Check size={14} /> : <kbd>⌘{index + 1}</kbd>}
      </button>
    );
  }

  return (
    <div className="switcher" ref={rootRef}>
      <button
        type="button"
        className="switcher__trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
      >
        <WorkspaceMark name={current.name} />
        <span>{current.name}</span>
        <ChevronDown size={13} className="switcher__chevron" />
      </button>
      {isOpen && (
        <div className="popover switcher__popover" role="dialog" aria-label="Workspaces">
          <div className="popover__heading">Workspaces</div>
          {workspaces.map((workspace, index) => (
            <div key={workspace.id} className="switcher__workspace">
              {renderWorkspaceRow(workspace, index)}
              {workspace.id === current.id && workspace.projects.length > 0 && (
                <ul className="switcher__projects">
                  {workspace.projects.map((project) => (
                    <li key={project.id}>
                      <FolderGit2 size={13} />
                      <span>{project.name}</span>
                      <span className="switcher__path" title={project.path}>
                        {project.path}
                      </span>
                      <button
                        type="button"
                        className="icon-button icon-button--small"
                        aria-label={`Remove ${project.name}`}
                        title="Remove from workspace"
                        onClick={() => actions.onRemoveProject(project.id)}
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <div className="popover__divider" />
          <button type="button" className="popover__action" onClick={addProject}>
            <FolderPlus size={14} />
            Add project…
          </button>
          <button
            type="button"
            className="popover__action"
            onClick={() => setEditing({ kind: "rename", workspaceId: current.id })}
          >
            <Pencil size={14} />
            Rename {current.name}
          </button>
          {editing.kind === "create" ? (
            <div className="popover__action">
              <Plus size={14} />
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
            <button type="button" className="popover__action" onClick={() => setEditing({ kind: "create" })}>
              <Plus size={14} />
              New workspace
            </button>
          )}
        </div>
      )}
    </div>
  );
}
