import type { Suggestion, SuggestionKind } from "../types";

export interface SuggestionSources {
  commands: Suggestion[];
  mentions: Suggestion[];
}

export interface Trigger {
  start: number;
  query: string;
  source: Suggestion[];
  limit: number;
}

export const FOLDER_SUFFIX = "/";

const WHITESPACE = /\s/;
const MENTION_LIMIT = 8;
const SCATTERED_MATCH_COST = 1000;
const KIND_ORDER: Record<SuggestionKind, number> = { command: 0, agent: 0, folder: 1, file: 2 };

interface RankedSuggestion {
  suggestion: Suggestion;
  cost: number;
}

function tokenStart(text: string, caret: number): number {
  let start = caret;
  while (start > 0 && !WHITESPACE.test(text[start - 1])) start -= 1;
  return start;
}

export function findTrigger(text: string, caret: number, sources: SuggestionSources): Trigger | null {
  const start = tokenStart(text, caret);
  const token = text.slice(start, caret);
  if (token.startsWith("/") && start === 0) {
    return { start, query: token.slice(1), source: sources.commands, limit: sources.commands.length };
  }
  if (token.startsWith("@")) return { start, query: token.slice(1), source: sources.mentions, limit: MENTION_LIMIT };
  return null;
}

function scatteredMatchCost(text: string, query: string): number | null {
  let first = -1;
  let next = 0;
  for (const character of query) {
    const found = text.indexOf(character, next);
    if (found === -1) return null;
    if (first === -1) first = found;
    next = found + 1;
  }
  return SCATTERED_MATCH_COST + next - first;
}

function matchCost(text: string, query: string): number | null {
  const position = text.indexOf(query);
  if (position !== -1) return position;
  return scatteredMatchCost(text, query);
}

function isOpenFolder(suggestion: Suggestion, text: string, query: string): boolean {
  return suggestion.kind === "folder" && text === query;
}

function byRank(left: RankedSuggestion, right: RankedSuggestion): number {
  const kindGap = KIND_ORDER[left.suggestion.kind] - KIND_ORDER[right.suggestion.kind];
  if (kindGap !== 0) return kindGap;
  return left.cost - right.cost;
}

export function matchSuggestions(trigger: Trigger): Suggestion[] {
  const query = trigger.query.toLowerCase();
  const ranked: RankedSuggestion[] = [];
  for (const suggestion of trigger.source) {
    const text = suggestion.value.slice(1).toLowerCase();
    if (isOpenFolder(suggestion, text, query)) continue;
    const cost = matchCost(text, query);
    if (cost !== null) ranked.push({ suggestion, cost });
  }
  return ranked
    .sort(byRank)
    .slice(0, trigger.limit)
    .map((entry) => entry.suggestion);
}
