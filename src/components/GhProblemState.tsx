import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, KeyRound, RotateCw } from "lucide-react";
import { GH_NOT_INSTALLED, type GhProblem } from "../gitApi";
import { CopyButton } from "./CopyButton";
import { cn, OUTLINE_BUTTON } from "./ui";

const GH_DOWNLOAD_URL = "https://cli.github.com";
const GH_LOGIN_COMMAND = "gh auth login";

interface GhProblemStateProps {
  problem: GhProblem;
  onRetry: () => void;
  className?: string;
}

export function GhProblemState({ problem, onRetry, className }: GhProblemStateProps) {
  const isMissing = problem === GH_NOT_INSTALLED;
  const Icon = isMissing ? Download : KeyRound;
  return (
    <div role="status" className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/[0.06] text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">
          {isMissing ? "Install GitHub CLI" : "Sign in to GitHub CLI"}
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          {isMissing
            ? "Pull requests come from the gh command line tool. Install it, then come back."
            : "Run this in a terminal to connect gh to your GitHub account, then retry."}
        </p>
      </div>
      {!isMissing && (
        <div className="flex items-center gap-1 rounded-lg bg-code py-1 ps-3 pe-1 font-mono text-sm">
          <code>{GH_LOGIN_COMMAND}</code>
          <CopyButton text={GH_LOGIN_COMMAND} label="Copy command" variant="code" />
        </div>
      )}
      <div className="flex gap-2">
        {isMissing && (
          <button type="button" className={OUTLINE_BUTTON} onClick={() => void openUrl(GH_DOWNLOAD_URL)}>
            <Download />
            Get GitHub CLI
          </button>
        )}
        <button type="button" className={OUTLINE_BUTTON} onClick={onRetry}>
          <RotateCw />
          Retry
        </button>
      </div>
    </div>
  );
}
