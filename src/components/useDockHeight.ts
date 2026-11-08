import { useLayoutEffect, type RefObject } from "react";

const DOCK_HEIGHT_VARIABLE = "--dock-height";

export function useDockHeight(dockRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const dock = dockRef.current;
    const main = dock?.closest<HTMLElement>(".app__main");
    if (!dock || !main) return;
    const observer = new ResizeObserver(() => {
      main.style.setProperty(DOCK_HEIGHT_VARIABLE, `${dock.offsetHeight}px`);
    });
    observer.observe(dock);
    return () => {
      observer.disconnect();
      main.style.removeProperty(DOCK_HEIGHT_VARIABLE);
    };
  }, [dockRef]);
}
