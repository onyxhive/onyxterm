import { useEffect, useState } from "react";
import { Square } from "lucide-react";

interface WorkingLineProps {
  since: number;
  activity: string;
  onStop: () => void;
}

const SECONDS_PER_MINUTE = 60;
const TICK_MS = 1000;
const MS_PER_SECOND = 1000;

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function secondsSince(since: number): number {
  return Math.max(0, Math.floor((Date.now() - since) / MS_PER_SECOND));
}

export function WorkingLine({ since, activity, onStop }: WorkingLineProps) {
  const [seconds, setSeconds] = useState(secondsSince(since));

  useEffect(() => {
    setSeconds(secondsSince(since));
    const timer = window.setInterval(() => setSeconds(secondsSince(since)), TICK_MS);
    return () => window.clearInterval(timer);
  }, [since]);

  return (
    <div className="working" role="status">
      <span className="working__pulse" aria-hidden="true" />
      <span className="working__label">Working…</span>
      <span className="working__time">{formatDuration(seconds)}</span>
      {activity && <code className="working__activity">{activity}</code>}
      <button type="button" className="button button--quiet button--small" onClick={onStop}>
        <Square size={10} fill="currentColor" />
        Stop
      </button>
    </div>
  );
}
