import type { ReactNode } from "react";
import type { SidePanelTab } from "../useWorkbench";
import { Segmented, type SegmentedOption } from "./Segmented";
import { SIDE_PANEL } from "./ui";

const SIDE_PANEL_TABS: SegmentedOption<SidePanelTab>[] = [
  { value: "files", label: "Files" },
  { value: "changes", label: "Changes" },
  { value: "agents", label: "Agents" },
];

interface SidePanelProps {
  tab: SidePanelTab;
  onSelectTab: (tab: SidePanelTab) => void;
  children: ReactNode;
}

export function SidePanel({ tab, onSelectTab, children }: SidePanelProps) {
  return (
    <aside aria-label="Side panel" className={SIDE_PANEL}>
      <header
        data-tauri-drag-region
        className="flex h-(--topbar-height) shrink-0 items-center border-b border-border px-3"
      >
        <Segmented label="Side panel view" options={SIDE_PANEL_TABS} value={tab} onChange={onSelectTab} />
      </header>
      {children}
    </aside>
  );
}
