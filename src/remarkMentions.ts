import { splitMentions, type TextSegment } from "./mentions";

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: Record<string, unknown>;
}

const MENTION_CLASS = "mention-token";
const SKIPPED_PARENTS = new Set(["link", "linkReference"]);

function mentionNode(text: string): MarkdownNode {
  return {
    type: "mention",
    data: {
      hName: "span",
      hProperties: { className: [MENTION_CLASS] },
      hChildren: [{ type: "text", value: text }],
    },
  };
}

function nodeOf(segment: TextSegment): MarkdownNode {
  return segment.isMention ? mentionNode(segment.text) : { type: "text", value: segment.text };
}

function withMentions(node: MarkdownNode): MarkdownNode[] {
  if (node.type !== "text" || !node.value) return [node];
  return splitMentions(node.value).map(nodeOf);
}

function highlightMentionsIn(node: MarkdownNode) {
  if (!node.children || SKIPPED_PARENTS.has(node.type)) return;
  node.children = node.children.flatMap(withMentions);
  node.children.forEach(highlightMentionsIn);
}

export function remarkMentions() {
  return highlightMentionsIn;
}
