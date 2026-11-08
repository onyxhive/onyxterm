import { useEffect, useState } from "react";

const TICK_MS = 1000;

export function useNow(isTicking: boolean): number {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    setNow(Date.now());
    if (!isTicking) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [isTicking]);

  return now;
}
