import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderGit2, Plus } from "lucide-react";
import type { Task, Workspace } from "../mock";
import { isWaiting } from "../status";

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  current: Workspace;
  tasks: Task[];
  onSelect: (workspaceId: string) => void;
}

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

export function WorkspaceSwitcher({ workspaces, current, tasks, onSelect }: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function choose(workspaceId: string) {
    onSelect(workspaceId);
    setIsOpen(false);
  }

  return (
    <div className="switcher" ref={rootRef}>
      <button
        type="button"
        className="switcher__trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
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
              <button
                type="button"
                className="switcher__row"
                aria-current={workspace.id === current.id}
                onClick={() => choose(workspace.id)}
              >
                <WorkspaceMark name={workspace.name} />
                <span className="switcher__text">
                  <span className="switcher__name">{workspace.name}</span>
                  <span className="switcher__meta">{describeWorkspace(workspace, tasks)}</span>
                </span>
                {workspace.id === current.id ? <Check size={14} /> : <kbd>⌘{index + 1}</kbd>}
              </button>
              {workspace.id === current.id && (
                <ul className="switcher__projects">
                  {workspace.projects.map((project) => (
                    <li key={project.id}>
                      <FolderGit2 size={13} />
                      <span>{project.name}</span>
                      <span className="switcher__path">{project.path}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <div className="popover__divider" />
          <button type="button" className="popover__action" onClick={() => setIsOpen(false)}>
            <Plus size={14} />
            Add project…
          </button>
        </div>
      )}
    </div>
  );
}
