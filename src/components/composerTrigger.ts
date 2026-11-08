import type { Suggestion } from "../types";

export interface SuggestionSources {
  commands: Suggestion[];
  mentions: Suggestion[];
}

export interface Trigger {
  start: number;
  query: string;
  source: Suggestion[];
}

const WHITESPACE = /\s/;

function tokenStart(text: string, caret: number): number {
  let start = caret;
  while (start > 0 && !WHITESPACE.test(text[start - 1])) start -= 1;
  return start;
}

export function findTrigger(text: string, caret: number, sources: SuggestionSources): Trigger | null {
  const start = tokenStart(text, caret);
  const token = text.slice(start, caret);
  if (token.startsWith("/") && start === 0) return { start, query: token.slice(1), source: sources.commands };
  if (token.startsWith("@")) return { start, query: token.slice(1), source: sources.mentions };
  return null;
}

export function matchSuggestions(trigger: Trigger): Suggestion[] {
  const query = trigger.query.toLowerCase();
  return trigger.source.filter((suggestion) => suggestion.value.slice(1).toLowerCase().includes(query));
}
