import { useMemo, useState } from "react";
import { FolderGit2, FolderPlus } from "lucide-react";
import {
  CLAUDE_COMMANDS,
  CODEX_COMMAND,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  FALLBACK_EFFORTS,
  FALLBACK_MODELS,
  PROVIDERS,
} from "../agentOptions";
import type { ModelOption } from "../agentEvents";
import type { Provider, Workspace } from "../types";
import { suggestionSources, useCapabilities } from "../useCapabilities";
import { useProjectFiles } from "../useProjectFiles";
import { Composer } from "./Composer";
import { PillSelect } from "./PillSelect";

export interface ChatChoice {
  provider: Provider;
  command: string;
  model: string;
  effort: string;
}

export interface ChatStart extends ChatChoice {
  text: string;
  projectId: string;
}

interface NewChatProps {
  workspace: Workspace;
  initialChoice: ChatChoice;
  initialProjectId: string | null;
  onStart: (start: ChatStart) => void;
  onAddProject: () => void;
}

const ADD_PROJECT = "Add project…";
const CODEX_COMING = "Codex support coming next";

function effortOptionsFor(model: ModelOption | undefined): string[] {
  if (!model) return FALLBACK_EFFORTS;
  return model.supportsEffort ? model.supportedEffortLevels : [];
}

function pickOption(options: string[], preferred: string, fallback: string): string {
  if (options.includes(preferred)) return preferred;
  if (options.includes(fallback)) return fallback;
  return options[0] ?? "";
}

export function NewChat({ workspace, initialChoice, initialProjectId, onStart, onAddProject }: NewChatProps) {
  const [projectId, setProjectId] = useState(initialProjectId ?? workspace.projects[0]?.id ?? "");
  const [choice, setChoice] = useState<ChatChoice>(initialChoice);

  const project = workspace.projects.find((candidate) => candidate.id === projectId) ?? workspace.projects[0];
  const isCodex = choice.provider === "Codex";
  const command = isCodex ? CODEX_COMMAND : choice.command;
  const { capabilities, problem } = useCapabilities(command, project?.id);
  const files = useProjectFiles(project?.id);
  const sources = useMemo(() => suggestionSources(capabilities, files), [capabilities, files]);
  const models = capabilities?.models ?? [];
  const modelOptions = models.length > 0 ? models.map((model) => model.value) : FALLBACK_MODELS;
  const model = pickOption(modelOptions, choice.model, DEFAULT_MODEL);
  const modelDetails = models.find((candidate) => candidate.value === model);
  const effortOptions = effortOptionsFor(modelDetails);
  const effort = pickOption(effortOptions, choice.effort, DEFAULT_EFFORT);

  function choose(update: Partial<ChatChoice>) {
    setChoice({ ...choice, ...update });
  }

  function chooseProject(name: string) {
    if (name === ADD_PROJECT) {
      onAddProject();
      return;
    }
    const picked = workspace.projects.find((candidate) => candidate.name === name);
    if (picked) setProjectId(picked.id);
  }

  function start(text: string) {
    if (!project) return;
    onStart({ ...choice, command, model, effort, text, projectId: project.id });
  }

  const projectPicker = project ? (
    <PillSelect
      label="Project"
      icon={<FolderGit2 size={15} strokeWidth={1.75} />}
      value={project.name}
      options={[...workspace.projects.map((candidate) => candidate.name), ADD_PROJECT]}
      onChange={chooseProject}
    />
  ) : (
    <button type="button" className="pill-select pill-select--action" onClick={onAddProject}>
      <FolderPlus size={15} strokeWidth={1.75} />
      {ADD_PROJECT}
    </button>
  );

  const toolbar = (
    <>
      {projectPicker}
      <PillSelect
        label="Provider"
        value={choice.provider}
        options={PROVIDERS}
        onChange={(value) => choose({ provider: value as Provider })}
      />
      <PillSelect
        label="Command"
        value={command}
        options={isCodex ? [CODEX_COMMAND] : CLAUDE_COMMANDS}
        onChange={(value) => choose({ command: value })}
      />
      <PillSelect
        label="Model"
        value={model}
        options={modelOptions}
        onChange={(value) => choose({ model: value })}
      />
      {effortOptions.length > 0 && (
        <PillSelect
          label="Effort"
          value={effort}
          options={effortOptions}
          onChange={(value) => choose({ effort: value })}
        />
      )}
    </>
  );

  function sendBlockedReason(): string | undefined {
    if (!project) return "Add a project first";
    if (isCodex) return CODEX_COMING;
    return problem ?? undefined;
  }

  return (
    <div className="new-chat">
      <div className="new-chat__column">
        <h1 className="new-chat__title">What should we build?</h1>
        {!project && <p className="new-chat__subtitle">Add a project folder to start a chat in it.</p>}
        {problem && <p className="new-chat__problem">{problem}</p>}
        <Composer
          variant="hero"
          placeholder="Describe the change. Type / for commands, @ for files"
          suggestionSources={sources}
          onSubmit={start}
          toolbar={toolbar}
          sendBlockedReason={sendBlockedReason()}
        />
        {project && <p className="new-chat__where">Runs in {project.path}</p>}
      </div>
    </div>
  );
}
