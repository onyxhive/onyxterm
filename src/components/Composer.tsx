import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useComposerInsertions, withInsertion } from "../composerInsertions";
import { sendNeedsModifier } from "../preferences";
import type { Suggestion } from "../types";
import { findTrigger, matchSuggestions, type SuggestionSources } from "./composerTrigger";
import { MentionText } from "./MentionText";
import { SuggestionList, suggestionOptionId } from "./SuggestionPopup";
import { cn } from "./ui";

interface ComposerProps {
  placeholder: string;
  variant: "hero" | "reply";
  suggestionSources: SuggestionSources;
  onSubmit: (text: string) => void;
  controls?: ReactNode;
  drawer?: ReactNode;
  footnote?: ReactNode;
  sendBlockedReason?: string;
  canSubmitEmpty?: boolean;
  submitLabel?: string;
  onStop?: () => void;
}

const DEFAULT_SUBMIT_LABEL = "Send message";
const COMPOSER_TEXT = "text-sm leading-relaxed whitespace-pre-wrap break-words";

export const COMPOSER_PLACEHOLDER = "Ask anything. @ files, / commands";
export const QUESTION_PLACEHOLDER = "Type your own answer, or leave this blank to use the selected option";

function cycle(index: number, step: number, length: number): number {
  return (index + step + length) % length;
}

function ArrowUpGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopButton({ onStop }: { onStop: () => void }) {
  return (
    <button
      type="button"
      aria-label="Stop the agent"
      title="Stop"
      onClick={onStop}
      className={cn(
        "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-destructive/90 text-white",
        "shadow-xs shadow-destructive/24 transition-colors duration-150 hover:bg-destructive",
      )}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
        <rect x="2" y="2" width="8" height="8" rx="1.5" />
      </svg>
    </button>
  );
}

function SuggestionsEmpty({ isMention }: { isMention: boolean }) {
  return (
    <div className="px-5 pt-3.5 pb-7">
      <p className="text-xs text-secondary-label">
        {isMention ? "No matching files or folders." : "No matching command."}
      </p>
    </div>
  );
}

function AttachedDrawer({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "glass relative z-0 mx-[1.375rem] -mb-4 rounded-t-2xl border border-b-0 border-(--composer-outline) pb-4",
        "shadow-composer",
      )}
    >
      {children}
    </div>
  );
}

export function Composer(props: ComposerProps) {
  const { placeholder, variant, suggestionSources, onSubmit, controls, drawer, footnote } = props;
  const { sendBlockedReason, canSubmitEmpty = false, submitLabel = DEFAULT_SUBMIT_LABEL, onStop } = props;
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const listId = useId();

  useComposerInsertions((inserted) => {
    const next = withInsertion(text, inserted);
    pendingCaret.current = next.length;
    setText(next);
    setCaret(next.length);
    inputRef.current?.focus();
  });

  const trigger = findTrigger(text, caret, suggestionSources);
  const suggestions = trigger ? matchSuggestions(trigger) : [];
  const isMenuOpen = trigger !== null && dismissedStart !== trigger.start;
  const hasSuggestions = suggestions.length > 0;
  const isListOpen = isMenuOpen && hasSuggestions;
  const highlighted = Math.min(activeIndex, suggestions.length - 1);
  const hasText = text.trim().length > 0;
  const canSubmit = (hasText || canSubmitEmpty) && sendBlockedReason === undefined;
  const showsStop = !hasText && !canSubmitEmpty;

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
    const inserted = suggestion.kind === "folder" ? suggestion.value : `${suggestion.value} `;
    const nextCaret = trigger.start + inserted.length;
    pendingCaret.current = nextCaret;
    setText(text.slice(0, trigger.start) + inserted + text.slice(caret));
    setCaret(nextCaret);
    setActiveIndex(0);
    inputRef.current?.focus();
  }

  function submit() {
    if (!canSubmit) return;
    onSubmit(text.trim());
    setText("");
    setCaret(0);
  }

  function menuActions(): Record<string, () => void> {
    if (!trigger || !isMenuOpen) return {};
    const dismiss = { Escape: () => setDismissedStart(trigger.start) };
    if (!hasSuggestions) return dismiss;
    return {
      ...dismiss,
      ArrowDown: () => setActiveIndex(cycle(highlighted, 1, suggestions.length)),
      ArrowUp: () => setActiveIndex(cycle(highlighted, -1, suggestions.length)),
      Tab: () => pick(suggestions[highlighted]),
      Enter: () => pick(suggestions[highlighted]),
    };
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const menuAction = event.shiftKey ? undefined : menuActions()[event.key];
    if (menuAction) {
      event.preventDefault();
      menuAction();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.altKey) return;
    const hasModifier = event.metaKey || event.ctrlKey;
    if (hasModifier !== sendNeedsModifier(text)) return;
    event.preventDefault();
    submit();
  }

  const suggestionMenu = hasSuggestions ? (
    <SuggestionList
      id={listId}
      suggestions={suggestions}
      activeIndex={highlighted}
      onPick={pick}
      onHighlight={setActiveIndex}
    />
  ) : (
    <SuggestionsEmpty isMention={trigger?.source === suggestionSources.mentions} />
  );
  const drawerContent = isMenuOpen ? suggestionMenu : drawer;

  return (
    <div className="relative mx-auto w-full max-w-(--chat-content-max-width)">
      {drawerContent && <AttachedDrawer>{drawerContent}</AttachedDrawer>}
      <div className="glass composer-outline relative z-10 rounded-2xl">
        <div className={cn("relative px-4 pb-2", variant === "hero" ? "pt-4" : "pt-3.5")}>
          <div className="relative max-h-[40vh] overflow-y-auto">
            <div aria-hidden className={cn(COMPOSER_TEXT, "pointer-events-none absolute inset-0 text-foreground")}>
              <MentionText text={text} />
            </div>
            <textarea
              ref={inputRef}
              rows={variant === "hero" ? 2 : 1}
              value={text}
              placeholder={placeholder}
              aria-label={placeholder}
              role="combobox"
              aria-expanded={isListOpen}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={isListOpen ? suggestionOptionId(listId, highlighted) : undefined}
              autoFocus
              onChange={(event) => {
                setText(event.target.value);
                setCaret(event.target.selectionStart);
                setActiveIndex(0);
              }}
              onSelect={syncCaret}
              onKeyDown={handleKeyDown}
              className={cn(
                COMPOSER_TEXT,
                "relative block w-full resize-none overflow-hidden bg-transparent text-transparent caret-foreground",
                "outline-none placeholder:text-placeholder",
              )}
            />
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2 px-2 pb-2">
          <div className="flex min-w-0 flex-1 items-center gap-0.5">{controls}</div>
          {onStop && showsStop ? (
            <StopButton onStop={onStop} />
          ) : (
            <span className="inline-flex" title={sendBlockedReason ?? submitLabel}>
              <button
                type="button"
                aria-label={submitLabel}
                disabled={!canSubmit}
                onClick={submit}
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-full bg-message-action shadow-xs",
                  "text-message-action-foreground shadow-message-action/24 transition-all duration-150",
                  "enabled:cursor-pointer enabled:hover:scale-105 enabled:hover:bg-message-action-hover",
                  "disabled:bg-foreground/12 disabled:text-muted-foreground disabled:shadow-none",
                )}
              >
                <ArrowUpGlyph />
              </button>
            </span>
          )}
        </div>
      </div>
      {footnote}
    </div>
  );
}
