import { AgentStack } from "./SubagentRow";
import { cn, FOCUS_RING } from "./ui";
import { subagentTitle, type SubagentEntry } from "./useSubagentEntries";

function launchSentence(agents: SubagentEntry[]): string {
  const names = agents.map(subagentTitle);
  const subject = names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${subject} started working`;
}

export function SubagentLaunchLine({ agents, onOpen }: { agents: SubagentEntry[]; onOpen: () => void }) {
  if (agents.length === 0) return null;
  const sentence = launchSentence(agents);
  return (
    <div className="pb-3">
      <button
        type="button"
        title={sentence}
        onClick={onOpen}
        className={cn(
          "flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-1 text-left text-sm",
          "text-muted-foreground transition-colors hover:text-foreground",
          FOCUS_RING,
        )}
      >
        <AgentStack agentIds={agents.map((agent) => agent.toolUseId)} />
        <span className="min-w-0 truncate">{sentence}</span>
      </button>
    </div>
  );
}
