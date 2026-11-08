import { useMemo, useState } from "react";
import { Check, ChevronDown, Folder, FolderGit2, FolderPlus, TriangleAlert } from "lucide-react";
import { effortOptionsFor, modelChoices, pickOption } from "../agentChoices";
import { CODEX_COMMAND, DEFAULT_EFFORT, DEFAULT_MODEL } from "../agentOptions";
import type { PermissionMode } from "../permissionModes";
import type { ImageAttachment, Project, Workspace } from "../types";
import { suggestionSources, useCapabilities } from "../useCapabilities";
import { useProjectFiles } from "../useProjectFiles";
import { Composer, COMPOSER_PLACEHOLDER } from "./Composer";
import { AgentPicker } from "./AgentPicker";
import { CONTROL_CLASS, type AgentChoice } from "./ComposerControls";
import { cn, MENU_ITEM, MENU_POPUP, MenuLabel, MenuSeparator, OUTLINE_BUTTON } from "./ui";
import { usePopup } from "./usePopup";

export interface ChatStart extends AgentChoice {
  text: string;
  attachments: ImageAttachment[];
  projectId: string;
  permissionMode: PermissionMode;
}

interface NewChatProps {
  workspace: Workspace;
  initialChoice: AgentChoice;
  initialPermissionMode: PermissionMode;
  projectId: string | null;
  isWorktreeMode: boolean;
  onStart: (start: ChatStart) => void;
  onPickProject: (projectId: string) => void;
  onAddProject: () => void;
}

const CODEX_COMING = "Codex support coming next";
const ADD_PROJECT_FIRST = "Add a project first";

interface ProjectPickerProps {
  project: Project;
  projects: Project[];
  onPick: (projectId: string) => void;
  onAddProject: () => void;
}

function ProjectPicker({ project, projects, onPick, onAddProject }: ProjectPickerProps) {
  const popup = usePopup();

  function choose(action: () => void) {
    action();
    popup.close();
  }

  return (
    <div className="relative min-w-0" ref={popup.rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={popup.isOpen}
        aria-label={`Project: ${project.name}`}
        title={project.path}
        className={cn(CONTROL_CLASS, "max-w-56")}
        onClick={popup.toggle}
      >
        <Folder />
        <span className="truncate">{project.name}</span>
        <ChevronDown className="-me-1 size-3.5" />
      </button>
      {popup.isOpen && (
        <div
          role="menu"
          aria-label="Projects"
          className={cn(MENU_POPUP, "absolute top-full left-0 mt-2 w-max max-w-[min(24rem,90vw)] min-w-48")}
        >
          <MenuLabel>Project</MenuLabel>
          {projects.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="menuitemradio"
              aria-checked={candidate.id === project.id}
              title={candidate.path}
              className={MENU_ITEM}
              onClick={() => choose(() => onPick(candidate.id))}
            >
              <Folder />
              <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
              <Check className={cn("size-3.5", candidate.id !== project.id && "invisible")} />
            </button>
          ))}
          <MenuSeparator />
          <button type="button" className={MENU_ITEM} onClick={() => choose(onAddProject)}>
            <FolderPlus />
            Add project…
          </button>
        </div>
      )}
    </div>
  );
}

export function NewChat(props: NewChatProps) {
  const { workspace, initialChoice, projectId, isWorktreeMode, onStart, onPickProject, onAddProject } = props;
  const [choice, setChoice] = useState<AgentChoice>(initialChoice);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(props.initialPermissionMode);

  const project = workspace.projects.find((candidate) => candidate.id === projectId) ?? workspace.projects[0];
  const isCodex = choice.provider === "Codex";
  const command = isCodex ? CODEX_COMMAND : choice.command;
  const { capabilities, problem } = useCapabilities(command, project?.id);
  const files = useProjectFiles(project ? { project: project.id } : undefined);
  const sources = useMemo(() => suggestionSources(capabilities, files), [capabilities, files]);
  const models = capabilities?.models ?? [];
  const choices = modelChoices(models);
  const model = pickOption(
    choices.map((candidate) => candidate.value),
    choice.model,
    DEFAULT_MODEL,
  );
  const effortOptions = effortOptionsFor(models.find((candidate) => candidate.value === model));
  const effort = pickOption(effortOptions, choice.effort, DEFAULT_EFFORT);
  const resolvedChoice: AgentChoice = { ...choice, command, model, effort };

  function start(text: string, attachments: ImageAttachment[]) {
    if (!project) return;
    onStart({ ...resolvedChoice, text, attachments, projectId: project.id, permissionMode });
  }

  function sendBlockedReason(): string | undefined {
    if (!project) return ADD_PROJECT_FIRST;
    if (isCodex) return CODEX_COMING;
    return problem ?? undefined;
  }

  const controls = (
    <>
      {project && (
        <ProjectPicker
          project={project}
          projects={workspace.projects}
          onPick={onPickProject}
          onAddProject={onAddProject}
        />
      )}
    </>
  );

  const agentControls = (
    <AgentPicker
      choice={resolvedChoice}
      models={choices}
      efforts={effortOptions}
      permissionMode={permissionMode}
      align="end"
      onChange={(update) => setChoice({ ...choice, ...update })}
      onPermissionModeChange={setPermissionMode}
    />
  );

  const footnote = (
    <div className="flex min-w-0 flex-col gap-1 px-2 pt-2 text-xs text-muted-foreground">
      {project && isWorktreeMode && (
        <span className="flex min-w-0 items-center gap-1.5" title={project.path}>
          <FolderGit2 className="size-3.5 shrink-0" />
          <span className="truncate">Runs in a new worktree of {project.name} on its own branch</span>
        </span>
      )}
      {problem && (
        <span className="flex min-w-0 items-center gap-1.5 text-warning-foreground">
          <TriangleAlert className="size-3.5 shrink-0" />
          <span className="truncate">{problem}</span>
        </span>
      )}
    </div>
  );

  return (
    <div className="relative flex min-h-0 flex-1 items-center overflow-y-auto px-5 pb-[8vh]">
      <div className="relative mx-auto w-full max-w-(--chat-content-max-width)">
        <div className="absolute inset-x-0 bottom-full pb-5">
          {project ? (
            <h1
              className={cn(
                "flex w-full flex-wrap items-baseline justify-center gap-x-2 text-center text-3xl font-normal",
                "tracking-tight text-foreground",
              )}
            >
              <span>What should we build in</span>
              <span className="max-w-full min-w-0 truncate font-medium" title={project.path}>
                {project.name}?
              </span>
            </h1>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <h1 className="text-center text-3xl font-normal tracking-tight text-foreground">
                Add a project to start
              </h1>
              <button type="button" className={OUTLINE_BUTTON} onClick={onAddProject}>
                <FolderPlus />
                Add project
              </button>
            </div>
          )}
        </div>
        <Composer
          variant="hero"
          placeholder={COMPOSER_PLACEHOLDER}
          suggestionSources={sources}
          onSubmit={start}
          controls={controls}
          agentControls={agentControls}
          footnote={footnote}
          sendBlockedReason={sendBlockedReason()}
        />
      </div>
    </div>
  );
}
