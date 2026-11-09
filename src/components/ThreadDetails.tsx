import { useEffect, useState } from "react";
import { SquareMenu } from "lucide-react";
import type { GitTarget } from "../gitApi";
import type { Chat, Project, Task } from "../types";
import { useGitStatus } from "../useGit";
import { useScriptRun } from "../useProjectTools";
import { BranchRow } from "./BranchRow";
import { CommitRows, PullRequestRow } from "./CommitRows";
import { CreatePrDialog } from "./CreatePrDialog";
import { DETAILS_SECTION } from "./detailsStyles";
import { cn, ICON_BUTTON } from "./ui";
import { usePopup } from "./usePopup";
import { MachineRow, ScriptRows, type ScriptRunner } from "./WorkspaceRows";
import { WorktreeRow } from "./WorktreeRow";

export interface ThreadDetailsActions {
  onOpenDiff: () => void;
  onBranchChanged: () => void;
  onWorktreeRemoved: (chat: Chat) => void;
  onRunInTerminal: (command: string) => void;
  onError: (message: string) => void;
}

interface ThreadDetailsProps {
  task: Task;
  project: Project;
  actions: ThreadDetailsActions;
}

function useScriptRunner(runInTerminal: (command: string) => void): ScriptRunner {
  const [activeScriptId, setActiveScriptId] = useState<string>();
  const [isStartPending, setIsStartPending] = useState(false);
  const run = useScriptRun(activeScriptId);
  const { start } = run;

  useEffect(() => {
    if (!isStartPending || !activeScriptId) return;
    setIsStartPending(false);
    void start();
  }, [isStartPending, activeScriptId, start]);

  return {
    activeScriptId,
    run,
    start: (scriptId) => {
      setActiveScriptId(scriptId);
      setIsStartPending(true);
    },
    dismiss: () => setActiveScriptId(undefined),
    runInTerminal,
  };
}

export function ThreadDetails({ task, project, actions }: ThreadDetailsProps) {
  const popup = usePopup();
  const target: GitTarget = { chat: task.id };
  const status = useGitStatus(target);
  const runner = useScriptRunner((command) => {
    popup.close();
    actions.onRunInTerminal(command);
  });
  const [isCreatingPr, setIsCreatingPr] = useState(false);
  const { refresh } = status;

  useEffect(() => {
    if (popup.isOpen) refresh();
  }, [popup.isOpen, refresh]);

  function openDiff() {
    popup.close();
    actions.onOpenDiff();
  }

  function createPr() {
    popup.close();
    setIsCreatingPr(true);
  }

  function branchChanged() {
    refresh();
    actions.onBranchChanged();
  }

  return (
    <div className="relative" ref={popup.rootRef}>
      <button
        type="button"
        className={ICON_BUTTON}
        aria-label="Thread details"
        title="Thread details"
        aria-haspopup="dialog"
        aria-pressed={popup.isOpen}
        onClick={popup.toggle}
      >
        <SquareMenu />
      </button>
      {popup.isOpen && (
        <div
          role="dialog"
          aria-label="Thread details"
          className={cn(
            "dropdown-glass absolute top-full right-0 z-40 mt-2 w-[18rem] rounded-2xl text-foreground",
            "[-webkit-app-region:no-drag]",
          )}
        >
          <section aria-label="Workspace" className={DETAILS_SECTION}>
            <MachineRow target={target} onError={actions.onError} />
            <WorktreeRow task={task} onRemoved={actions.onWorktreeRemoved} />
            <ScriptRows projectId={project.id} runner={runner} onError={actions.onError} />
          </section>
          <section aria-label="Version control" className={DETAILS_SECTION}>
            <BranchRow target={target} branch={status.data?.branch ?? task.branch} onChanged={branchChanged} />
            {task.pr && <PullRequestRow pr={task.pr} />}
            <CommitRows
              target={target}
              status={status.data}
              hasOpenPr={task.pr?.state === "OPEN"}
              onStatusChanged={refresh}
              onCreatePr={createPr}
              onOpenDiff={openDiff}
            />
          </section>
        </div>
      )}
      {isCreatingPr && (
        <CreatePrDialog target={target} initialTitle={task.title} onClose={() => setIsCreatingPr(false)} />
      )}
    </div>
  );
}
