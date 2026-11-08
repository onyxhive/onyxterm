import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const REMARK_PLUGINS = [remarkGfm];

export function Markdown({ source }: { source: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{source}</ReactMarkdown>
    </div>
  );
}
