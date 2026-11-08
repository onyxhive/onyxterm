import type { Task } from "../types";
import { STATUS_GROUPS, tasksInGroup, taskLabel } from "../status";
import { StatusGlyph } from "./StatusGlyph";

interface BoardProps {
  tasks: Task[];
  projectName: (projectId: string) => string;
  onOpen: (taskId: string) => void;
}

export function Board({ tasks, projectName, onOpen }: BoardProps) {
  return (
    <div className="board">
      <header className="board__header">
        <h1 className="board__title">Board</h1>
        <span className="board__count">{tasks.length} chats</span>
      </header>
      <div className="board__lanes">
        {STATUS_GROUPS.map((group) => {
          const laneTasks = tasksInGroup(tasks, group);
          return (
            <section key={group.id} className="lane" aria-label={group.title}>
              <header className="lane__header">
                <span>{group.title}</span>
                <span className="lane__count">{laneTasks.length}</span>
              </header>
              <ul className="lane__cards">
                {laneTasks.map((task) => (
                  <li key={task.id}>
                    <button type="button" className="board-card" onClick={() => onOpen(task.id)}>
                      <span className="board-card__title">
                        <StatusGlyph status={task.status} />
                        {task.title}
                      </span>
                      <span className="board-card__project">{projectName(task.projectId)}</span>
                      <span className="board-card__footer">
                        <span>{taskLabel(task)}</span>
                        <span className="board-card__time">{task.elapsed}</span>
                      </span>
                    </button>
                  </li>
                ))}
                {laneTasks.length === 0 && <li className="lane__empty">Nothing here</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
