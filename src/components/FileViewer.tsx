import "../styles/code.css";
import { useEffect, useState } from "react";
import { AtSign, SquareArrowOutUpRight, X } from "lucide-react";
import { highlightedHtml, languageOf } from "../highlight";
import type { FileContent } from "../workbenchApi";
import { CopyButton } from "./CopyButton";
import { FileIcon } from "./FileIcon";
import { cn, FOCUS_RING } from "./ui";

const VIEWER_ACTION = cn(
  "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-(--control-radius)",
  "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none",
  "disabled:opacity-40 [&_svg]:size-3.5",
  FOCUS_RING,
);

export interface FileViewerActions {
  onMention: (path: string) => void;
  onOpenInEditor: (() => void) | null;
  onClose: () => void;
}

interface FileViewerProps {
  path: string;
  content: FileContent | null;
  error: string | null;
  editorName: string | null;
  actions: FileViewerActions;
}

function useHighlightedHtml(text: string, path: string): string | null {
  const [html, setHtml] = useState<{ text: string; value: string | null } | null>(null);

  useEffect(() => {
    let isCurrent = true;
    highlightedHtml(text, languageOf(path)).then(
      (value) => isCurrent && setHtml({ text, value }),
      () => isCurrent && setHtml({ text, value: null }),
    );
    return () => {
      isCurrent = false;
    };
  }, [text, path]);

  return html?.text === text ? html.value : null;
}

function lineNumbers(text: string): string {
  const count = text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length;
  return Array.from({ length: Math.max(count, 1) }, (_, index) => index + 1).join("\n");
}

function SourceText({ text, path }: { text: string; path: string }) {
  const html = useHighlightedHtml(text, path);
  return (
    <div className="flex min-w-max font-mono text-xs leading-5">
      <pre
        aria-hidden
        className="sticky left-0 shrink-0 bg-background ps-3 pe-3 text-right text-muted-foreground/50 select-none"
      >
        {lineNumbers(text)}
      </pre>
      <pre className="code-view pe-6 text-foreground/90">
        {html === null ? <code>{text}</code> : <code dangerouslySetInnerHTML={{ __html: html }} />}
      </pre>
    </div>
  );
}

function ViewerBody({ content, error, path }: Pick<FileViewerProps, "content" | "error" | "path">) {
  if (error) return <p className="p-4 text-xs text-error-foreground">{error}</p>;
  if (!content) return <p className="p-4 text-xs text-muted-foreground">Loading the file…</p>;
  if (content.text === null) return <p className="p-4 text-xs text-muted-foreground">This is a binary file.</p>;
  return (
    <>
      {content.isTruncated && (
        <p className="border-b border-border px-3 py-1.5 text-2xs text-muted-foreground">
          Showing the first 1 MB of this file.
        </p>
      )}
      <div className="py-2">
        <SourceText text={content.text} path={path} />
      </div>
    </>
  );
}

export function FileViewer({ path, content, error, editorName, actions }: FileViewerProps) {
  const openTitle = editorName ? `Open in ${editorName}` : "Pick an editor in thread details first";
  return (
    <section aria-label={`File ${path}`} className="flex min-h-0 flex-1 flex-col border-t border-border">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <FileIcon name={path} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground" title={path}>
          {path}
        </span>
        <button
          type="button"
          className={VIEWER_ACTION}
          aria-label="Mention in chat"
          title="Mention in chat"
          onClick={() => actions.onMention(path)}
        >
          <AtSign />
        </button>
        <CopyButton text={path} label="Copy path" variant="code" />
        <span title={openTitle} className="inline-flex">
          <button
            type="button"
            className={VIEWER_ACTION}
            aria-label={openTitle}
            disabled={!actions.onOpenInEditor}
            onClick={actions.onOpenInEditor ?? undefined}
          >
            <SquareArrowOutUpRight />
          </button>
        </span>
        <button
          type="button"
          className={VIEWER_ACTION}
          aria-label="Close file"
          title="Close file"
          onClick={actions.onClose}
        >
          <X />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <ViewerBody content={content} error={error} path={path} />
      </div>
    </section>
  );
}
