import { splitMentions } from "../mentions";

export function MentionText({ text }: { text: string }) {
  return splitMentions(text).map((segment, index) =>
    segment.isMention ? (
      <span key={index} className="mention-token">
        {segment.text}
      </span>
    ) : (
      segment.text
    ),
  );
}
