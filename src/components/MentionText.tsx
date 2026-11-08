import { createContext, useContext } from "react";
import { splitMentions } from "../mentions";

export const MentionTargetsContext = createContext<ReadonlySet<string>>(new Set());

export function useMentionTargets(): ReadonlySet<string> {
  return useContext(MentionTargetsContext);
}

export function MentionText({ text, targets }: { text: string; targets: ReadonlySet<string> }) {
  return splitMentions(text, targets).map((segment, index) =>
    segment.isMention ? (
      <span key={index} className="mention-token">
        {segment.text}
      </span>
    ) : (
      segment.text
    ),
  );
}
