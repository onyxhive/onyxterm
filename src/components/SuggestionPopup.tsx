import { useEffect, useRef } from "react";
import { Bot, FileText, Slash } from "lucide-react";
import type { Suggestion } from "../mock";

interface SuggestionPopupProps {
  id: string;
  suggestions: Suggestion[];
  activeIndex: number;
  onPick: (suggestion: Suggestion) => void;
}

function SuggestionIcon({ suggestion }: { suggestion: Suggestion }) {
  if (suggestion.value.startsWith("/")) return <Slash size={13} />;
  if (suggestion.hint === "agent") return <Bot size={13} />;
  return <FileText size={13} />;
}

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
            <SuggestionIcon suggestion={suggestion} />
          </span>
          <span className="suggestion__value">{suggestion.value}</span>
          {suggestion.hint && <span className="suggestion__hint">{suggestion.hint}</span>}
          <span className="suggestion__description">{suggestion.description}</span>
        </li>
      ))}
    </ul>
  );
}
