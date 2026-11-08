import { useEffect, useState } from "react";
import type { Capabilities } from "./agentEvents";
import { CODEX_COMMAND } from "./agentOptions";
import { api } from "./api";
import type { Suggestion } from "./types";
import type { SuggestionSources } from "./components/composerTrigger";

interface CapabilityState {
  capabilities: Capabilities | null;
  problem: string | null;
}

const EMPTY_STATE: CapabilityState = { capabilities: null, problem: null };
const cache = new Map<string, Promise<Capabilities>>();

function discover(command: string, projectId: string): Promise<Capabilities> {
  const key = `${command}\u0000${projectId}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = api.discoverCapabilities(command, projectId);
  cache.set(key, pending);
  pending.then(
    (capabilities) => {
      if (!isLoggedIn(capabilities)) cache.delete(key);
    },
    () => cache.delete(key),
  );
  return pending;
}

function isLoggedIn(capabilities: Capabilities): boolean {
  return Boolean(capabilities.account.subscriptionType || capabilities.account.email);
}

export function useCapabilities(command: string, projectId: string | undefined): CapabilityState {
  const [state, setState] = useState<CapabilityState>(EMPTY_STATE);

  useEffect(() => {
    setState(EMPTY_STATE);
    if (!projectId || command === CODEX_COMMAND) return;
    let isCurrent = true;
    discover(command, projectId).then(
      (capabilities) => {
        if (!isCurrent) return;
        const problem = isLoggedIn(capabilities) ? null : `Run \`${command} auth login\` in a terminal first`;
        setState({ capabilities, problem });
      },
      (error) => isCurrent && setState({ capabilities: null, problem: String(error) }),
    );
    return () => {
      isCurrent = false;
    };
  }, [command, projectId]);

  return state;
}

export function suggestionSources(capabilities: Capabilities | null): SuggestionSources {
  if (!capabilities) return { commands: [], mentions: [] };
  const commands: Suggestion[] = capabilities.commands.map((command) => ({
    value: `/${command.name}`,
    hint: command.argumentHint,
    description: command.description,
  }));
  const mentions: Suggestion[] = capabilities.agents.map((agent) => ({
    value: `@agent-${agent.name}`,
    hint: "agent",
    description: agent.description,
  }));
  return { commands, mentions };
}
