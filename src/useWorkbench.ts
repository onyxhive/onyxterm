import { useCallback, useState } from "react";
import { clampedDrawerHeight } from "./components/TerminalDrawer";

const DEFAULT_TERMINAL_HEIGHT = 280;

export interface SubagentsPanelState {
  agentId: string | null;
}

export interface Workbench {
  isTerminalOpen: boolean;
  terminalHeight: number;
  isFilesPanelOpen: boolean;
  subagentsPanel: SubagentsPanelState | null;
  toggleTerminal: () => void;
  showTerminal: () => void;
  hideTerminal: () => void;
  resizeTerminal: (height: number) => void;
  toggleFilesPanel: () => void;
  closeFilesPanel: () => void;
  openSubagentsPanel: (agentId: string | null) => void;
  closeSubagentsPanel: () => void;
}

export function useWorkbench(): Workbench {
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(() => clampedDrawerHeight(DEFAULT_TERMINAL_HEIGHT));
  const [isFilesPanelOpen, setIsFilesPanelOpen] = useState(false);
  const [subagentsPanel, setSubagentsPanel] = useState<SubagentsPanelState | null>(null);

  return {
    isTerminalOpen,
    terminalHeight,
    isFilesPanelOpen,
    subagentsPanel,
    toggleTerminal: useCallback(() => setIsTerminalOpen((isOpen) => !isOpen), []),
    showTerminal: useCallback(() => setIsTerminalOpen(true), []),
    hideTerminal: useCallback(() => setIsTerminalOpen(false), []),
    resizeTerminal: setTerminalHeight,
    toggleFilesPanel: useCallback(() => setIsFilesPanelOpen((isOpen) => !isOpen), []),
    closeFilesPanel: useCallback(() => setIsFilesPanelOpen(false), []),
    openSubagentsPanel: useCallback((agentId: string | null) => setSubagentsPanel({ agentId }), []),
    closeSubagentsPanel: useCallback(() => setSubagentsPanel(null), []),
  };
}
