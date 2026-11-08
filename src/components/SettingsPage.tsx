import { useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { effortOptionsFor, modelChoices } from "../agentChoices";
import { CLAUDE_COMMANDS, DEFAULT_EFFORT } from "../agentOptions";
import type { Settings } from "../api";
import { GH_NOT_INSTALLED, ghProblemOf, PREFERRED_EDITOR_SETTING, prApi, WORK_IN_WORKTREES_SETTING } from "../gitApi";
import { comboKeys, KEYBINDINGS, SHORTCUT_COMMAND_TITLES } from "../keybindings";
import {
  BRANCH_PREFIX_SETTING,
  CHAT_WIDTH_SETTING,
  type ChatWidth,
  choiceOf,
  COLOR_SCHEME_SETTING,
  COLOR_SCHEMES,
  type ColorScheme,
  DEFAULT_BRANCH_PREFIX,
  DIFF_COLOR_SCHEME_SETTING,
  type DiffColorScheme,
  IN_APP_NOTIFICATIONS_SETTING,
  isToggleOn,
  isValidBranchPrefix,
  SEND_SHORTCUT_SETTING,
  type SendShortcut,
  START_FROM_REMOTE_SETTING,
  TIMESTAMP_FORMAT_SETTING,
  type TimestampFormat,
} from "../preferences";
import type { Project } from "../types";
import { useCapabilities } from "../useCapabilities";
import { useLoaded } from "../useLoaded";
import { MERGE_METHOD_LABELS, MERGE_METHODS, useMergeMethod } from "../useMergeMethod";
import { useEditors } from "../useProjectTools";
import { EffortPicker, ModelPicker, type AgentChoice } from "./ComposerControls";
import { Segmented } from "./Segmented";
import { type SelectOption, SettingsRow, SettingsSection, SettingsSelect, Switch } from "./settingsControls";
import { cn, Kbd, TEXT_INPUT } from "./ui";

interface SettingsPageProps {
  settings: Settings;
  projects: Project[];
  defaultChoice: AgentChoice;
  onDefaultChoiceChange: (choice: AgentChoice) => void;
  onRemember: (key: string, value: string) => void;
}

interface SettingsGroupProps {
  settings: Settings;
  onRemember: (key: string, value: string) => void;
}

const COLOR_SCHEME_LABELS: Record<ColorScheme, string> = { system: "System", light: "Light", dark: "Dark" };

const CHAT_WIDTH_OPTIONS: SelectOption<ChatWidth>[] = [
  { value: "comfortable", label: "Comfortable (default)" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full" },
];

const DIFF_COLOR_OPTIONS: SelectOption<DiffColorScheme>[] = [
  { value: "red-green", label: "Red & green (default)" },
  { value: "blue-orange", label: "Blue & orange" },
];

const TIMESTAMP_FORMAT_OPTIONS: SelectOption<TimestampFormat>[] = [
  { value: "locale", label: "System default" },
  { value: "12-hour", label: "12-hour" },
  { value: "24-hour", label: "24-hour" },
];

const SEND_SHORTCUT_OPTIONS: SelectOption<SendShortcut>[] = [
  { value: "enter", label: "Enter" },
  { value: "mod-enter-multiline", label: "⌘ + Enter for multiline prompts" },
  { value: "mod-enter", label: "⌘ + Enter always" },
];

const MERGE_METHOD_OPTIONS = MERGE_METHODS.map((method) => ({ value: method, label: MERGE_METHOD_LABELS[method] }));

const BRANCH_PREFIX_RULE = "Use up to 32 letters, digits, dashes, underscores, dots or slashes.";

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

function EditorRow({ settings, onRemember }: SettingsGroupProps) {
  const editors = useEditors().data ?? [];
  return (
    <SettingsRow
      title="Preferred editor"
      description="Open in uses this editor. Picking another editor from a chat changes it too."
      control={
        <SettingsSelect
          label="Preferred editor"
          options={editors.map((editor) => ({ value: editor.id, label: editor.name }))}
          value={settings[PREFERRED_EDITOR_SETTING]}
          emptyLabel="No editor found"
          onChange={(editorId) => onRemember(PREFERRED_EDITOR_SETTING, editorId)}
        />
      }
    />
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

function BranchPrefixRow({ settings, onRemember }: SettingsGroupProps) {
  const saved = settings[BRANCH_PREFIX_SETTING] ?? DEFAULT_BRANCH_PREFIX;
  const [draft, setDraft] = useState(saved);
  const isValid = isValidBranchPrefix(draft.trim());

  function save() {
    const prefix = draft.trim();
    if (isValid && prefix !== saved) onRemember(BRANCH_PREFIX_SETTING, prefix);
  }

  return (
    <SettingsRow
      title="Branch prefix"
      description={
        isValid ? "For example, onyx or onyx/ produces onyx/add-search. Leave empty for no prefix." : BRANCH_PREFIX_RULE
      }
      control={
        <input
          type="text"
          aria-label="Branch prefix"
          aria-invalid={!isValid}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="No prefix"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          className={cn(TEXT_INPUT, "w-40 font-mono text-xs aria-invalid:border-error")}
        />
      }
    />
  );
}

function KeybindingRows() {
  return KEYBINDINGS.map(({ combo, command }) => (
    <SettingsRow
      key={combo}
      title={SHORTCUT_COMMAND_TITLES[command]}
      control={
        <span className="flex items-center gap-1">
          {comboKeys(combo).map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </span>
      }
    />
  ));
}

function VersionRow() {
  const version = useLoaded("app-version", getVersion);
  return (
    <SettingsRow
      title={
        <span className="inline-flex items-baseline gap-2">
          <span>Version</span>
          <code className="text-2xs font-medium text-muted-foreground">{version.data ?? "unknown"}</code>
        </span>
      }
      description="Current version of the application."
    />
  );
}

function GeneralSections({ settings, onRemember }: SettingsGroupProps) {
  return (
    <>
      <SettingsSection title="Notifications">
        <SettingsRow
          title="In-app notifications"
          description={
            "Show a toast when another chat finishes, fails, or needs input or approval while this app has focus."
          }
          control={
            <Switch
              label="In-app notifications"
              isChecked={isToggleOn(settings, IN_APP_NOTIFICATIONS_SETTING, true)}
              onChange={(isChecked) => onRemember(IN_APP_NOTIFICATIONS_SETTING, String(isChecked))}
            />
          }
        />
      </SettingsSection>
      <SettingsSection title="Display">
        <SettingsRow
          title="Time format"
          description="System default follows your browser or OS clock preference."
          control={
            <SettingsSelect
              label="Timestamp format"
              options={TIMESTAMP_FORMAT_OPTIONS}
              value={settings[TIMESTAMP_FORMAT_SETTING]}
              onChange={(format) => onRemember(TIMESTAMP_FORMAT_SETTING, format)}
            />
          }
        />
      </SettingsSection>
    </>
  );
}

function AppearanceSection({ settings, onRemember }: SettingsGroupProps) {
  return (
    <SettingsSection title="Appearance">
      <SettingsRow
        title="Color scheme"
        description="Follow the system appearance, or always use light or dark."
        control={
          <Segmented
            label="Color scheme"
            options={COLOR_SCHEMES.map((scheme) => ({ value: scheme, label: COLOR_SCHEME_LABELS[scheme] }))}
            value={choiceOf(COLOR_SCHEMES, settings[COLOR_SCHEME_SETTING])}
            onChange={(scheme) => onRemember(COLOR_SCHEME_SETTING, scheme)}
          />
        }
      />
      <SettingsRow
        title="Chat width"
        description="Set how wide messages and the composer can grow on large screens."
        control={
          <SettingsSelect
            label="Chat width"
            options={CHAT_WIDTH_OPTIONS}
            value={settings[CHAT_WIDTH_SETTING]}
            onChange={(width) => onRemember(CHAT_WIDTH_SETTING, width)}
          />
        }
      />
      <SettingsRow
        title="Diff colors"
        description="Choose colors for additions and deletions, including change counts."
        control={
          <SettingsSelect
            label="Diff colors"
            options={DIFF_COLOR_OPTIONS}
            value={settings[DIFF_COLOR_SCHEME_SETTING]}
            onChange={(scheme) => onRemember(DIFF_COLOR_SCHEME_SETTING, scheme)}
          />
        }
      />
    </SettingsSection>
  );
}

function WorktreeSections({ settings, onRemember }: SettingsGroupProps) {
  return (
    <>
      <SettingsSection title="Worktrees">
        <SettingsRow
          title="Work in worktrees"
          description={
            "Each new chat gets its own git worktree on a new branch from the project's current branch, " +
            "kept in the app data folder under worktrees/<repository>/<branch>. Off runs new chats in the " +
            "project folder. Worktrees stay until you remove them from the chat's details, and a worktree " +
            "with uncommitted work is never removed."
          }
          control={
            <Switch
              label="Work in worktrees"
              isChecked={isToggleOn(settings, WORK_IN_WORKTREES_SETTING, false)}
              onChange={(isChecked) => onRemember(WORK_IN_WORKTREES_SETTING, String(isChecked))}
            />
          }
        />
        <SettingsRow
          title="Start from remote"
          description={
            "Uses the latest commit of the base branch’s tracked remote branch, even if its name differs. " +
            "Otherwise uses the same-named branch on origin. Uses your local branch if that remote branch is missing."
          }
          control={
            <Switch
              label="Start new worktrees from remote by default"
              isChecked={isToggleOn(settings, START_FROM_REMOTE_SETTING, false)}
              onChange={(isChecked) => onRemember(START_FROM_REMOTE_SETTING, String(isChecked))}
            />
          }
        />
      </SettingsSection>
      <SettingsSection title="Branches">
        <BranchPrefixRow settings={settings} onRemember={onRemember} />
      </SettingsSection>
    </>
  );
}

function SourceControlSection({ projectId }: { projectId: string | undefined }) {
  const [mergeMethod, chooseMergeMethod] = useMergeMethod();
  return (
    <SettingsSection title="Source control">
      <GhStatusRow projectId={projectId} />
      <SettingsRow
        title="Default merge method"
        description="Merging a pull request uses this method. Picking another method when merging changes it too."
        control={
          <SettingsSelect
            label="Default merge method"
            options={MERGE_METHOD_OPTIONS}
            value={mergeMethod}
            onChange={chooseMergeMethod}
          />
        }
      />
    </SettingsSection>
  );
}

export function SettingsPage(props: SettingsPageProps) {
  const { settings, projects, defaultChoice, onDefaultChoiceChange, onRemember } = props;
  const firstProjectId = projects[0]?.id;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 pt-6 pb-12 sm:px-6">
        <GeneralSections settings={settings} onRemember={onRemember} />
        <AppearanceSection settings={settings} onRemember={onRemember} />
        <SettingsSection title="Composer">
          <SettingsRow
            title="Send shortcut"
            description="Choose when Enter sends a prompt or inserts a new line"
            control={
              <SettingsSelect
                label="Send shortcut"
                options={SEND_SHORTCUT_OPTIONS}
                value={settings[SEND_SHORTCUT_SETTING]}
                onChange={(shortcut) => onRemember(SEND_SHORTCUT_SETTING, shortcut)}
              />
            }
          />
        </SettingsSection>
        <SettingsSection title="Providers">
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
        <WorktreeSections settings={settings} onRemember={onRemember} />
        <SettingsSection title="Editor">
          <EditorRow settings={settings} onRemember={onRemember} />
        </SettingsSection>
        <SourceControlSection projectId={firstProjectId} />
        <SettingsSection title="Keybindings">
          <KeybindingRows />
        </SettingsSection>
        <SettingsSection title="App">
          <VersionRow />
        </SettingsSection>
      </div>
    </div>
  );
}
