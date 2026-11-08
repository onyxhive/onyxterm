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

function highlightMentionsIn(node: MarkdownNode, targets: ReadonlySet<string>) {
  if (!node.children || SKIPPED_PARENTS.has(node.type)) return;
  node.children = node.children.flatMap((child) =>
    child.type === "text" && child.value ? splitMentions(child.value, targets).map(nodeOf) : [child],
  );
  node.children.forEach((child) => highlightMentionsIn(child, targets));
}

export function remarkMentions(targets: ReadonlySet<string>) {
  return (tree: MarkdownNode) => highlightMentionsIn(tree, targets);
}
