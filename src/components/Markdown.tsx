import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownCodeBlock } from "./MarkdownCodeBlock";
import { cn } from "./ui";

const REMARK_PLUGINS = [remarkGfm];
const COMPONENTS: Components = { pre: MarkdownCodeBlock };

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
      <ReactMarkdown remarkPlugins={remarkPlugins} components={COMPONENTS}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
