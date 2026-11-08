import { useLayoutEffect, useState, type RefObject } from "react";

export function useDockHeight(dockRef: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const observer = new ResizeObserver(() => setHeight(dock.offsetHeight));
    observer.observe(dock);
    return () => observer.disconnect();
  }, [dockRef]);

  return height;
}
