import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { CHAT_EVENT, type AgentEvent, type ChatEventPayload } from "./agentEvents";
import { agentApi, gitApi, prApi, PRS_UPDATED, type GitTarget, type PrsUpdatedPayload } from "./gitApi";
import type { PrState, Subagent } from "./types";
import { useLoaded } from "./useLoaded";

export function targetKey(target: GitTarget): string {
  return "chat" in target ? `chat:${target.chat}` : `project:${target.project}`;
}

export function useBranches(target: GitTarget) {
  return useLoaded(targetKey(target), () => gitApi.branches(target));
}

export function usePrs(projectId: string | undefined, state: PrState = "open") {
  const loaded = useLoaded(projectId ? `${projectId}:${state}` : null, () => prApi.list(projectId ?? "", state));
  const { refresh } = loaded;

  useEffect(() => {
    if (!projectId) return;
    const unlisten = listen<PrsUpdatedPayload>(PRS_UPDATED, ({ payload }) => {
      if (payload.projectId === projectId) refresh();
    });
    return () => {
      unlisten.then((stop) => stop());
    };
  }, [projectId, refresh]);

  return loaded;
}

export function usePr(projectId: string | undefined, number: number | undefined) {
  const key = projectId && number ? `${projectId}:${number}` : null;
  return useLoaded(key, () => prApi.view(projectId ?? "", number ?? 0));
}

function startedSubagent(event: Extract<AgentEvent, { kind: "subagentStarted" }>, now: string): Subagent {
  return {
    toolUseId: event.toolUseId,
    agentType: event.agentType,
    description: event.description,
    status: "running",
    lastTool: null,
    summary: null,
    startedAt: now,
    lastActivityAt: now,
  };
}

function updated(list: Subagent[], toolUseId: string, change: (subagent: Subagent) => Subagent): Subagent[] {
  return list.map((subagent) => (subagent.toolUseId === toolUseId ? change(subagent) : subagent));
}

export function applySubagentEvent(list: Subagent[], event: AgentEvent, now: string): Subagent[] {
  switch (event.kind) {
    case "subagentStarted":
      if (list.some((subagent) => subagent.toolUseId === event.toolUseId)) return list;
      return [...list, startedSubagent(event, now)];
    case "subagentProgress":
      return updated(list, event.toolUseId, (subagent) => ({
        ...subagent,
        lastTool: event.lastTool ?? subagent.lastTool,
        lastActivityAt: now,
      }));
    case "subagentFinished":
      return updated(list, event.toolUseId, (subagent) => ({
        ...subagent,
        status: event.isError ? "failed" : "completed",
        summary: event.summary || subagent.summary,
        lastActivityAt: now,
      }));
    default:
      return list;
  }
}

export function useSubagents(chatId: string | undefined) {
  const loaded = useLoaded(chatId ?? null, () => agentApi.subagents(chatId ?? ""));
  const [subagents, setSubagents] = useState<Subagent[]>([]);

  useEffect(() => {
    setSubagents(loaded.data ?? []);
  }, [loaded.data]);

  useEffect(() => {
    if (!chatId) return;
    const unlisten = listen<ChatEventPayload>(CHAT_EVENT, ({ payload }) => {
      if (payload.chatId !== chatId) return;
      setSubagents((current) => applySubagentEvent(current, payload.event, new Date().toISOString()));
    });
    return () => {
      unlisten.then((stop) => stop());
    };
  }, [chatId]);

  return { subagents, error: loaded.error, isLoading: loaded.isLoading, refresh: loaded.refresh };
}
