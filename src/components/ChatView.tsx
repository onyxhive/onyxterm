import { useEffect, useRef } from "react";
import type { Task } from "../mock";
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

export function ChatView({ task, projectName, isWorkPanelOpen, actions }: ChatViewProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  useDockHeight(dockRef);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [task.id, task.feed.length]);

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
              key={`${task.id}-${task.feed.length}`}
              startSeconds={task.workingSeconds}
              activity={task.work.runningNow}
              onStop={actions.onStop}
            />
          )}
          <Composer
            key={task.id}
            variant="reply"
            placeholder="Reply, or type / for commands and @ for files"
            onSubmit={actions.onReply}
          />
        </div>
      </div>
    </div>
  );
}
