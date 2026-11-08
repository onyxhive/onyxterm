import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownCodeBlock } from "./MarkdownCodeBlock";
import { cn } from "./ui";

const REMARK_PLUGINS = [remarkGfm];
const COMPONENTS: Components = { pre: MarkdownCodeBlock };

interface MarkdownProps {
  source: string;
  isStreaming?: boolean;
  className?: string;
}

export function Markdown({ source, isStreaming = false, className }: MarkdownProps) {
  return (
    <div
      data-streaming={isStreaming ? "" : undefined}
      className={cn(
        "chat-markdown w-full min-w-0 text-sm leading-relaxed text-foreground/90 [overflow-wrap:anywhere]",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
