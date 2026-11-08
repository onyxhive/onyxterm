import { useEffect, useRef, type ReactNode } from "react";
import { Bot, FileText, Folder, Slash } from "lucide-react";
import type { Suggestion, SuggestionKind } from "../types";
import { cn } from "./ui";

interface SuggestionListProps {
  id: string;
  suggestions: Suggestion[];
  activeIndex: number;
  onPick: (suggestion: Suggestion) => void;
  onHighlight: (index: number) => void;
}

const KIND_ICONS: Record<SuggestionKind, ReactNode> = {
  command: <Slash />,
  agent: <Bot />,
  folder: <Folder />,
  file: <FileText />,
};

const KIND_LABELS: Record<SuggestionKind, string> = {
  command: "Commands",
  agent: "Agents, folders and files",
  folder: "Agents, folders and files",
  file: "Agents, folders and files",
};

export function suggestionOptionId(listId: string, index: number): string {
  return `${listId}-option-${index}`;
}

export function SuggestionList({ id, suggestions, activeIndex, onPick, onHighlight }: SuggestionListProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <ul
      role="listbox"
      id={id}
      ref={listRef}
      aria-label={KIND_LABELS[suggestions[0]?.kind ?? "command"]}
      className="max-h-72 min-h-0 overflow-y-auto p-1 scroll-pb-6"
    >
      {suggestions.map((suggestion, index) => (
        <li
          key={suggestion.value}
          id={suggestionOptionId(id, index)}
          role="option"
          aria-selected={index === activeIndex}
          onMouseDown={(event) => event.preventDefault()}
          onMouseMove={() => index !== activeIndex && onHighlight(index)}
          onClick={() => onPick(suggestion)}
          className={cn(
            "flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none",
            "aria-selected:bg-accent aria-selected:text-accent-foreground",
            "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-secondary-label",
          )}
        >
          {KIND_ICONS[suggestion.kind]}
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="max-w-[45%] min-w-0 shrink-0 truncate font-sans text-xs font-medium">
              {suggestion.value}
              {suggestion.hint && <span className="ms-1.5 font-normal text-secondary-label">{suggestion.hint}</span>}
            </span>
            <span className="min-w-0 flex-1 truncate text-left text-xs text-secondary-label">
              {suggestion.description}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
