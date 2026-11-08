import { useEffect, useMemo, useRef } from "react";
import { effortOptionsFor, modelChoices } from "../agentChoices";
import { CODEX_COMMAND } from "../agentOptions";
import { mentionTargetsOf } from "../mentions";
import type { PermissionMode } from "../permissionModes";
import type { FeedItem, ImageAttachment, PermissionDecision, Subagent, Task, TaskStatus } from "../types";
import { suggestionSources, useCapabilities } from "../useCapabilities";
import { useSubagents } from "../useGit";
import { useProjectFiles } from "../useProjectFiles";
import { ChangedFilesCard } from "./ChangesPanel";
import { Composer, COMPOSER_PLACEHOLDER, QUESTION_PLACEHOLDER } from "./Composer";
import { AgentPicker } from "./AgentPicker";
import { ApprovalGroup } from "./ApprovalRow";
import { ChatWorkspaceControls, type AgentChoice } from "./ComposerControls";
import { FeedItemView } from "./FeedItemView";
import { MentionTargetsContext } from "./MentionText";
import { ProjectRootsContext } from "./projectPaths";
import { QuestionDrawer, useQuestionAnswers, type QuestionRequest } from "./QuestionDrawer";
import { SubagentGroup, type SubagentEntry } from "./SubagentGroup";
import { useDockHeight } from "./useDockHeight";
import { WorkingRow } from "./WorkingRow";

export interface ChatActions {
  onDecide: (requestId: string, decision: PermissionDecision) => void;
  onReply: (text: string, images: ImageAttachment[]) => void;
  onAnswer: (requestId: string, answers: Record<string, string>) => void;
  onStop: () => void;
  onOpenChanges: () => void;
  onChangeChoice: (choice: AgentChoice) => void;
  onChangePermissionMode: (mode: PermissionMode) => void;
}

const ACTIVE_TURN_STATUSES: TaskStatus[] = ["running", "permission", "question"];
const CHOICE_LOCKED = "Wait for this turn to finish or stop it to change the model, effort, permissions or command";
const SETTLED_STATUSES: TaskStatus[] = ["review", "done", "failed"];

interface ChatViewProps {
  task: Task;
  projectPath: string | null;
  actions: ChatActions;
}

type PermissionRequest = Extract<FeedItem, { kind: "permission" }>;

type FeedBlock =
  | { kind: "item"; item: FeedItem; index: number }
  | { kind: "subagents"; index: number; agents: SubagentEntry[] }
  | { kind: "approvals"; index: number; requests: PermissionRequest[] };

const TURN_ACTIVITY_KINDS = new Set<FeedItem["kind"]>(["steps", "subagent", "permission"]);

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

function subagentWith(subagents: Subagent[], toolUseId: string): Subagent | undefined {
  return subagents.find((subagent) => subagent.toolUseId === toolUseId);
}

function pendingToolIds(feed: FeedItem[]): Set<string> {
  return new Set(feed.flatMap((item) => (item.kind === "permission" && item.toolUseId ? [item.toolUseId] : [])));
}

function feedBlocks(feed: FeedItem[], subagents: Subagent[]): FeedBlock[] {
  const blocks: FeedBlock[] = [];
  const awaited = pendingToolIds(feed);
  let openSubagents: Extract<FeedBlock, { kind: "subagents" }> | null = null;
  let openApprovals: Extract<FeedBlock, { kind: "approvals" }> | null = null;
  feed.forEach((item, index) => {
    if (!TURN_ACTIVITY_KINDS.has(item.kind)) {
      openSubagents = null;
      openApprovals = null;
    }
    if (item.kind === "subagent") {
      const needsApproval = item.steps.some((step) => awaited.has(step.id));
      const live = subagentWith(subagents, item.toolUseId);
      const agent: SubagentEntry = { ...item, ...live, steps: item.steps, needsApproval };
      if (openSubagents) openSubagents.agents.push(agent);
      else blocks.push((openSubagents = { kind: "subagents", index, agents: [agent] }));
      return;
    }
    if (item.kind === "permission") {
      if (openApprovals) openApprovals.requests.push(item);
      else blocks.push((openApprovals = { kind: "approvals", index, requests: [item] }));
      return;
    }
    blocks.push({ kind: "item", item, index });
  });
  return blocks;
}

function liveStepIdIn(task: Task): string | null {
  if (task.status !== "running" || !task.work.runningNow) return null;
  const lastSteps = task.feed.findLast((item) => item.kind === "steps");
  if (lastSteps?.kind !== "steps") return null;
  const live = lastSteps.steps.findLast((step) => `${step.verb} ${step.detail}` === task.work.runningNow);
  return live?.id ?? null;
}

export function ChatView({ task, projectPath, actions }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const dockHeight = useDockHeight(dockRef);
  const { capabilities } = useCapabilities(task.command, task.projectId);
  const files = useProjectFiles({ chat: task.id });
  const sources = useMemo(() => suggestionSources(capabilities, files), [capabilities, files]);
  const mentionTargets = useMemo(() => mentionTargetsOf(sources.mentions), [sources]);
  const question = pendingQuestionIn(task.feed);
  const answers = useQuestionAnswers(question);
  const liveStepId = liveStepIdIn(task);
  const oldestPendingApproval = task.feed.find((item) => item.kind === "permission");
  const shortcutRequestId = oldestPendingApproval?.kind === "permission" ? oldestPendingApproval.requestId : null;
  const lastItem = task.feed.at(-1);
  const scrollKey = lastItem?.kind === "agent" ? lastItem.markdown.length : 0;
  const isRunning = task.status === "running";
  const turnReplies = turnReplyIndexes(task.feed, isRunning);
  const { subagents } = useSubagents(task.id);
  const models = capabilities?.models ?? [];
  const efforts = effortOptionsFor(models.find((model) => model.value === task.model));
  const { provider, command, model, effort } = task;
  const choice: AgentChoice = { provider, command, model, effort };
  const choiceLockReason = ACTIVE_TURN_STATUSES.includes(task.status) ? CHOICE_LOCKED : undefined;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [task.id, task.feed.length, scrollKey, isRunning, dockHeight]);

  function submit(text: string, images: ImageAttachment[]) {
    if (!question) {
      actions.onReply(text, images);
      return;
    }
    const completed = answers.submit(text);
    if (completed) actions.onAnswer(question.requestId, completed);
  }

  const isTurnSettled = SETTLED_STATUSES.includes(task.status);

  const agentControls = (
    <AgentPicker
      choice={choice}
      models={modelChoices(models)}
      efforts={efforts}
      permissionMode={task.permissionMode}
      side="top"
      align="end"
      disabledReason={choiceLockReason}
      onChange={(update) => actions.onChangeChoice({ ...choice, ...update })}
      onPermissionModeChange={actions.onChangePermissionMode}
    />
  );

  const controls = (
    <>
      <ChatWorkspaceControls worktreePath={task.worktreePath} branch={task.branch} />
    </>
  );

  const projectRoots = [task.worktreePath, projectPath].filter((root): root is string => root !== null);

  return (
    <ProjectRootsContext value={projectRoots}>
      <MentionTargetsContext value={mentionTargets}>
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
              {feedBlocks(task.feed, subagents).map((block) =>
                block.kind === "subagents" ? (
                  <SubagentGroup key={block.index} agents={block.agents} />
                ) : block.kind === "approvals" ? (
                  <ApprovalGroup
                    key={block.index}
                    requests={block.requests}
                    shortcutRequestId={shortcutRequestId}
                    onDecide={actions.onDecide}
                  />
                ) : (
                  <FeedItemView
                    key={block.index}
                    item={block.item}
                    liveStepId={liveStepId}
                    isTurnReply={turnReplies.has(block.index)}
                  />
                ),
              )}
              {isRunning && <WorkingRow key={task.id} since={task.workingSince} />}
              {isTurnSettled && task.work.files.length > 0 && (
                <ChangedFilesCard files={task.work.files} className="mt-4" onOpenDiff={actions.onOpenChanges} />
              )}
            </div>
          </div>
          <div
            ref={dockRef}
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-background px-5 pt-2 pb-4"
          >
            <div className="pointer-events-auto">
              <Composer
                key={task.id}
                variant="reply"
                placeholder={question ? QUESTION_PLACEHOLDER : COMPOSER_PLACEHOLDER}
                suggestionSources={sources}
                onSubmit={submit}
                controls={controls}
                agentControls={agentControls}
                drawer={question ? <QuestionDrawer answers={answers} /> : undefined}
                canSubmitEmpty={question !== null && answers.canSubmit("")}
                submitLabel={question ? "Submit answer" : undefined}
                onStop={isRunning ? actions.onStop : undefined}
                sendBlockedReason={task.command === CODEX_COMMAND ? CODEX_COMING : undefined}
              />
            </div>
          </div>
        </div>
      </MentionTargetsContext>
    </ProjectRootsContext>
  );
}
