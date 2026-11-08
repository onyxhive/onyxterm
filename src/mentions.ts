export interface TextSegment {
  text: string;
  isMention: boolean;
}

const MENTION = /(?<=^|\s)@\S*[^\s.,;:!?)\]]/g;

export function splitMentions(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(MENTION)) {
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), isMention: false });
    segments.push({ text: match[0], isMention: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), isMention: false });
  return segments;
}
