import { useState } from "react";
import { ChevronRight, ListChecks } from "lucide-react";
import type { Step } from "../mock";

interface StepsRowProps {
  steps: Step[];
  files: number;
}

function summarize(steps: Step[], files: number): string {
  const stepText = `Did ${steps.length} step${steps.length === 1 ? "" : "s"}`;
  if (files === 0) return stepText;
  return `${stepText}, ${files} file${files === 1 ? "" : "s"} changed`;
}

export function StepsRow({ steps, files }: StepsRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="steps" data-expanded={isExpanded}>
      <button
        type="button"
        className="steps__toggle"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ListChecks size={14} />
        <span>{summarize(steps, files)}</span>
        <ChevronRight size={13} className="steps__chevron" />
      </button>
      {isExpanded && (
        <ol className="steps__list">
          {steps.map((step, index) => (
            <li key={index}>
              <span className="steps__verb">{step.verb}</span>
              <span className="steps__detail">{step.detail}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
