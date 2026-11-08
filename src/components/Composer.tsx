import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUp } from "lucide-react";
import type { Suggestion } from "../mock";
import { findTrigger, matchSuggestions } from "./composerTrigger";
import { SuggestionPopup, suggestionOptionId } from "./SuggestionPopup";

interface ComposerProps {
  placeholder: string;
  variant: "hero" | "reply";
  onSubmit: (text: string) => void;
  toolbar?: ReactNode;
}

function cycle(index: number, step: number, length: number): number {
  return (index + step + length) % length;
}

export function Composer({ placeholder, variant, onSubmit, toolbar }: ComposerProps) {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const popupId = useId();

  const trigger = findTrigger(text, caret);
  const suggestions = trigger ? matchSuggestions(trigger) : [];
  const isPopupOpen = trigger !== null && suggestions.length > 0 && dismissedStart !== trigger.start;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
    if (pendingCaret.current === null) return;
    input.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [text]);

  function syncCaret() {
    setCaret(inputRef.current?.selectionStart ?? 0);
  }

  function pick(suggestion: Suggestion) {
    if (!trigger) return;
    const inserted = `${suggestion.value} `;
    const nextCaret = trigger.start + inserted.length;
    pendingCaret.current = nextCaret;
    setText(text.slice(0, trigger.start) + inserted + text.slice(caret));
    setCaret(nextCaret);
    inputRef.current?.focus();
  }

  function submit() {
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText("");
    setCaret(0);
  }

  function handlePopupKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!trigger) return;
    const navigation: Record<string, () => void> = {
      ArrowDown: () => setActiveIndex(cycle(activeIndex, 1, suggestions.length)),
      ArrowUp: () => setActiveIndex(cycle(activeIndex, -1, suggestions.length)),
      Tab: () => pick(suggestions[activeIndex]),
      Enter: () => pick(suggestions[activeIndex]),
      Escape: () => setDismissedStart(trigger.start),
    };
    const action = navigation[event.key];
    if (!action || event.shiftKey) return;
    event.preventDefault();
    action();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isPopupOpen) {
      handlePopupKey(event);
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    submit();
  }

  return (
    <div className={`composer composer--${variant}`}>
      {isPopupOpen && (
        <SuggestionPopup
          id={popupId}
          suggestions={suggestions}
          activeIndex={Math.min(activeIndex, suggestions.length - 1)}
          onPick={pick}
        />
      )}
      <textarea
        ref={inputRef}
        className="composer__input"
        rows={1}
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        role="combobox"
        aria-expanded={isPopupOpen}
        aria-controls={popupId}
        aria-autocomplete="list"
        aria-activedescendant={isPopupOpen ? suggestionOptionId(popupId, activeIndex) : undefined}
        onChange={(event) => {
          setText(event.target.value);
          setCaret(event.target.selectionStart);
          setActiveIndex(0);
        }}
        onSelect={syncCaret}
        onKeyDown={handleKeyDown}
      />
      <div className="composer__footer">
        <div className="composer__toolbar">{toolbar}</div>
        <span className="composer__hint">
          <kbd>/</kbd> commands <kbd>@</kbd> files
        </span>
        <button
          type="button"
          className="send-button"
          aria-label="Send"
          disabled={!text.trim()}
          onClick={submit}
        >
          <ArrowUp size={15} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
