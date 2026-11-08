import { useEffect, useMemo, useRef } from "react";
import { Gauge, SquareTerminal } from "lucide-react";
import { CODEX_COMMAND } from "../agentOptions";
import type { FeedItem, Task, TaskStatus } from "../types";
import { suggestionSources, useCapabilities } from "../useCapabilities";
import { useProjectFiles } from "../useProjectFiles";
import { ChangedFilesCard } from "./ChangesPanel";
import { Composer, COMPOSER_PLACEHOLDER, QUESTION_PLACEHOLDER } from "./Composer";
import { ProviderIcon, StaticControl } from "./ComposerControls";
import { FeedItemView, type FeedActions } from "./FeedItemView";
import { QuestionDrawer, useQuestionAnswers, type QuestionRequest } from "./QuestionDrawer";
import { useDockHeight } from "./useDockHeight";
import { WorkingRow } from "./WorkingRow";

export interface ChatActions extends FeedActions {
  onReply: (text: string) => void;
  onAnswer: (requestId: string, answers: Record<string, string>) => void;
  onStop: () => void;
  onOpenChanges: () => void;
}

const SETTLED_STATUSES: TaskStatus[] = ["review", "done", "failed"];

interface ChatViewProps {
  task: Task;
  actions: ChatActions;
}

const CODEX_COMING = "Codex support coming next";
const TIMELINE_END_GAP = 16;

function pendingQuestionIn(feed: FeedItem[]): QuestionRequest | null {
  return feed.find((item): item is QuestionRequest => item.kind === "question") ?? null;
}

function turnReplyIndexes(feed: FeedItem[], isRunning: boolean): Set<number> {
  const replies = new Set<number>();
  let latestReply: number | null = null;
  feed.forEach((item, index) => {
    if (item.kind === "agent") latestReply = index;
    if (item.kind !== "user" || latestReply === null) return;
    replies.add(latestReply);
    latestReply = null;
  });
  if (latestReply !== null && !isRunning) replies.add(latestReply);
  return replies;
}

function liveStepIdIn(task: Task): string | null {
  if (task.status !== "running" || !task.work.runningNow) return null;
  const lastSteps = task.feed.findLast((item) => item.kind === "steps");
  if (lastSteps?.kind !== "steps") return null;
  const live = lastSteps.steps.findLast((step) => `${step.verb} ${step.detail}` === task.work.runningNow);
  return live?.id ?? null;
}

export function ChatView({ task, actions }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const dockHeight = useDockHeight(dockRef);
  const { capabilities } = useCapabilities(task.command, task.projectId);
  const files = useProjectFiles(task.projectId);
  const sources = useMemo(() => suggestionSources(capabilities, files), [capabilities, files]);
  const question = pendingQuestionIn(task.feed);
  const answers = useQuestionAnswers(question);
  const liveStepId = liveStepIdIn(task);
  const lastItem = task.feed.at(-1);
  const scrollKey = lastItem?.kind === "agent" ? lastItem.markdown.length : 0;
  const isRunning = task.status === "running";
  const turnReplies = turnReplyIndexes(task.feed, isRunning);
  const modelLabel = capabilities?.models.find((model) => model.value === task.model)?.displayName ?? task.model;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [task.id, task.feed.length, scrollKey, isRunning, dockHeight]);

  function submit(text: string) {
    if (!question) {
      actions.onReply(text);
      return;
    }
    const completed = answers.submit(text);
    if (completed) actions.onAnswer(question.requestId, completed);
  }

  const isTurnSettled = SETTLED_STATUSES.includes(task.status);

  const controls = (
    <>
      <StaticControl icon={<ProviderIcon provider={task.provider} />} title="Model, fixed for this chat">
        <span className="font-medium text-foreground/70">{modelLabel}</span>
      </StaticControl>
      {task.effort && (
        <StaticControl icon={<Gauge />} title="Effort, fixed for this chat">
          <span className="capitalize">{task.effort}</span>
        </StaticControl>
      )}
      <StaticControl icon={<SquareTerminal />} title="Command">
        {task.command}
      </StaticControl>
    </>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        style={{ paddingBottom: dockHeight + TIMELINE_END_GAP }}
        className="scroll-fade-top min-h-0 flex-1 overflow-y-auto px-5 [overflow-anchor:none]"
      >
        {task.feed.length === 0 && !isRunning && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Send a message to start the conversation.</p>
          </div>
        )}
        <div className="mx-auto w-full max-w-(--chat-content-max-width) pt-4">
          {task.feed.map((item, index) => (
            <FeedItemView
              key={index}
              item={item}
              liveStepId={liveStepId}
              isTurnReply={turnReplies.has(index)}
              actions={actions}
            />
          ))}
          {isRunning && <WorkingRow key={task.id} since={task.workingSince} />}
          {isTurnSettled && task.work.files.length > 0 && (
            <ChangedFilesCard files={task.work.files} className="mt-4" onOpenDiff={actions.onOpenChanges} />
          )}
        </div>
      </div>
      <div ref={dockRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-5 pt-2 pb-4">
        <div className="pointer-events-auto">
          <Composer
            key={task.id}
            variant="reply"
            placeholder={question ? QUESTION_PLACEHOLDER : COMPOSER_PLACEHOLDER}
            suggestionSources={sources}
            onSubmit={submit}
            controls={controls}
            drawer={question ? <QuestionDrawer answers={answers} /> : undefined}
            canSubmitEmpty={question !== null && answers.canSubmit("")}
            submitLabel={question ? "Submit answer" : undefined}
            onStop={isRunning ? actions.onStop : undefined}
            sendBlockedReason={task.command === CODEX_COMMAND ? CODEX_COMING : undefined}
          />
        </div>
      </div>
    </div>
  );
}
