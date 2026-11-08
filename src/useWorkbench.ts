import { useCallback, useState } from "react";
import { clampedDrawerHeight } from "./components/TerminalDrawer";

const DEFAULT_TERMINAL_HEIGHT = 280;

export interface Workbench {
  isTerminalOpen: boolean;
  terminalHeight: number;
  isFilesPanelOpen: boolean;
  toggleTerminal: () => void;
  showTerminal: () => void;
  hideTerminal: () => void;
  resizeTerminal: (height: number) => void;
  toggleFilesPanel: () => void;
  closeFilesPanel: () => void;
}

export function useWorkbench(): Workbench {
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(() => clampedDrawerHeight(DEFAULT_TERMINAL_HEIGHT));
  const [isFilesPanelOpen, setIsFilesPanelOpen] = useState(false);

  return {
    isTerminalOpen,
    terminalHeight,
    isFilesPanelOpen,
    toggleTerminal: useCallback(() => setIsTerminalOpen((isOpen) => !isOpen), []),
    showTerminal: useCallback(() => setIsTerminalOpen(true), []),
    hideTerminal: useCallback(() => setIsTerminalOpen(false), []),
    resizeTerminal: setTerminalHeight,
    toggleFilesPanel: useCallback(() => setIsFilesPanelOpen((isOpen) => !isOpen), []),
    closeFilesPanel: useCallback(() => setIsFilesPanelOpen(false), []),
  };
}
