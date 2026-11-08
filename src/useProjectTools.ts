import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { desktopApi, SCRIPT_EXITED, SCRIPT_OUTPUT, scriptApi } from "./gitApi";
import type { ScriptExited, ScriptOutput } from "./types";
import { useLoaded } from "./useLoaded";

const MACHINE_KEY = "machine";
const EDITORS_KEY = "editors";
const MAX_SCRIPT_LINES = 2000;

export function useMachineName() {
  return useLoaded(MACHINE_KEY, desktopApi.machineName);
}

export function useEditors() {
  return useLoaded(EDITORS_KEY, desktopApi.editors);
}

export function useScripts(projectId: string | undefined) {
  return useLoaded(projectId ?? null, () => scriptApi.list(projectId ?? ""));
}

export interface ScriptRunState {
  runId: string | null;
  lines: ScriptOutput[];
  exitCode: number | null;
  isRunning: boolean;
}

const NOT_STARTED: ScriptRunState = { runId: null, lines: [], exitCode: null, isRunning: false };

function withLine(current: ScriptRunState, output: ScriptOutput): ScriptRunState {
  const previous = current.runId === output.runId ? current.lines : [];
  const lines = [...previous, output].slice(-MAX_SCRIPT_LINES);
  return { runId: output.runId, lines, exitCode: null, isRunning: true };
}

function withExit(current: ScriptRunState, exited: ScriptExited): ScriptRunState {
  const lines = current.runId === exited.runId ? current.lines : [];
  return { runId: exited.runId, lines, exitCode: exited.code, isRunning: false };
}

export function useScriptRun(scriptId: string | undefined) {
  const [run, setRun] = useState<ScriptRunState>(NOT_STARTED);

  useEffect(() => {
    setRun(NOT_STARTED);
    if (!scriptId) return;
    const subscriptions = [
      listen<ScriptOutput>(SCRIPT_OUTPUT, ({ payload }) => {
        if (payload.scriptId === scriptId) setRun((current) => withLine(current, payload));
      }),
      listen<ScriptExited>(SCRIPT_EXITED, ({ payload }) => {
        if (payload.scriptId === scriptId) setRun((current) => withExit(current, payload));
      }),
    ];
    return () => {
      subscriptions.forEach((subscription) => subscription.then((stop) => stop()));
    };
  }, [scriptId]);

  async function start() {
    if (!scriptId) return;
    const runId = await scriptApi.run(scriptId);
    setRun((current) => (current.runId === runId ? current : { ...NOT_STARTED, runId, isRunning: true }));
  }

  async function stop() {
    if (run.runId && run.isRunning) await scriptApi.stop(run.runId);
  }

  return { ...run, start, stop };
}
