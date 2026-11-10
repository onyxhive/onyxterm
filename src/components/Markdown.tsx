import type { ComponentProps } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownCodeBlock, MarkdownStreamingContext } from "./MarkdownCodeBlock";
import { cn } from "./ui";

const REMARK_PLUGINS = [remarkGfm];
function MarkdownTable({ children }: ComponentProps<"table">) {
  return (
    <div className="chat-markdown-table">
      <table>{children}</table>
    </div>
  );
}

const COMPONENTS: Components = { pre: MarkdownCodeBlock, table: MarkdownTable };

interface MarkdownProps {
  source: string;
  isStreaming?: boolean;
  className?: string;
  remarkPlugins?: Options["remarkPlugins"];
}

export function Markdown({ source, isStreaming = false, className, remarkPlugins = REMARK_PLUGINS }: MarkdownProps) {
  return (
    <div
      data-streaming={isStreaming ? "" : undefined}
      className={cn(
        "chat-markdown w-full min-w-0 text-sm leading-relaxed text-foreground/90 [overflow-wrap:anywhere]",
        className,
      )}
    >
      <MarkdownStreamingContext value={isStreaming}>
        <ReactMarkdown remarkPlugins={remarkPlugins} components={COMPONENTS}>
          {source}
        </ReactMarkdown>
      </MarkdownStreamingContext>
    </div>
  );
}
