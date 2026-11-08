import { useEffect, useState } from "react";
import { cn } from "./ui";

const TICK_MS = 1000;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  if (minutes === 0) return `${totalSeconds}s`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours === 0) return `${minutes}m ${String(totalSeconds % SECONDS_PER_MINUTE).padStart(2, "0")}s`;
  return `${hours}h ${String(minutes % MINUTES_PER_HOUR).padStart(2, "0")}m`;
}

function secondsSince(since: number): number {
  return Math.max(0, Math.floor((Date.now() - since) / MS_PER_SECOND));
}

export function WorkingRow({ since }: { since: number }) {
  const [seconds, setSeconds] = useState(secondsSince(since));

  useEffect(() => {
    setSeconds(secondsSince(since));
    const timer = window.setInterval(() => setSeconds(secondsSince(since)), TICK_MS);
    return () => window.clearInterval(timer);
  }, [since]);

  return (
    <div role="status" className="border-b border-border/60 pt-1 pb-2">
      <div className={cn(
          "flex h-6 min-w-0 items-baseline gap-2 px-1 text-sm leading-relaxed tabular-nums",
          "text-muted-foreground",
        )}>
        <span className="live-tool-shine">Working for {formatDuration(seconds)}</span>
      </div>
    </div>
  );
}
