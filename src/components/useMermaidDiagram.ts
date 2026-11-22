import { useEffect, useState, useSyncExternalStore } from "react";
import { renderedMermaidSvg } from "../mermaid";
import { isDarkScheme, onSchemeChange } from "../terminalTheme";

export interface MermaidDiagram {
  svg: string | null;
  error: string | null;
}

const NO_DIAGRAM: MermaidDiagram = { svg: null, error: null };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useMermaidDiagram(source: string | null): MermaidDiagram {
  const isDark = useSyncExternalStore(onSchemeChange, isDarkScheme);
  const [diagram, setDiagram] = useState<MermaidDiagram>(NO_DIAGRAM);

  useEffect(() => {
    if (source === null) return;
    let isCurrent = true;
    renderedMermaidSvg(source, isDark).then(
      (svg) => isCurrent && setDiagram({ svg, error: null }),
      (error: unknown) => isCurrent && setDiagram({ svg: null, error: messageOf(error) }),
    );
    return () => {
      isCurrent = false;
    };
  }, [source, isDark]);

  return source === null ? NO_DIAGRAM : diagram;
}
