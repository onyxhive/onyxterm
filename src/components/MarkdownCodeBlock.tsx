import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";
import { Code, Workflow } from "lucide-react";
import { CopyButton } from "./CopyButton";
import { cn, FOCUS_RING } from "./ui";
import { useMermaidSvg } from "./useMermaidSvg";

const LANGUAGE_CLASS_PREFIX = "language-";
const PLAIN_LANGUAGE = "text";
const MERMAID_LANGUAGE = "mermaid";

const VIEW_TOGGLE_BUTTON = cn(
  "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-(--control-radius)",
  "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-3",
  FOCUS_RING,
);

export const MarkdownStreamingContext = createContext(false);

interface CodeElementProps {
  className?: string;
  children?: unknown;
}

function codeElementOf(children: ComponentProps<"pre">["children"]): ReactElement<CodeElementProps> | null {
  const only = Children.toArray(children)[0];
  return isValidElement<CodeElementProps>(only) ? only : null;
}

function languageOf(className: string | undefined): string {
  const languageClass = className?.split(" ").find((name) => name.startsWith(LANGUAGE_CLASS_PREFIX));
  return languageClass?.slice(LANGUAGE_CLASS_PREFIX.length) ?? PLAIN_LANGUAGE;
}

function textOf(children: unknown): string {
  return Children.toArray(children as ComponentProps<"pre">["children"])
    .map((child) => (typeof child === "string" ? child : ""))
    .join("")
    .replace(/\n$/, "");
}

interface ViewToggleProps {
  isShowingSource: boolean;
  onToggle: () => void;
}

function ViewToggle({ isShowingSource, onToggle }: ViewToggleProps) {
  const label = isShowingSource ? "Show diagram" : "Show source";
  const Icon = isShowingSource ? Workflow : Code;
  return (
    <button type="button" aria-label={label} title={label} onClick={onToggle} className={VIEW_TOGGLE_BUTTON}>
      <Icon />
    </button>
  );
}

export function MarkdownCodeBlock({ children }: ComponentProps<"pre">) {
  const code = codeElementOf(children);
  const language = languageOf(code?.props.className);
  const text = textOf(code?.props.children);
  const isStreaming = useContext(MarkdownStreamingContext);
  const diagramSvg = useMermaidSvg(language === MERMAID_LANGUAGE && !isStreaming ? text : null);
  const [isShowingSource, setIsShowingSource] = useState(false);
  const isShowingDiagram = diagramSvg !== null && !isShowingSource;
  return (
    <div
      dir="ltr"
      data-language={language}
      className={
        "chat-markdown-codeblock my-[0.65rem] overflow-hidden rounded-lg border border-border/70 bg-secondary " +
        "text-start leading-snug dark:border-transparent dark:bg-input/32"
      }
    >
      <div
        className={
          "chat-markdown-codeblock-header flex items-center justify-between gap-2 pt-1.5 pr-1.5 pb-0 pl-3 " +
          "select-none"
        }
      >
        <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-2xs">
          <span className="truncate">{language}</span>
        </span>
        <span role="toolbar" aria-label="Code block actions" className="flex items-center gap-0.5">
          {diagramSvg !== null && (
            <ViewToggle isShowingSource={isShowingSource} onToggle={() => setIsShowingSource(!isShowingSource)} />
          )}
          <CopyButton text={text} label="Copy code" variant="code" />
        </span>
      </div>
      {isShowingDiagram ? (
        <div className="chat-markdown-diagram" dangerouslySetInnerHTML={{ __html: diagramSvg }} />
      ) : (
        <pre>{children}</pre>
      )}
    </div>
  );
}
