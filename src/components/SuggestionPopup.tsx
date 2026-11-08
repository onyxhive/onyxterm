import { useEffect, useRef, type ReactNode } from "react";
import { Bot, FileText, Folder, Slash } from "lucide-react";
import type { Suggestion, SuggestionKind } from "../types";

interface SuggestionPopupProps {
  id: string;
  suggestions: Suggestion[];
  activeIndex: number;
  onPick: (suggestion: Suggestion) => void;
}

const KIND_ICONS: Record<SuggestionKind, ReactNode> = {
  command: <Slash size={13} />,
  agent: <Bot size={13} />,
  folder: <Folder size={13} />,
  file: <FileText size={13} />,
};

export function suggestionOptionId(popupId: string, index: number): string {
  return `${popupId}-option-${index}`;
}

export function SuggestionPopup({ id, suggestions, activeIndex, onPick }: SuggestionPopupProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <ul className="popover suggestion-popup" role="listbox" id={id} ref={listRef}>
      {suggestions.map((suggestion, index) => (
        <li
          key={suggestion.value}
          id={suggestionOptionId(id, index)}
          role="option"
          aria-selected={index === activeIndex}
          className="suggestion"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(suggestion)}
        >
          <span className="suggestion__icon">
            {KIND_ICONS[suggestion.kind]}
          </span>
          <span className="suggestion__value">{suggestion.value}</span>
          {suggestion.hint && <span className="suggestion__hint">{suggestion.hint}</span>}
          <span className="suggestion__description">{suggestion.description}</span>
        </li>
      ))}
    </ul>
  );
}
