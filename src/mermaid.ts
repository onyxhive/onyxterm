import type { Mermaid } from "mermaid";

const DIAGRAM_ID_PREFIX = "chat-mermaid-";
const RENDER_CONTAINER_ID_PREFIX = "d";
const RENDER_TIMEOUT_MS = 15_000;
const RENDER_TIMED_OUT = "rendering took too long";

let loaded: Promise<Mermaid> | undefined;
let pendingRender: Promise<unknown> = Promise.resolve();
let renderCount = 0;

function loadedMermaid(): Promise<Mermaid> {
  loaded ??= import("mermaid").then(
    (module) => module.default,
    (error: unknown) => {
      loaded = undefined;
      throw error;
    },
  );
  return loaded;
}

function removeRenderLeftovers(id: string) {
  document.getElementById(id)?.remove();
  document.getElementById(`${RENDER_CONTAINER_ID_PREFIX}${id}`)?.remove();
}

async function svgOf(source: string, isDark: boolean): Promise<string> {
  const mermaid = await loadedMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: isDark ? "dark" : "default",
  });
  await mermaid.parse(source);
  renderCount += 1;
  const id = `${DIAGRAM_ID_PREFIX}${renderCount}`;
  try {
    return (await mermaid.render(id, source)).svg;
  } finally {
    removeRenderLeftovers(id);
  }
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(RENDER_TIMED_OUT)), RENDER_TIMEOUT_MS);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function renderedMermaidSvg(source: string, isDark: boolean): Promise<string> {
  const rendered = pendingRender.then(() => withTimeout(svgOf(source, isDark)));
  pendingRender = rendered.catch(() => null);
  return rendered;
}
