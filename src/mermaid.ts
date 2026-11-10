import type { Mermaid } from "mermaid";

const DIAGRAM_ID_PREFIX = "chat-mermaid-";
const RENDER_CONTAINER_ID_PREFIX = "d";

let loaded: Promise<Mermaid> | undefined;
let pendingRender: Promise<unknown> = Promise.resolve();
let renderCount = 0;

async function loadedMermaid(): Promise<Mermaid> {
  loaded ??= import("mermaid").then((module) => module.default);
  return loaded;
}

function removeRenderLeftovers(id: string) {
  document.getElementById(id)?.remove();
  document.getElementById(`${RENDER_CONTAINER_ID_PREFIX}${id}`)?.remove();
}

async function svgOf(source: string, isDark: boolean): Promise<string | null> {
  const mermaid = await loadedMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: isDark ? "dark" : "default",
  });
  if (!(await mermaid.parse(source, { suppressErrors: true }))) return null;
  renderCount += 1;
  const id = `${DIAGRAM_ID_PREFIX}${renderCount}`;
  try {
    return (await mermaid.render(id, source)).svg;
  } catch {
    return null;
  } finally {
    removeRenderLeftovers(id);
  }
}

export function renderedMermaidSvg(source: string, isDark: boolean): Promise<string | null> {
  const rendered = pendingRender.then(() => svgOf(source, isDark));
  pendingRender = rendered.catch(() => null);
  return rendered;
}
