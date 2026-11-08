import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useIsFullscreen(): boolean {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const syncFullscreen = () => void appWindow.isFullscreen().then(setIsFullscreen);
    syncFullscreen();
    const stopListening = appWindow.onResized(syncFullscreen);
    return () => void stopListening.then((unlisten) => unlisten());
  }, []);

  return isFullscreen;
}
