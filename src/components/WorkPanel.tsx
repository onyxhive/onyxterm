import { FileDiff, FolderGit2, Play } from "lucide-react";
import type { Project, Work } from "../types";

interface WorkPanelProps {
  work: Work;
  project: Project | undefined;
}

function totalLines(work: Work, key: "added" | "removed"): number {
  return work.files.reduce((sum, file) => sum + file[key], 0);
}

export function WorkPanel({ work, project }: WorkPanelProps) {
  return (
    <aside className="work-panel" aria-label="Work">
      <header className="work-panel__header" title={project?.path}>
        <FolderGit2 size={14} />
        <span className="work-panel__project">{project?.name ?? "removed project"}</span>
        <span className="work-panel__path">{project?.path}</span>
      </header>
      <section className="work-panel__section">
        <h2 className="work-panel__heading">Running now</h2>
        {work.runningNow ? (
          <code className="work-panel__command">
            <Play size={11} fill="currentColor" />
            {work.runningNow}
          </code>
        ) : (
          <p className="work-panel__empty">Nothing is running.</p>
        )}
      </section>
      <section className="work-panel__section">
        <div className="work-panel__row">
          <h2 className="work-panel__heading">Changed files</h2>
          <span className="work-panel__value">
            <span className="diff-added">+{totalLines(work, "added")}</span>{" "}
            <span className="diff-removed">−{totalLines(work, "removed")}</span>
          </span>
        </div>
        {work.files.length === 0 && <p className="work-panel__empty">No changes yet.</p>}
        <ul className="file-list">
          {work.files.map((file) => (
            <li key={file.path} className="file-list__item">
              <FileDiff size={13} />
              <span className="file-list__path" title={file.path}>
                {file.path.split("/").pop()}
              </span>
              <span className="diff-added">+{file.added}</span>
              {file.removed > 0 && <span className="diff-removed">−{file.removed}</span>}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
