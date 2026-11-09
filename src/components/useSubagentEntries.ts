import type { FeedItem, Step, Subagent, Task } from "../types";
import { useSubagents } from "../useGit";
import type { SubagentView } from "./SubagentRow";

export type SubagentEntry = SubagentView & { toolUseId: string; steps: Step[]; needsApproval: boolean };

export function pendingToolIds(feed: FeedItem[]): Set<string> {
  return new Set(feed.flatMap((item) => (item.kind === "permission" && item.toolUseId ? [item.toolUseId] : [])));
}

function subagentWith(subagents: Subagent[], toolUseId: string): Subagent | undefined {
  return subagents.find((subagent) => subagent.toolUseId === toolUseId);
}

function subagentEntries(feed: FeedItem[], subagents: Subagent[]): SubagentEntry[] {
  const awaited = pendingToolIds(feed);
  return feed.flatMap((item) => {
    if (item.kind !== "subagent") return [];
    const needsApproval = item.steps.some((step) => awaited.has(step.id));
    return [{ ...item, ...subagentWith(subagents, item.toolUseId), steps: item.steps, needsApproval }];
  });
}

export function useSubagentEntries(task: Task): SubagentEntry[] {
  const { subagents } = useSubagents(task.id);
  return subagentEntries(task.feed, subagents);
}

export function subagentTitle(agent: SubagentEntry): string {
  return agent.description || agent.agentType;
}
