import { useEffect, useRef } from "react";
import { CODEX_COMMAND } from "../agentOptions";
import type { Task } from "../types";
import { suggestionSources, useCapabilities } from "../useCapabilities";
import { ChatHeader } from "./ChatHeader";
import { Composer } from "./Composer";
import { FeedItemView, type FeedActions } from "./FeedItemView";
import { useDockHeight } from "./useDockHeight";
import { WorkingLine } from "./WorkingLine";

export interface ChatActions extends FeedActions {
  onReply: (text: string) => void;
  onMarkDone: () => void;
  onStop: () => void;
  onToggleWorkPanel: () => void;
}

interface ChatViewProps {
  task: Task;
  projectName: string;
  isWorkPanelOpen: boolean;
  actions: ChatActions;
}

const PROVIDER_MARK = { "Claude Code": "C", Codex: "X" } as const;
const CODEX_COMING = "Codex support coming next";

export function ChatView({ task, projectName, isWorkPanelOpen, actions }: ChatViewProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  useDockHeight(dockRef);
  const { capabilities } = useCapabilities(task.command, task.projectId);
  const lastItem = task.feed.at(-1);
  const scrollKey = lastItem?.kind === "agent" ? lastItem.markdown.length : 0;

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [task.id, task.feed.length, scrollKey]);

  return (
    <div className="chat">
      <ChatHeader
        task={task}
        projectName={projectName}
        isWorkPanelOpen={isWorkPanelOpen}
        onMarkDone={actions.onMarkDone}
        onToggleWorkPanel={actions.onToggleWorkPanel}
      />
      <div className="chat__feed" ref={feedRef}>
        <div className="chat__column">
          {task.feed.map((item, index) => (
            <FeedItemView key={index} item={item} providerMark={PROVIDER_MARK[task.provider]} actions={actions} />
          ))}
        </div>
      </div>
      <div className="chat__dock" ref={dockRef}>
        <div className="chat__column">
          {task.status === "running" && (
            <WorkingLine
              key={task.id}
              since={task.workingSince}
              activity={task.work.runningNow}
              onStop={actions.onStop}
            />
          )}
          <Composer
            key={task.id}
            variant="reply"
            placeholder="Reply, or type / for commands and @ for agents"
            suggestionSources={suggestionSources(capabilities)}
            onSubmit={actions.onReply}
            sendBlockedReason={task.command === CODEX_COMMAND ? CODEX_COMING : undefined}
          />
        </div>
      </div>
    </div>
  );
}
