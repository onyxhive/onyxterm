import { useEffect, useMemo, useRef } from "react";
import { effortOptionsFor, modelChoices } from "../agentChoices";
import { CODEX_COMMAND } from "../agentOptions";
import { needsRespawn, RESPAWN_LOCKED, type OptionLock } from "../liveOptions";
import { mentionTargetsOf } from "../mentions";
import type { PermissionMode } from "../permissionModes";
import type {
  FeedItem,
  ImageAttachment,
  PermissionDecision,
  RuleScope,
  RunningShell,
  Task,
  TaskStatus,
} from "../types";
import { suggestionSources, useCapabilities, useUltracodeAvailability } from "../useCapabilities";
import { useProjectFiles } from "../useProjectFiles";
import { Composer, COMPOSER_PLACEHOLDER, QUESTION_PLACEHOLDER } from "./Composer";
import { ActivityPanel } from "./ActivityPanel";
import { AgentPicker } from "./AgentPicker";
import { ApprovalGroup } from "./ApprovalRow";
import { ChatWorkspaceControls, type AgentChoice } from "./ComposerControls";
import { FeedItemView } from "./FeedItemView";
import { MentionTargetsContext } from "./MentionText";
import { ProjectRootsContext, projectRootsOf } from "./projectPaths";
import { QuestionDrawer, useQuestionAnswers, type QuestionRequest } from "./QuestionDrawer";
import { SubagentLaunchLine } from "./SubagentLaunchLine";
import { SubagentTray } from "./SubagentTray";
import { useDockHeight } from "./useDockHeight";
import { pendingToolIds, useSubagentEntries, type SubagentEntry } from "./useSubagentEntries";
import { WorkingRow } from "./WorkingRow";

export interface ChatActions {
  onDecide: (requestId: string, decision: PermissionDecision, suggestion?: RuleScope) => void;
  onReply: (text: string, images: ImageAttachment[]) => void;
  onAnswer: (requestId: string, answers: Record<string, string>) => void;
  onStop: () => void;
  onChangeChoice: (choice: AgentChoice) => void;
  onChangePermissionMode: (mode: PermissionMode) => void;
  onChangeFastMode: (isEnabled: boolean) => void;
  onChangeUltracode: (isEnabled: boolean) => void;
  onOpenSubagents: (agentId: string | null) => void;
  onToggleSubagentTray: () => void;
}

const ACTIVE_TURN_STATUSES: TaskStatus[] = ["running", "permission", "question"];

interface ChatViewProps {
  task: Task;
  projectPath: string | null;
  isSubagentTrayCollapsed: boolean;
  actions: ChatActions;
}

type PermissionRequest = Extract<FeedItem, { kind: "permission" }>;

type FeedBlock =
  | { kind: "item"; item: FeedItem; index: number }
  | { kind: "approvals"; index: number; requests: PermissionRequest[] }
  | { kind: "launches"; index: number; agentIds: string[] };

const TURN_ACTIVITY_KINDS = new Set<FeedItem["kind"]>(["steps", "subagent", "permission"]);
const LAUNCH_PASSTHROUGH_KINDS = new Set<FeedItem["kind"]>(["subagent", "permission"]);

const CODEX_COMING = "Codex support coming next";
const TIMELINE_END_GAP = 16;
const FOLLOW_DISTANCE = 64;

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= FOLLOW_DISTANCE;
}

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

function runningShells(task: Task): RunningShell[] {
  const awaited = pendingToolIds(task.feed);
  return task.work.shells.filter((shell) => !awaited.has(shell.toolUseId));
}

function feedBlocks(feed: FeedItem[]): FeedBlock[] {
  const blocks: FeedBlock[] = [];
  let openApprovals: Extract<FeedBlock, { kind: "approvals" }> | null = null;
  let openLaunches: Extract<FeedBlock, { kind: "launches" }> | null = null;
  feed.forEach((item, index) => {
    if (!TURN_ACTIVITY_KINDS.has(item.kind)) openApprovals = null;
    if (!LAUNCH_PASSTHROUGH_KINDS.has(item.kind)) openLaunches = null;
    if (item.kind === "subagent") {
      if (openLaunches) openLaunches.agentIds.push(item.toolUseId);
      else blocks.push((openLaunches = { kind: "launches", index, agentIds: [item.toolUseId] }));
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

function currentTurnAgentIds(feed: FeedItem[]): Set<string> {
  const turnStart = feed.findLastIndex((item) => item.kind === "user");
  return new Set(feed.slice(turnStart + 1).flatMap((item) => (item.kind === "subagent" ? [item.toolUseId] : [])));
}

function trayAgentsOf(task: Task, agents: SubagentEntry[]): SubagentEntry[] {
  const currentTurn = currentTurnAgentIds(task.feed);
  return agents.filter((agent) => agent.status === "running" || currentTurn.has(agent.toolUseId));
}

function isTrayVisible(task: Task, trayAgents: SubagentEntry[]): boolean {
  if (trayAgents.some((agent) => agent.status === "running")) return true;
  return ACTIVE_TURN_STATUSES.includes(task.status) && trayAgents.length > 0;
}

function liveStepIdIn(task: Task): string | null {
  if (task.status !== "running" || !task.work.runningNow) return null;
  const lastSteps = task.feed.findLast((item) => item.kind === "steps");
  if (lastSteps?.kind !== "steps") return null;
  const live = lastSteps.steps.findLast((step) => `${step.verb} ${step.detail}` === task.work.runningNow);
  return live?.id ?? null;
}

export function ChatView({ task, projectPath, isSubagentTrayCollapsed, actions }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isFollowingRef = useRef(true);
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
  const agents = useSubagentEntries(task);
  const trayAgents = trayAgentsOf(task, agents);
  const models = capabilities?.models ?? [];
  const efforts = effortOptionsFor(models.find((model) => model.value === task.model));
  const { provider, command, model, effort } = task;
  const choice: AgentChoice = { provider, command, model, effort };
  const isTurnActive = ACTIVE_TURN_STATUSES.includes(task.status);
  const lockReasonFor: OptionLock = (change) =>
    isTurnActive && needsRespawn(task, change) ? RESPAWN_LOCKED : undefined;

  function scrollToBottom() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }

  useEffect(() => {
    isFollowingRef.current = true;
    scrollToBottom();
  }, [task.id]);

  useEffect(() => {
    if (isFollowingRef.current) scrollToBottom();
  }, [task.feed.length, scrollKey, isRunning, dockHeight]);

  function submit(text: string, images: ImageAttachment[]) {
    isFollowingRef.current = true;
    if (!question) {
      actions.onReply(text, images);
      return;
    }
    const completed = answers.submit(text);
    if (completed) actions.onAnswer(question.requestId, completed);
  }

  const isUltracodeAvailable = useUltracodeAvailability(task.command, task.projectId, task.model);
  const ultracodeToggle = { isEnabled: task.ultracode, onChange: actions.onChangeUltracode };
  const agentControls = (
    <AgentPicker
      choice={choice}
      models={modelChoices(models)}
      efforts={efforts}
      permissionMode={task.permissionMode}
      side="top"
      align="end"
      lockReasonFor={lockReasonFor}
      onChange={(update) => actions.onChangeChoice({ ...choice, ...update })}
      onPermissionModeChange={actions.onChangePermissionMode}
      fastMode={{ isEnabled: task.fastMode, onChange: actions.onChangeFastMode }}
      ultracode={isUltracodeAvailable ? ultracodeToggle : undefined}
    />
  );

  const controls = <ChatWorkspaceControls worktreePath={task.worktreePath} />;

  return (
    <ProjectRootsContext value={projectRootsOf(task, projectPath)}>
      <MentionTargetsContext value={mentionTargets}>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ActivityPanel shells={runningShells(task)} />
          <div
            ref={scrollRef}
            onScroll={(event) => {
              isFollowingRef.current = isNearBottom(event.currentTarget);
            }}
            style={{ paddingBottom: dockHeight + TIMELINE_END_GAP }}
            className="scroll-fade-top min-h-0 flex-1 overflow-y-auto px-5 [overflow-anchor:none]"
          >
            {task.feed.length === 0 && !isRunning && (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">Send a message to start the conversation.</p>
              </div>
            )}
            <div className="mx-auto w-full max-w-(--chat-content-max-width) pt-4">
              {feedBlocks(task.feed).map((block) => {
                if (block.kind === "approvals") {
                  return (
                    <ApprovalGroup
                      key={block.index}
                      requests={block.requests}
                      shortcutRequestId={shortcutRequestId}
                      onDecide={actions.onDecide}
                    />
                  );
                }
                if (block.kind === "launches") {
                  return (
                    <SubagentLaunchLine
                      key={block.index}
                      agents={agents.filter((agent) => block.agentIds.includes(agent.toolUseId))}
                      onOpen={() => actions.onOpenSubagents(null)}
                    />
                  );
                }
                return (
                  <FeedItemView
                    key={block.index}
                    item={block.item}
                    liveStepId={liveStepId}
                    isTurnReply={turnReplies.has(block.index)}
                  />
                );
              })}
              {isRunning && <WorkingRow key={task.id} since={task.workingSince} />}
            </div>
          </div>
          <div
            ref={dockRef}
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-background px-5 pt-2 pb-4"
          >
            <div className="pointer-events-auto">
              <SubagentTray
                provider={task.provider}
                agents={trayAgents}
                isVisible={isTrayVisible(task, trayAgents)}
                isCollapsed={isSubagentTrayCollapsed}
                onToggleCollapsed={actions.onToggleSubagentTray}
                onOpenAgent={actions.onOpenSubagents}
              />
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
