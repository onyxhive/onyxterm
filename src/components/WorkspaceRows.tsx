import { useEffect, useRef, useState, type FormEvent } from "react";
import { FolderOpen, Laptop, Play, Plus, Square, SquareTerminal, X } from "lucide-react";
import { desktopApi, scriptApi, type GitTarget } from "../gitApi";
import type { Editor, ProjectScript } from "../types";
import { useMachineName, useScripts, type ScriptRunState } from "../useProjectTools";
import { DETAILS_ICON, DETAILS_ICON_ACTION, DETAILS_LABEL, DETAILS_ROW, DETAILS_STATIC_ROW } from "./detailsStyles";
import { cn, GHOST_BUTTON, PRIMARY_BUTTON, TEXT_INPUT } from "./ui";

interface WorkspaceRowsProps {
  projectId: string;
  onError: (message: string) => void;
}

interface TargetRowProps {
  target: GitTarget;
  onError: (message: string) => void;
}

export function MachineRow({ target, onError }: TargetRowProps) {
  const machine = useMachineName();
  return (
    <div className={DETAILS_STATIC_ROW}>
      <Laptop aria-hidden className={DETAILS_ICON} />
      <span className={cn(DETAILS_LABEL, "flex-1")}>{machine.data ?? "This Mac"}</span>
      <button
        type="button"
        className={cn(DETAILS_ICON_ACTION, "-me-1.5")}
        aria-label="Reveal the project folder"
        title="Reveal in Finder"
        onClick={() => desktopApi.revealProject(target).catch((error) => onError(String(error)))}
      >
        <FolderOpen />
      </button>
    </div>
  );
}

export function preferredOf(editors: Editor[], preferred: string | undefined): Editor | null {
  return editors.find((editor) => editor.id === preferred) ?? editors[0] ?? null;
}

export interface ScriptRunner {
  activeScriptId: string | undefined;
  run: ScriptRunState & { stop: () => Promise<void> };
  start: (scriptId: string) => void;
  dismiss: () => void;
  runInTerminal: (command: string) => void;
}

interface ScriptRowsProps extends WorkspaceRowsProps {
  runner: ScriptRunner;
}

function ScriptRow({ script, runner }: { script: ProjectScript; runner: ScriptRunner }) {
  const isRunning = runner.activeScriptId === script.id && runner.run.isRunning;
  return (
    <div className="group/script relative flex items-center">
      <button
        type="button"
        aria-label={`Run ${script.name}`}
        title={script.command}
        disabled={isRunning}
        className={DETAILS_ROW}
        onClick={() => runner.start(script.id)}
      >
        <Play aria-hidden className={cn(DETAILS_ICON, isRunning && "text-info-foreground")} />
        <span className={DETAILS_LABEL}>{script.name}</span>
        <span
          className={cn(
            "ms-auto min-w-0 truncate font-mono text-2xs font-normal text-muted-foreground",
            "group-hover/script:me-7 group-focus-within/script:me-7",
          )}
        >
          {script.command}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Open ${script.name} in terminal`}
        title="Open in terminal"
        onClick={() => runner.runInTerminal(script.command)}
        className={cn(
          DETAILS_ICON_ACTION,
          "absolute right-1.5 opacity-0 group-hover/script:opacity-100 focus-visible:opacity-100",
        )}
      >
        <SquareTerminal />
      </button>
    </div>
  );
}

function exitLabel(code: number | null): string {
  return code === null ? "Stopped" : `Exited with code ${code}`;
}

function ScriptOutput({ script, runner }: { script: ProjectScript | undefined; runner: ScriptRunner }) {
  const outputRef = useRef<HTMLPreElement>(null);
  const { run } = runner;

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [run.lines.length]);

  return (
    <section
      aria-label={`${script?.name ?? "Script"} output`}
      className="mx-0.5 mt-1 mb-0.5 overflow-hidden rounded-lg border border-border/70 bg-code"
    >
      <header className="flex h-8 items-center gap-2 border-b border-border/60 ps-2.5 pe-1 text-xs">
        <span className="min-w-0 truncate font-medium text-foreground/85">{script?.name}</span>
        {run.isRunning ? (
          <span className="live-tool-shine shrink-0 text-muted-foreground">Running</span>
        ) : (
          <span className={cn("shrink-0", run.exitCode === 0 ? "text-success-foreground" : "text-error-foreground")}>
            {exitLabel(run.exitCode)}
          </span>
        )}
        <span className="flex-1" />
        {run.isRunning ? (
          <button type="button" className={cn(GHOST_BUTTON, "h-6 gap-1 px-2 text-xs")} onClick={() => run.stop()}>
            <Square className="size-3! fill-current" />
            Stop
          </button>
        ) : (
          <button type="button" className={DETAILS_ICON_ACTION} aria-label="Close output" onClick={runner.dismiss}>
            <X />
          </button>
        )}
      </header>
      <pre ref={outputRef} className="max-h-44 overflow-auto px-2.5 py-2 font-mono text-2xs leading-4">
        {run.lines.length === 0 && <span className="text-muted-foreground">Waiting for output…</span>}
        {run.lines.map((line, index) => (
          <div key={index} className={line.stream === "stderr" ? "text-error-foreground" : "text-foreground/85"}>
            {line.line || " "}
          </div>
        ))}
      </pre>
    </section>
  );
}

interface AddScriptFormProps {
  onAdd: (name: string, command: string) => Promise<void>;
  onCancel: () => void;
}

function AddScriptForm({ onAdd, onCancel }: AddScriptFormProps) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    await onAdd(name.trim(), command.trim());
    setIsSaving(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5 px-1 pt-1 pb-0.5" aria-label="Add project script">
      <input
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        className={cn(TEXT_INPUT, "h-7 text-[13px]")}
        placeholder="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <input
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn(TEXT_INPUT, "h-7 font-mono text-xs")}
        placeholder="Command, like npm test"
        value={command}
        onChange={(event) => setCommand(event.target.value)}
      />
      <div className="flex justify-end gap-1">
        <button type="button" className={cn(GHOST_BUTTON, "h-7 px-2.5 text-xs")} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className={cn(PRIMARY_BUTTON, "h-7 px-2.5 text-xs")}
          disabled={!name.trim() || !command.trim() || isSaving}
        >
          Add script
        </button>
      </div>
    </form>
  );
}

export function ScriptRows({ projectId, runner, onError }: ScriptRowsProps) {
  const scripts = useScripts(projectId);
  const [isAdding, setIsAdding] = useState(false);
  const list = scripts.data ?? [];
  const activeScript = list.find((script) => script.id === runner.activeScriptId);

  async function add(name: string, command: string) {
    try {
      await scriptApi.add(projectId, name, command);
      setIsAdding(false);
      scripts.refresh();
    } catch (error) {
      onError(String(error));
    }
  }

  return (
    <>
      {list.map((script) => (
        <ScriptRow key={script.id} script={script} runner={runner} />
      ))}
      {runner.activeScriptId && <ScriptOutput script={activeScript} runner={runner} />}
      {isAdding ? (
        <AddScriptForm onAdd={add} onCancel={() => setIsAdding(false)} />
      ) : (
        <button
          type="button"
          className={cn(DETAILS_ROW, "text-muted-foreground/80 hover:text-foreground/80")}
          onClick={() => setIsAdding(true)}
        >
          <Plus aria-hidden className="size-4" />
          <span className={DETAILS_LABEL}>Add project script</span>
        </button>
      )}
    </>
  );
}
