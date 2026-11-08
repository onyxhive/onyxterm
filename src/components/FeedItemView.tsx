import type { FeedItem } from "../types";
import { Markdown } from "./Markdown";
import { PermissionCard, type PermissionDecision } from "./PermissionCard";
import { QuestionCard } from "./QuestionCard";
import { StepsRow } from "./StepsRow";

export interface FeedActions {
  onDecide: (decision: PermissionDecision) => void;
  onAnswer: (answer: string) => void;
}

interface FeedItemViewProps {
  item: FeedItem;
  providerMark: string;
  actions: FeedActions;
}

export function FeedItemView({ item, providerMark, actions }: FeedItemViewProps) {
  switch (item.kind) {
    case "user":
      return (
        <div className="message message--user">
          <div className="bubble">{item.text}</div>
          <span className="message__time">{item.time}</span>
        </div>
      );
    case "agent":
      return (
        <div className="message message--agent">
          <span className="agent-mark" aria-hidden="true">
            {providerMark}
          </span>
          <Markdown source={item.markdown} />
        </div>
      );
    case "steps":
      return <StepsRow steps={item.steps} files={item.files} />;
    case "note":
      return <div className="feed-note">{item.text}</div>;
    case "permission":
      return <PermissionCard request={item} onDecide={actions.onDecide} />;
    case "question":
      return <QuestionCard question={item} onAnswer={actions.onAnswer} />;
  }
}
