import { useEffect, useState } from "react";
import { CheckCheck, Ellipsis, RotateCcw } from "lucide-react";
import type { GitTarget } from "../gitApi";
import type { Chat, GitStatus, Project, Task } from "../types";
import type { Loaded } from "../useLoaded";
import { useScriptRun } from "../useProjectTools";
import { BranchRow } from "./BranchRow";
import { CommitRows, PullRequestRow } from "./CommitRows";
import { CreatePrDialog } from "./CreatePrDialog";
import { DETAILS_ICON, DETAILS_LABEL, DETAILS_ROW, DETAILS_SECTION } from "./detailsStyles";
import { cn, ICON_BUTTON } from "./ui";
import { usePopup } from "./usePopup";
import { MachineRow, ScriptRows, type ScriptRunner } from "./WorkspaceRows";
import { WorktreeRow } from "./WorktreeRow";

export interface ThreadDetailsActions {
  onMarkDone: () => void;
  onReopen: () => void;
  onOpenDiff: () => void;
  onBranchChanged: () => void;
  onWorktreeRemoved: (chat: Chat) => void;
  onRunInTerminal: (command: string) => void;
  onError: (message: string) => void;
}

interface ThreadDetailsProps {
  task: Task;
  project: Project | undefined;
  status: Loaded<GitStatus>;
  actions: ThreadDetailsActions;
}

function DoneRow({ isDone, onClick }: { isDone: boolean; onClick: () => void }) {
  const Icon = isDone ? RotateCcw : CheckCheck;
  return (
    <button type="button" className={DETAILS_ROW} onClick={onClick}>
      <Icon aria-hidden className={DETAILS_ICON} />
      <span className={DETAILS_LABEL}>{isDone ? "Reopen" : "Mark done"}</span>
    </button>
  );
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

export function ThreadDetails({ task, project, status, actions }: ThreadDetailsProps) {
  const popup = usePopup();
  const target: GitTarget = { chat: task.id };
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

  const isDone = task.status === "done";

  function toggleDone() {
    popup.close();
    const change = isDone ? actions.onReopen : actions.onMarkDone;
    change();
  }

  function branchChanged() {
    refresh();
    actions.onBranchChanged();
  }

  return (
    <div className="relative" ref={popup.rootRef}>
      <button
        type="button"
        className={cn(ICON_BUTTON, "aria-expanded:bg-accent aria-expanded:text-foreground")}
        aria-label="More actions"
        title="More"
        aria-haspopup="dialog"
        aria-expanded={popup.isOpen}
        onClick={popup.toggle}
      >
        <Ellipsis />
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
          {project && (
            <>
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
            </>
          )}
          <section aria-label="Chat" className={DETAILS_SECTION}>
            <DoneRow isDone={isDone} onClick={toggleDone} />
          </section>
        </div>
      )}
      {isCreatingPr && (
        <CreatePrDialog target={target} initialTitle={task.title} onClose={() => setIsCreatingPr(false)} />
      )}
    </div>
  );
}
