import type { Suggestion } from "./types";

export interface TextSegment {
  text: string;
  isMention: boolean;
}

const MENTION = /(?<=^|\s)@\S*[^\s.,;:!?)\]]/g;
const FOLDER_SUFFIX = "/";

export function mentionTargetsOf(suggestions: Suggestion[]): ReadonlySet<string> {
  return new Set(suggestions.map((suggestion) => suggestion.value));
}

function isResolved(token: string, targets: ReadonlySet<string>): boolean {
  return targets.has(token) || targets.has(`${token}${FOLDER_SUFFIX}`);
}

export function splitMentions(text: string, targets: ReadonlySet<string>): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(MENTION)) {
    if (!isResolved(match[0], targets)) continue;
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), isMention: false });
    segments.push({ text: match[0], isMention: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), isMention: false });
  return segments;
}
