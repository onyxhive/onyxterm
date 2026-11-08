import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { effortOptionsFor, modelChoices } from "../agentChoices";
import { CLAUDE_COMMANDS, DEFAULT_EFFORT } from "../agentOptions";
import type { Settings } from "../api";
import { GH_NOT_INSTALLED, ghProblemOf, PREFERRED_EDITOR_SETTING, prApi, WORK_IN_WORKTREES_SETTING } from "../gitApi";
import type { Project } from "../types";
import { useCapabilities } from "../useCapabilities";
import { useLoaded } from "../useLoaded";
import { useEditors } from "../useProjectTools";
import { EffortPicker, ModelPicker, type AgentChoice } from "./ComposerControls";
import { cn, MENU_ITEM, MENU_POPUP } from "./ui";
import { usePopup } from "./usePopup";

interface SettingsPageProps {
  settings: Settings;
  projects: Project[];
  defaultChoice: AgentChoice;
  onDefaultChoiceChange: (choice: AgentChoice) => void;
  onRemember: (key: string, value: string) => void;
}

interface SettingsRowProps {
  title: string;
  description?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
}

const SECTION_CARD = cn(
  "rounded-xl border border-border/60 bg-card/40 shadow-xs/5",
  "[&>*+*]:border-t [&>*+*]:border-border/50",
);

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <h2 className="flex min-h-7 items-center px-3 text-base font-semibold text-foreground sm:px-4">{title}</h2>
      <div className={SECTION_CARD}>{children}</div>
    </section>
  );
}

function SettingsRow({ title, description, control, children }: SettingsRowProps) {
  return (
    <div className={cn("px-3 sm:px-4", children ? "pt-3 pb-3" : "py-3")}>
      <div className="flex items-center gap-8">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          {description && (
            <p className="max-w-2xl text-xs leading-normal text-pretty text-muted-foreground">{description}</p>
          )}
        </div>
        {control && <div className="flex shrink-0 items-center gap-2">{control}</div>}
      </div>
      {children}
    </div>
  );
}

interface DefaultAgentRowProps {
  choice: AgentChoice;
  projectId: string | undefined;
  onChange: (choice: AgentChoice) => void;
}

function DefaultAgentRow({ choice, projectId, onChange }: DefaultAgentRowProps) {
  const { capabilities } = useCapabilities(choice.command, projectId);
  const models = capabilities?.models ?? [];
  const efforts = effortOptionsFor(models.find((model) => model.value === choice.model));
  return (
    <SettingsRow
      title="Default agent"
      description="New chats start with this command, model and effort. Starting a chat also updates it."
      control={
        <>
          <ModelPicker
            choice={choice}
            models={modelChoices(models)}
            onChange={(update) => onChange({ ...choice, ...update })}
          />
          {efforts.length > 0 && (
            <EffortPicker
              effort={efforts.includes(choice.effort) ? choice.effort : DEFAULT_EFFORT}
              levels={efforts}
              onChange={(effort) => onChange({ ...choice, effort })}
            />
          )}
        </>
      }
    />
  );
}

interface CheckboxProps {
  label: string;
  isChecked: boolean;
  onChange: (isChecked: boolean) => void;
}

function Checkbox({ label, isChecked, onChange }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={isChecked}
      onChange={(event) => onChange(event.target.checked)}
      className="size-4 cursor-pointer accent-primary"
    />
  );
}

interface EditorSelectProps {
  preferred: string | undefined;
  onChange: (editorId: string) => void;
}

function EditorSelect({ preferred, onChange }: EditorSelectProps) {
  const popup = usePopup();
  const editors = useEditors().data ?? [];
  const current = editors.find((editor) => editor.id === preferred) ?? editors[0];
  return (
    <div className="relative" ref={popup.rootRef}>
      <button
        type="button"
        aria-label="Preferred editor"
        aria-haspopup="menu"
        aria-expanded={popup.isOpen}
        disabled={editors.length === 0}
        onClick={popup.toggle}
        className={cn(
          "inline-flex h-8 min-w-40 cursor-pointer items-center justify-between gap-2 rounded-lg border",
          "border-input bg-popover px-3 text-sm text-foreground shadow-xs/5 hover:bg-accent/50",
          "disabled:opacity-64 dark:bg-input/32",
        )}
      >
        {current?.name ?? "No editor found"}
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>
      {popup.isOpen && (
        <div role="menu" aria-label="Editors" className={cn(MENU_POPUP, "absolute top-full right-0 mt-1 w-56")}>
          {editors.map((editor) => (
            <button
              key={editor.id}
              type="button"
              role="menuitemradio"
              aria-checked={editor.id === current?.id}
              className={MENU_ITEM}
              onClick={() => {
                onChange(editor.id);
                popup.close();
              }}
            >
              {editor.name}
              <Check className={cn("ms-auto size-3.5", editor.id !== current?.id && "invisible")} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ghStatusLine(projectId: string | undefined, error: string | null, isLoading: boolean): string {
  if (!projectId) return "Add a project to check the GitHub CLI";
  if (isLoading) return "Checking the GitHub CLI…";
  if (!error) return "Signed in and ready";
  const problem = ghProblemOf(error);
  if (problem === GH_NOT_INSTALLED) return "Not installed. Install gh to see pull requests";
  if (problem) return "Not signed in. Run gh auth login in a terminal";
  return error;
}

function GhStatusRow({ projectId }: { projectId: string | undefined }) {
  const check = useLoaded(projectId ? `gh:${projectId}` : null, () => prApi.list(projectId ?? ""));
  const isReady = Boolean(projectId) && !check.isLoading && !check.error;
  return (
    <SettingsRow
      title="GitHub CLI"
      description="Pull requests, checks and merges go through gh."
      control={
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            aria-hidden
            className={cn("size-2 rounded-full", isReady ? "bg-success-foreground" : "bg-warning-foreground")}
          />
          {ghStatusLine(projectId, check.error, check.isLoading)}
        </span>
      }
    />
  );
}

export function SettingsPage(props: SettingsPageProps) {
  const { settings, projects, defaultChoice, onDefaultChoiceChange, onRemember } = props;
  const firstProjectId = projects[0]?.id;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 pt-6 pb-12 sm:px-6">
        <SettingsSection title="Chats">
          <DefaultAgentRow choice={defaultChoice} projectId={firstProjectId} onChange={onDefaultChoiceChange} />
          <SettingsRow
            title="Claude commands"
            description="The Claude Code launchers a chat can run. Pick one per chat in the agent menu."
          >
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {CLAUDE_COMMANDS.map((command) => (
                <li key={command} className="rounded-md bg-foreground/[0.06] px-2 py-0.5 font-mono text-xs">
                  {command}
                </li>
              ))}
            </ul>
          </SettingsRow>
        </SettingsSection>
        <SettingsSection title="Worktrees">
          <SettingsRow
            title="Work in worktrees"
            description={
              "Each new chat gets its own git worktree on a new onyx/ branch from the project's current branch, " +
              "kept in the app data folder under worktrees/<repository>/<branch>. Off runs new chats in the " +
              "project folder. Worktrees stay until you remove them from the chat's details, and a worktree " +
              "with uncommitted work is never removed."
            }
            control={
              <Checkbox
                label="Work in worktrees"
                isChecked={settings[WORK_IN_WORKTREES_SETTING] === "true"}
                onChange={(isChecked) => onRemember(WORK_IN_WORKTREES_SETTING, String(isChecked))}
              />
            }
          />
        </SettingsSection>
        <SettingsSection title="Editor">
          <SettingsRow
            title="Preferred editor"
            description="Open in uses this editor. Picking another editor from a chat changes it too."
            control={
              <EditorSelect
                preferred={settings[PREFERRED_EDITOR_SETTING]}
                onChange={(editorId) => onRemember(PREFERRED_EDITOR_SETTING, editorId)}
              />
            }
          />
        </SettingsSection>
        <SettingsSection title="GitHub">
          <GhStatusRow projectId={firstProjectId} />
        </SettingsSection>
      </div>
    </div>
  );
}
