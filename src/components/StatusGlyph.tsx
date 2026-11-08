import type { ReactNode } from "react";
import type { TaskStatus } from "../types";
import { STATUS_LABEL } from "../status";

const GLYPH_SHAPES: Record<TaskStatus, ReactNode> = {
  running: <circle cx="5" cy="5" r="4" fill="currentColor" />,
  permission: <path d="M5 .6L9.4 5 5 9.4.6 5z" fill="currentColor" />,
  question: <circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.9" />,
  review: (
    <>
      <circle cx="5" cy="5" r="3.7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5" cy="5" r="1.6" fill="currentColor" />
    </>
  ),
  failed: <rect x="1.2" y="1.2" width="7.6" height="7.6" rx="1.8" fill="currentColor" />,
  done: (
    <>
      <circle cx="5" cy="5" r="4.3" fill="currentColor" />
      <path
        className="glyph__check"
        d="M3 5.1l1.4 1.4L7 3.9"
        fill="none"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
};

interface StatusGlyphProps {
  status: TaskStatus;
  size?: number;
}

export function StatusGlyph({ status, size = 10 }: StatusGlyphProps) {
  return (
    <svg
      className={`glyph glyph--${status}`}
      width={size}
      height={size}
      viewBox="0 0 10 10"
      role="img"
      aria-label={STATUS_LABEL[status]}
    >
      {GLYPH_SHAPES[status]}
    </svg>
  );
}
