import { useState } from "react";
import { Bot, Cpu, FolderGit2, FolderPlus, Gauge, TerminalSquare } from "lucide-react";
import { CLAUDE_COMMANDS, CODEX_COMMAND, FALLBACK_EFFORTS, FALLBACK_MODELS, PROVIDERS } from "../agentOptions";
import type { Provider, Workspace } from "../types";
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
  onStart: (start: ChatStart) => void;
  onAddProject: () => void;
}

const ADD_PROJECT = "Add project…";
const CODEX_COMING = "Codex support coming next";
const NO_SUGGESTIONS = { commands: [], mentions: [] };

export function NewChat({ workspace, initialChoice, onStart, onAddProject }: NewChatProps) {
  const [projectId, setProjectId] = useState(workspace.projects[0]?.id ?? "");
  const [choice, setChoice] = useState<ChatChoice>(initialChoice);

  const project = workspace.projects.find((candidate) => candidate.id === projectId) ?? workspace.projects[0];
  const isCodex = choice.provider === "Codex";
  const command = isCodex ? CODEX_COMMAND : choice.command;

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
    onStart({ ...choice, command, text, projectId: project.id });
  }

  const projectPicker = project ? (
    <PillSelect
      label="Project"
      icon={<FolderGit2 size={13} />}
      value={project.name}
      options={[...workspace.projects.map((candidate) => candidate.name), ADD_PROJECT]}
      onChange={chooseProject}
    />
  ) : (
    <button type="button" className="pill-select pill-select--action" onClick={onAddProject}>
      <FolderPlus size={13} />
      {ADD_PROJECT}
    </button>
  );

  const toolbar = (
    <>
      {projectPicker}
      <PillSelect
        label="Provider"
        icon={<Bot size={13} />}
        value={choice.provider}
        options={PROVIDERS}
        onChange={(value) => choose({ provider: value as Provider })}
      />
      <PillSelect
        label="Command"
        icon={<TerminalSquare size={13} />}
        value={command}
        options={isCodex ? [CODEX_COMMAND] : CLAUDE_COMMANDS}
        onChange={(value) => choose({ command: value })}
      />
      <PillSelect
        label="Model"
        icon={<Cpu size={13} />}
        value={choice.model}
        options={FALLBACK_MODELS}
        onChange={(value) => choose({ model: value })}
      />
      <PillSelect
        label="Effort"
        icon={<Gauge size={13} />}
        value={choice.effort}
        options={FALLBACK_EFFORTS}
        onChange={(value) => choose({ effort: value })}
      />
    </>
  );

  function sendBlockedReason(): string | undefined {
    if (!project) return "Add a project first";
    if (isCodex) return CODEX_COMING;
    return undefined;
  }

  return (
    <div className="new-chat">
      <div className="new-chat__column">
        <h1 className="new-chat__title">What should the agent work on?</h1>
        <p className="new-chat__subtitle">
          {project
            ? `It runs in ${project.path}. You can follow it here or on the board.`
            : "Add a project folder to start a chat in it."}
        </p>
        <Composer
          variant="hero"
          placeholder="Describe the change, or type / for commands and @ for agents"
          suggestionSources={NO_SUGGESTIONS}
          onSubmit={start}
          toolbar={toolbar}
          sendBlockedReason={sendBlockedReason()}
        />
      </div>
    </div>
  );
}
