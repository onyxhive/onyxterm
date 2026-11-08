import { useState } from "react";
import { ChevronRight, SquarePen } from "lucide-react";
import type { Task } from "../mock";
import { STATUS_GROUPS, tasksInGroup, taskLabel } from "../status";
import { StatusGlyph } from "./StatusGlyph";

interface SidebarProps {
  tasks: Task[];
  selectedTaskId: string | null;
  isNewChatActive: boolean;
  isOpen: boolean;
  onSelect: (taskId: string) => void;
  onNewChat: () => void;
}

export function Sidebar({ tasks, selectedTaskId, isNewChatActive, isOpen, onSelect, onNewChat }: SidebarProps) {
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
          className="new-chat-button"
          aria-current={isNewChatActive}
          onClick={onNewChat}
        >
          <SquarePen size={15} />
          New chat
          <kbd>⌘N</kbd>
        </button>
        <nav className="sidebar__groups">
          {STATUS_GROUPS.map((group) => {
            const groupTasks = tasksInGroup(tasks, group);
            const isCollapsed = collapsedGroups.has(group.id);
            return (
              <section key={group.id} className="task-group" data-group={group.id}>
                <button
                  type="button"
                  className="task-group__header"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleGroup(group.id)}
                >
                  <ChevronRight size={12} className="task-group__chevron" />
                  <span>{group.title}</span>
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
                          <StatusGlyph status={task.status} />
                          <span className="task-row__text">
                            <span className="task-row__title">{task.title}</span>
                            <span className="task-row__label">{taskLabel(task)}</span>
                          </span>
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
      </div>
    </aside>
  );
}
