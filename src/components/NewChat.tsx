import { useCallback, useMemo, useRef, useState } from "react";
import { Folder, FolderOpen, FolderPlus, TriangleAlert } from "lucide-react";
import { CODEX_COMMAND, DEFAULT_EFFORT, DEFAULT_MODEL, FALLBACK_EFFORTS, FALLBACK_MODELS } from "../agentOptions";
import type { ModelOption } from "../agentEvents";
import type { Project, Workspace } from "../types";
import { suggestionSources, useCapabilities } from "../useCapabilities";
import { useProjectFiles } from "../useProjectFiles";
import { Composer, COMPOSER_PLACEHOLDER } from "./Composer";
import {
  EffortPicker,
  ModelPicker,
  NewBranchToggle,
  type AgentChoice,
  type ModelChoice,
} from "./ComposerControls";
import { cn, INLINE_BUTTON, MENU_ITEM, MENU_POPUP, MenuSeparator, OUTLINE_BUTTON } from "./ui";
import { useDismiss } from "./useDismiss";

export interface ChatStart extends AgentChoice {
  text: string;
  projectId: string;
  newBranch: boolean;
}

interface NewChatProps {
  workspace: Workspace;
  initialChoice: AgentChoice;
  initialProjectId: string | null;
  onStart: (start: ChatStart) => void;
  onAddProject: () => void;
}

const CODEX_COMING = "Codex support coming next";
const ADD_PROJECT_FIRST = "Add a project first";

function effortOptionsFor(model: ModelOption | undefined): string[] {
  if (!model) return FALLBACK_EFFORTS;
  return model.supportsEffort ? model.supportedEffortLevels : [];
}

function pickOption(options: string[], preferred: string, fallback: string): string {
  if (options.includes(preferred)) return preferred;
  if (options.includes(fallback)) return fallback;
  return options[0] ?? "";
}

function modelChoices(models: ModelOption[]): ModelChoice[] {
  if (models.length === 0) return FALLBACK_MODELS.map((value) => ({ value, label: value, description: "" }));
  return models.map((model) => ({ value: model.value, label: model.displayName, description: model.description }));
}

interface ProjectPickerProps {
  project: Project;
  projects: Project[];
  onPick: (projectId: string) => void;
  onAddProject: () => void;
}

function ProjectPicker({ project, projects, onPick, onAddProject }: ProjectPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(rootRef, isOpen, close);

  function choose(action: () => void) {
    action();
    close();
  }

  return (
    <span className="relative inline-flex min-w-0" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={project.path}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          INLINE_BUTTON,
          "min-w-0 font-medium text-foreground decoration-from-font underline-offset-4 aria-expanded:underline",
        )}
      >
        <span className="truncate">{project.name}</span>
      </button>
      {isOpen && (
        <div
          role="menu"
          aria-label="Projects"
          className={cn(
            MENU_POPUP,
            "absolute top-full left-1/2 mt-2 w-72 -translate-x-1/2 text-left text-sm tracking-normal",
          )}
        >
          {projects.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="menuitemradio"
              aria-checked={candidate.id === project.id}
              className={MENU_ITEM}
              onClick={() => choose(() => onPick(candidate.id))}
            >
              <Folder />
              <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
              <span className="max-w-32 truncate text-xs text-muted-foreground">{candidate.path}</span>
            </button>
          ))}
          <MenuSeparator />
          <button type="button" className={MENU_ITEM} onClick={() => choose(onAddProject)}>
            <FolderPlus />
            Add project
          </button>
        </div>
      )}
    </span>
  );
}

export function NewChat({ workspace, initialChoice, initialProjectId, onStart, onAddProject }: NewChatProps) {
  const [projectId, setProjectId] = useState(initialProjectId ?? workspace.projects[0]?.id ?? "");
  const [choice, setChoice] = useState<AgentChoice>(initialChoice);
  const [isNewBranch, setIsNewBranch] = useState(false);

  const project = workspace.projects.find((candidate) => candidate.id === projectId) ?? workspace.projects[0];
  const isCodex = choice.provider === "Codex";
  const command = isCodex ? CODEX_COMMAND : choice.command;
  const { capabilities, problem } = useCapabilities(command, project?.id);
  const files = useProjectFiles(project?.id);
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

  function start(text: string) {
    if (!project) return;
    onStart({ ...resolvedChoice, text, projectId: project.id, newBranch: isNewBranch });
  }

  function sendBlockedReason(): string | undefined {
    if (!project) return ADD_PROJECT_FIRST;
    if (isCodex) return CODEX_COMING;
    return problem ?? undefined;
  }

  const controls = (
    <>
      <ModelPicker
        choice={resolvedChoice}
        models={choices}
        onChange={(update) => setChoice({ ...choice, ...update })}
      />
      {effortOptions.length > 0 && (
        <EffortPicker
          effort={effort}
          levels={effortOptions}
          onChange={(next) => setChoice({ ...choice, effort: next })}
        />
      )}
      <NewBranchToggle isOn={isNewBranch} onChange={setIsNewBranch} />
    </>
  );

  const footnote = (
    <div className="flex min-w-0 flex-col gap-1 px-2 pt-2 text-xs text-muted-foreground">
      {project && (
        <span className="flex min-w-0 items-center gap-1.5" title={project.path}>
          <FolderOpen className="size-3.5 shrink-0" />
          <span className="truncate">Runs in {project.path}</span>
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
              <span className="inline-flex max-w-full min-w-0 items-baseline">
                <ProjectPicker
                  project={project}
                  projects={workspace.projects}
                  onPick={setProjectId}
                  onAddProject={onAddProject}
                />
                ?
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
          footnote={footnote}
          sendBlockedReason={sendBlockedReason()}
        />
      </div>
    </div>
  );
}
