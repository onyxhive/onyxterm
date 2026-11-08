import { useEffect, useState } from "react";
import { Square } from "lucide-react";

interface WorkingLineProps {
  startSeconds: number;
  activity: string;
  onStop: () => void;
}

const SECONDS_PER_MINUTE = 60;
const TICK_MS = 1000;

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function WorkingLine({ startSeconds, activity, onStop }: WorkingLineProps) {
  const [seconds, setSeconds] = useState(startSeconds);

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((current) => current + 1), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="working" role="status">
      <span className="working__pulse" aria-hidden="true" />
      <span className="working__label">Working…</span>
      <span className="working__time">{formatDuration(seconds)}</span>
      {activity && <code className="working__activity">{activity}</code>}
      <button type="button" className="button button--small" onClick={onStop}>
        <Square size={10} fill="currentColor" />
        Stop
      </button>
    </div>
  );
}
