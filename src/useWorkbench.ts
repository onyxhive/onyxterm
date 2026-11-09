import { useCallback, useState } from "react";
import { clampedDrawerHeight } from "./components/TerminalDrawer";

const DEFAULT_TERMINAL_HEIGHT = 280;

export type SidePanelTab = "files" | "changes" | "agents";

export interface Workbench {
  isTerminalOpen: boolean;
  terminalHeight: number;
  sidePanelTab: SidePanelTab;
  openedAgentId: string | null;
  toggleTerminal: () => void;
  showTerminal: () => void;
  hideTerminal: () => void;
  resizeTerminal: (height: number) => void;
  selectSidePanelTab: (tab: SidePanelTab) => void;
  openAgent: (agentId: string | null) => void;
}

export function useWorkbench(): Workbench {
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(() => clampedDrawerHeight(DEFAULT_TERMINAL_HEIGHT));
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>("changes");
  const [openedAgentId, setOpenedAgentId] = useState<string | null>(null);

  return {
    isTerminalOpen,
    terminalHeight,
    sidePanelTab,
    openedAgentId,
    toggleTerminal: useCallback(() => setIsTerminalOpen((isOpen) => !isOpen), []),
    showTerminal: useCallback(() => setIsTerminalOpen(true), []),
    hideTerminal: useCallback(() => setIsTerminalOpen(false), []),
    resizeTerminal: setTerminalHeight,
    selectSidePanelTab: setSidePanelTab,
    openAgent: useCallback((agentId: string | null) => {
      setOpenedAgentId(agentId);
      setSidePanelTab("agents");
    }, []),
  };
}
