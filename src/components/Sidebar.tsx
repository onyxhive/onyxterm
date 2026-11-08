import { useState, type ReactNode } from "react";
import { ChevronRight, SquarePen } from "lucide-react";
import type { Task } from "../types";
import { STATUS_GROUPS, tasksInGroup } from "../status";
import { StatusGlyph } from "./StatusGlyph";

interface SidebarProps {
  tasks: Task[];
  selectedTaskId: string | null;
  isNewChatActive: boolean;
  isOpen: boolean;
  onSelect: (taskId: string) => void;
  onNewChat: () => void;
  footer: ReactNode;
}

export function Sidebar(props: SidebarProps) {
  const { tasks, selectedTaskId, isNewChatActive, isOpen, onSelect, onNewChat, footer } = props;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(["done"]));

  function toggleGroup(groupId: string) {
    const next = new Set(collapsedGroups);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    setCollapsedGroups(next);
  }

  return (
    <aside className="sidebar" aria-label="Tasks" data-open={isOpen} inert={!isOpen}>
      <div className="sidebar__inner">
        <button
          type="button"
          className="sidebar__new-chat"
          aria-current={isNewChatActive}
          onClick={onNewChat}
        >
          <SquarePen size={16} strokeWidth={1.75} />
          New chat
          <kbd>⌘N</kbd>
        </button>
        <nav className="sidebar__groups">
          {STATUS_GROUPS.map((group) => {
            const groupTasks = tasksInGroup(tasks, group);
            const isCollapsed = collapsedGroups.has(group.id);
            return (
              <section
                key={group.id}
                className="task-group"
                data-group={group.id}
                data-empty={groupTasks.length === 0}
              >
                <button
                  type="button"
                  className="task-group__header"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span>{group.title}</span>
                  <ChevronRight size={12} className="task-group__chevron" />
                  <span className="task-group__count">{groupTasks.length}</span>
                </button>
                {!isCollapsed && (
                  <ul className="task-group__list">
                    {groupTasks.map((task) => (
                      <li key={task.id}>
                        <button
                          type="button"
                          className="task-row"
                          aria-current={task.id === selectedTaskId}
                          onClick={() => onSelect(task.id)}
                        >
                          <StatusGlyph status={task.status} size={8} />
                          <span className="task-row__title">{task.title}</span>
                          <span className="task-row__time">{task.elapsed}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </nav>
        <div className="sidebar__footer">{footer}</div>
      </div>
    </aside>
  );
}
