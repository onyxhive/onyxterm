import { Children, isValidElement, type ComponentProps, type ReactElement } from "react";
import { CopyButton } from "./CopyButton";

const LANGUAGE_CLASS_PREFIX = "language-";
const PLAIN_LANGUAGE = "text";

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

export function MarkdownCodeBlock({ children }: ComponentProps<"pre">) {
  const code = codeElementOf(children);
  const language = languageOf(code?.props.className);
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
          <CopyButton text={textOf(code?.props.children)} label="Copy code" variant="code" />
        </span>
      </div>
      <pre>{children}</pre>
    </div>
  );
}
