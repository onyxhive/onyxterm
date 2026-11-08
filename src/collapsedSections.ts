import type { Settings } from "./api";

const SETTING_PREFIX = "sidebarSectionCollapsed.";
const COLLAPSED_BY_DEFAULT = new Set(["done"]);

export interface CollapsedSections {
  isCollapsed: (sectionId: string) => boolean;
  toggle: (sectionId: string) => void;
}

export function collapsedSectionsFrom(
  settings: Settings | null,
  remember: (key: string, value: string) => void,
): CollapsedSections {
  function isCollapsed(sectionId: string): boolean {
    const saved = settings?.[SETTING_PREFIX + sectionId];
    return saved === undefined ? COLLAPSED_BY_DEFAULT.has(sectionId) : saved === "true";
  }

  function toggle(sectionId: string) {
    remember(SETTING_PREFIX + sectionId, String(!isCollapsed(sectionId)));
  }

  return { isCollapsed, toggle };
}
