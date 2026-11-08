import type { FeedItem } from "../types";
import { Markdown } from "./Markdown";
import { PermissionCard, type PermissionDecision } from "./PermissionCard";
import { QuestionCard } from "./QuestionCard";
import { StepsRow } from "./StepsRow";

export interface FeedActions {
  onDecide: (requestId: string, decision: PermissionDecision) => void;
  onAnswer: (requestId: string, answers: Record<string, string>) => void;
}

interface FeedItemViewProps {
  item: FeedItem;
  actions: FeedActions;
}

export function FeedItemView({ item, actions }: FeedItemViewProps) {
  switch (item.kind) {
    case "user":
      return (
        <div className="message message--user">
          <div className="bubble">{item.text}</div>
          {item.time && <span className="message__time">{item.time}</span>}
        </div>
      );
    case "agent":
      return (
        <div className="message message--agent">
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
      return <QuestionCard request={item} onAnswer={actions.onAnswer} />;
  }
}
