import { useEffect, useState } from "react";
import { SquareMenu } from "lucide-react";
import type { EditorId, Project, Task } from "../types";
import { useGitStatus } from "../useGit";
import { useScriptRun } from "../useProjectTools";
import { BranchRow } from "./BranchRow";
import { CommitRows, PullRequestRow } from "./CommitRows";
import { CreatePrDialog } from "./CreatePrDialog";
import { DETAILS_SECTION } from "./detailsStyles";
import { PreviousAgents } from "./PreviousAgents";
import { cn, ICON_BUTTON } from "./ui";
import { usePopup } from "./usePopup";
import { MachineRow, OpenInRow, ScriptRows, type ScriptRunner } from "./WorkspaceRows";

export interface ThreadDetailsActions {
  onPreferEditor: (editorId: EditorId) => void;
  onOpenDiff: () => void;
  onBranchChanged: () => void;
  onError: (message: string) => void;
}

interface ThreadDetailsProps {
  task: Task;
  project: Project;
  preferredEditor: string | undefined;
  actions: ThreadDetailsActions;
}

function useScriptRunner(): ScriptRunner {
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
  };
}

export function ThreadDetails({ task, project, preferredEditor, actions }: ThreadDetailsProps) {
  const popup = usePopup();
  const status = useGitStatus(project.id);
  const runner = useScriptRunner();
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
            <MachineRow projectId={project.id} onError={actions.onError} />
            <OpenInRow
              projectId={project.id}
              preferredEditor={preferredEditor}
              onPreferEditor={actions.onPreferEditor}
              onError={actions.onError}
            />
            <ScriptRows projectId={project.id} runner={runner} onError={actions.onError} />
          </section>
          <section aria-label="Version control" className={DETAILS_SECTION}>
            <BranchRow projectId={project.id} branch={status.data?.branch ?? task.branch} onChanged={branchChanged} />
            {task.pr && <PullRequestRow pr={task.pr} />}
            <CommitRows
              projectId={project.id}
              status={status.data}
              onStatusChanged={refresh}
              onCreatePr={createPr}
              onOpenDiff={openDiff}
            />
          </section>
          <PreviousAgentsSection chatId={task.id} />
        </div>
      )}
      {isCreatingPr && (
        <CreatePrDialog projectId={project.id} initialTitle={task.title} onClose={() => setIsCreatingPr(false)} />
      )}
    </div>
  );
}

function PreviousAgentsSection({ chatId }: { chatId: string }) {
  return (
    <section aria-label="Previous agents" className={cn(DETAILS_SECTION, "empty:hidden")}>
      <PreviousAgents chatId={chatId} />
    </section>
  );
}
