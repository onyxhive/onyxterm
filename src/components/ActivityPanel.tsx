import { SquareTerminal } from "lucide-react";
import type { RunningShell } from "../types";
import { cn } from "./ui";
import { useNow } from "./useNow";
import { formatDuration } from "./WorkingRow";

const MS_PER_SECOND = 1000;

function ShellRow({ shell }: { shell: RunningShell }) {
  const now = useNow(true);
  const seconds = Math.max(0, Math.floor((now - shell.startedAt) / MS_PER_SECOND));

  return (
    <li className="flex min-w-0 items-center gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0">
      <span
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-card"
      >
        <SquareTerminal aria-hidden className="size-3.5 text-muted-foreground" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="live-tool-shine truncate text-sm text-foreground">{shell.description || shell.command}</span>
        {shell.description && (
          <code className="truncate font-mono text-xs text-muted-foreground" title={shell.command}>
            {shell.command}
          </code>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
        <span>{shell.isBackground ? "In background" : "Running"}</span>
        <span>{formatDuration(seconds)}</span>
      </span>
    </li>
  );
}

export function ActivityPanel({ shells }: { shells: RunningShell[] }) {
  if (shells.length === 0) return null;

  return (
    <section aria-label="Working now" className="shrink-0 px-5 pt-3">
      <ul
        className={cn(
          "mx-auto max-h-[40vh] w-full max-w-(--chat-content-max-width) overflow-y-auto rounded-xl border",
          "border-border bg-card",
        )}
      >
        {shells.map((shell) => (
          <ShellRow key={shell.toolUseId} shell={shell} />
        ))}
      </ul>
    </section>
  );
}
