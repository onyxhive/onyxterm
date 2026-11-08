import type { FeedItem } from "../types";
import { ApprovalRow, type PermissionDecision } from "./ApprovalRow";
import { Markdown } from "./Markdown";
import { QuestionRow } from "./QuestionDrawer";
import { cn } from "./ui";
import { WorkGroup } from "./WorkLog";

export interface FeedActions {
  onDecide: (requestId: string, decision: PermissionDecision) => void;
}

interface FeedItemViewProps {
  item: FeedItem;
  liveStepId: string | null;
  actions: FeedActions;
}

function UserMessage({ text, time }: { text: string; time: string }) {
  return (
    <div className="group flex flex-col items-end gap-1 pb-4">
      <h3 className="sr-only">You</h3>
      <div
        className={
          "relative max-w-[80%] min-w-0 rounded-2xl bg-message p-3 text-sm leading-relaxed whitespace-pre-wrap " +
          "text-message-foreground [overflow-wrap:anywhere]"
        }
      >
        {text}
      </div>
      {time && (
        <p
          className={cn(
            "pe-1 text-xs tabular-nums text-muted-foreground opacity-0 transition-opacity duration-200",
            "group-hover:opacity-100",
          )}
        >
          {time}
        </p>
      )}
    </div>
  );
}

function SystemDivider({ text }: { text: string }) {
  return (
    <div role="note" className="flex items-center gap-3 pt-1 pb-3 text-xs text-muted-foreground">
      <span aria-hidden="true" className="h-px flex-1 bg-border/70" />
      <span className="max-w-[80%] min-w-0 truncate" title={text}>
        {text}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-border/70" />
    </div>
  );
}

export function FeedItemView({ item, liveStepId, actions }: FeedItemViewProps) {
  switch (item.kind) {
    case "user":
      return <UserMessage text={item.text} time={item.time} />;
    case "agent":
      return (
        <div className="relative min-w-0 px-1 py-0.5 pb-4">
          <h3 className="sr-only">Agent</h3>
          <Markdown source={item.markdown} isStreaming={!item.isFinal} />
        </div>
      );
    case "steps":
      return <WorkGroup steps={item.steps} liveStepId={liveStepId} />;
    case "note":
      return <SystemDivider text={item.text} />;
    case "permission":
      return <ApprovalRow request={item} onDecide={actions.onDecide} />;
    case "question":
      return <QuestionRow request={item} />;
  }
}
