import { useState } from "react";
import { Bot, Cpu, FolderGit2, Gauge, TerminalSquare } from "lucide-react";
import { COMMANDS, EFFORTS, MODELS, PROVIDERS, type Provider, type Workspace } from "../mock";
import { Composer } from "./Composer";
import { PillSelect } from "./PillSelect";

export interface ChatDraft {
  text: string;
  projectId: string;
  provider: Provider;
  command: string;
  model: string;
  effort: string;
}

interface NewChatProps {
  workspace: Workspace;
  onStart: (draft: ChatDraft) => void;
}

const CODEX_COMMAND = "codex";

export function NewChat({ workspace, onStart }: NewChatProps) {
  const [projectName, setProjectName] = useState(workspace.projects[0].name);
  const [provider, setProvider] = useState<Provider>("Claude Code");
  const [command, setCommand] = useState(COMMANDS[2]);
  const [model, setModel] = useState(MODELS[0]);
  const [effort, setEffort] = useState("high");

  const project = workspace.projects.find((candidate) => candidate.name === projectName) ?? workspace.projects[0];
  const isCodex = provider === "Codex";
  const commands = isCodex ? [CODEX_COMMAND] : COMMANDS;

  function start(text: string) {
    onStart({ text, projectId: project.id, provider, command: isCodex ? CODEX_COMMAND : command, model, effort });
  }

  const toolbar = (
    <>
      <PillSelect
        label="Project"
        icon={<FolderGit2 size={13} />}
        value={project.name}
        options={workspace.projects.map((candidate) => candidate.name)}
        onChange={setProjectName}
      />
      <PillSelect
        label="Provider"
        icon={<Bot size={13} />}
        value={provider}
        options={PROVIDERS}
        onChange={(value) => setProvider(value as Provider)}
      />
      <PillSelect
        label="Command"
        icon={<TerminalSquare size={13} />}
        value={isCodex ? CODEX_COMMAND : command}
        options={commands}
        onChange={setCommand}
      />
      <PillSelect label="Model" icon={<Cpu size={13} />} value={model} options={MODELS} onChange={setModel} />
      <PillSelect label="Effort" icon={<Gauge size={13} />} value={effort} options={EFFORTS} onChange={setEffort} />
    </>
  );

  return (
    <div className="new-chat">
      <div className="new-chat__column">
        <h1 className="new-chat__title">What should the agent work on?</h1>
        <p className="new-chat__subtitle">
          It runs in {project.path} on its own branch. You can follow it here or on the board.
        </p>
        <Composer
          variant="hero"
          placeholder="Describe the change, or type / for commands and @ for files"
          onSubmit={start}
          toolbar={toolbar}
        />
      </div>
    </div>
  );
}
