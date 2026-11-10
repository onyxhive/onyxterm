import { useEffect, useState, useSyncExternalStore } from "react";
import { renderedMermaidSvg } from "../mermaid";
import { isDarkScheme, onSchemeChange } from "../terminalTheme";

export function useMermaidSvg(source: string | null): string | null {
  const isDark = useSyncExternalStore(onSchemeChange, isDarkScheme);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    if (source === null) return;
    let isCurrent = true;
    void renderedMermaidSvg(source, isDark).then((rendered) => {
      if (isCurrent) setSvg(rendered);
    });
    return () => {
      isCurrent = false;
    };
  }, [source, isDark]);

  return source === null ? null : svg;
}
