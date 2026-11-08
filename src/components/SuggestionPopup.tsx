import { Fragment, useEffect } from "react";
import type { Suggestion, SuggestionKind } from "../types";
import {
  commandGroupOf,
  displayNameOf,
  matchedCharacters,
  withoutLeadingParenthetical,
} from "./composerTrigger";
import { cn } from "./ui";

interface SuggestionListProps {
  id: string;
  suggestions: Suggestion[];
  query: string;
  activeIndex: number;
  onPick: (suggestion: Suggestion) => void;
  onHighlight: (index: number) => void;
}

interface SuggestionOptionProps {
  optionId: string;
  suggestion: Suggestion;
  query: string;
  isActive: boolean;
  onPick: () => void;
  onHighlight: () => void;
}

const KIND_LABELS: Record<SuggestionKind, string> = {
  command: "Commands",
  agent: "Agents, folders and files",
  folder: "Agents, folders and files",
  file: "Agents, folders and files",
};

const COMMAND_PREFIX = "/";

export function suggestionOptionId(listId: string, index: number): string {
  return `${listId}-option-${index}`;
}

function HighlightedMatch({ text, query }: { text: string; query: string }) {
  const matched = matchedCharacters(text, query);
  return Array.from(text, (character, index) =>
    matched.has(index) ? (
      <b key={index} className="font-semibold text-foreground">
        {character}
      </b>
    ) : (
      character
    ),
  );
}

function SuggestionOption({ optionId, suggestion, query, isActive, onPick, onHighlight }: SuggestionOptionProps) {
  const isCommand = suggestion.kind === "command";
  const description = withoutLeadingParenthetical(suggestion.description);
  return (
    <li
      id={optionId}
      role="option"
      aria-selected={isActive}
      title={suggestion.value}
      onMouseDown={(event) => event.preventDefault()}
      onMouseMove={() => !isActive && onHighlight()}
      onClick={onPick}
      className={cn(
        "flex h-7 cursor-pointer select-none items-center gap-2 rounded-md px-2 text-[13px] outline-none",
        "aria-selected:bg-accent",
      )}
    >
      <span className="max-w-[55%] min-w-0 shrink-0 truncate text-foreground/90">
        {isCommand && COMMAND_PREFIX}
        <HighlightedMatch text={displayNameOf(suggestion)} query={query} />
        {suggestion.hint && <span className="ms-1.5 text-muted-foreground">{suggestion.hint}</span>}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{description}</span>
      {!isCommand && <span className="shrink-0 text-[11px] text-muted-foreground">{suggestion.kind}</span>}
    </li>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <li role="presentation" className="px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground first:pt-1">
      {label}
    </li>
  );
}

function headerBefore(suggestions: Suggestion[], index: number): string | null {
  const suggestion = suggestions[index];
  if (suggestion.kind !== "command") return null;
  const group = commandGroupOf(suggestion);
  const previous = suggestions[index - 1];
  return previous && commandGroupOf(previous) === group ? null : group;
}

export function SuggestionList({ id, suggestions, query, activeIndex, onPick, onHighlight }: SuggestionListProps) {
  useEffect(() => {
    document.getElementById(suggestionOptionId(id, activeIndex))?.scrollIntoView({ block: "nearest" });
  }, [id, activeIndex]);

  return (
    <ul
      role="listbox"
      id={id}
      aria-label={KIND_LABELS[suggestions[0]?.kind ?? "command"]}
      className="max-h-64 min-h-0 overflow-y-auto p-1"
    >
      {suggestions.map((suggestion, index) => {
        const header = headerBefore(suggestions, index);
        return (
          <Fragment key={suggestion.value}>
            {header && <GroupHeader label={header} />}
            <SuggestionOption
              optionId={suggestionOptionId(id, index)}
              suggestion={suggestion}
              query={query}
              isActive={index === activeIndex}
              onPick={() => onPick(suggestion)}
              onHighlight={() => onHighlight(index)}
            />
          </Fragment>
        );
      })}
    </ul>
  );
}
