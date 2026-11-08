import { useLayoutEffect, type RefObject } from "react";

const DOCK_HEIGHT_VARIABLE = "--dock-height";

export function useDockHeight(dockRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const dock = dockRef.current;
    const body = dock?.closest<HTMLElement>(".app__body");
    if (!dock || !body) return;
    const observer = new ResizeObserver(() => {
      body.style.setProperty(DOCK_HEIGHT_VARIABLE, `${dock.offsetHeight}px`);
    });
    observer.observe(dock);
    return () => {
      observer.disconnect();
      body.style.removeProperty(DOCK_HEIGHT_VARIABLE);
    };
  }, [dockRef]);
}
