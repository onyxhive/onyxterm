import { FileDiff, GitBranch, Play } from "lucide-react";
import type { Work } from "../mock";

interface WorkPanelProps {
  work: Work;
  projectName: string;
}

const PERCENT = 100;

function totalLines(work: Work, key: "added" | "removed"): number {
  return work.files.reduce((sum, file) => sum + file[key], 0);
}

export function WorkPanel({ work, projectName }: WorkPanelProps) {
  const percent = Math.round(work.progress * PERCENT);

  return (
    <aside className="work-panel" aria-label="Work">
      <section className="work-panel__section">
        <div className="work-panel__row">
          <h2 className="work-panel__heading">{work.phase}</h2>
          <span className="work-panel__value">{percent}%</span>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={PERCENT}>
          <div className="progress__bar" style={{ width: `${percent}%` }} />
        </div>
      </section>
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
      <section className="work-panel__section">
        <h2 className="work-panel__heading">Branch</h2>
        <div className="branch">
          <GitBranch size={13} />
          <code>{work.branch || "not created yet"}</code>
        </div>
        <p className="work-panel__empty">
          {projectName}, from {work.base}
        </p>
      </section>
    </aside>
  );
}
