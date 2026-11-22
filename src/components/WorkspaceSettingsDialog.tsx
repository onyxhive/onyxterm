import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";
import { COLOR_TONES, type ColorTone } from "../colorTones";
import type { Tag, Workspace } from "../types";
import { Dialog } from "./Dialog";
import { TagChip } from "./TagChip";
import { TonePicker } from "./TonePicker";
import { cn, GHOST_BUTTON, OUTLINE_BUTTON, TEXT_INPUT } from "./ui";

const FIELD_LABEL = "flex flex-col gap-1 text-xs font-medium text-muted-foreground";
const MAX_WORKSPACE_NAME_LENGTH = 80;
const MAX_TAG_NAME_LENGTH = 32;

export interface WorkspaceSettingsActions {
  onRename: (workspaceId: string, name: string) => void;
  onCreateTag: (workspaceId: string, name: string, color: ColorTone) => void;
  onAttachTag: (workspaceId: string, tagId: string) => void;
  onDetachTag: (workspaceId: string, tagId: string) => void;
  onSetTagColor: (tagId: string, color: ColorTone) => void;
}

interface WorkspaceSettingsDialogProps {
  workspace: Workspace;
  tags: Tag[];
  actions: WorkspaceSettingsActions;
  onClose: () => void;
}

function WorkspaceNameField({ workspace, onRename }: { workspace: Workspace; onRename: (name: string) => void }) {
  const [name, setName] = useState(workspace.name);

  function commit() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === workspace.name) {
      setName(workspace.name);
      return;
    }
    onRename(trimmed);
  }

  function commitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") commit();
  }

  return (
    <label className={FIELD_LABEL}>
      Name
      <input
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={MAX_WORKSPACE_NAME_LENGTH}
        className={TEXT_INPUT}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
        onKeyDown={commitOnEnter}
      />
    </label>
  );
}

interface TagOptionProps {
  tag: Tag;
  isAttached: boolean;
  onToggle: () => void;
  onRecolor: (color: ColorTone) => void;
}

function TagOption({ tag, isAttached, onToggle, onRecolor }: TagOptionProps) {
  return (
    <li className="flex h-8 items-center gap-2 rounded-md px-1.5 hover:bg-accent/50">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
        <input type="checkbox" className="size-4 accent-(--primary)" checked={isAttached} onChange={onToggle} />
        <TagChip tag={tag} />
      </label>
      <TonePicker selected={tag.color} label={`${tag.name} color`} onPick={onRecolor} />
    </li>
  );
}

function NewTagForm({ onCreate }: { onCreate: (name: string, color: ColorTone) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<ColorTone>(COLOR_TONES[0]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), color);
    setName("");
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={MAX_TAG_NAME_LENGTH}
        placeholder="New tag"
        aria-label="New tag name"
        className={cn(TEXT_INPUT, "flex-1")}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <TonePicker selected={color} label="New tag color" onPick={setColor} />
      <button type="submit" className={OUTLINE_BUTTON} disabled={!name.trim()}>
        <Plus />
        Add
      </button>
    </form>
  );
}

export function WorkspaceSettingsDialog({ workspace, tags, actions, onClose }: WorkspaceSettingsDialogProps) {
  const attachedTagIds = new Set(workspace.tags.map((tag) => tag.id));

  function toggle(tag: Tag) {
    if (attachedTagIds.has(tag.id)) {
      actions.onDetachTag(workspace.id, tag.id);
      return;
    }
    actions.onAttachTag(workspace.id, tag.id);
  }

  return (
    <Dialog title="Workspace settings" description={workspace.name} onClose={onClose}>
      <div className="flex flex-col gap-4 px-5 pb-5">
        <WorkspaceNameField workspace={workspace} onRename={(name) => actions.onRename(workspace.id, name)} />
        <section aria-label="Tags" className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Tags</span>
          {tags.length > 0 && (
            <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
              {tags.map((tag) => (
                <TagOption
                  key={tag.id}
                  tag={tag}
                  isAttached={attachedTagIds.has(tag.id)}
                  onToggle={() => toggle(tag)}
                  onRecolor={(color) => actions.onSetTagColor(tag.id, color)}
                />
              ))}
            </ul>
          )}
          <NewTagForm onCreate={(name, color) => actions.onCreateTag(workspace.id, name, color)} />
        </section>
        <div className="flex justify-end">
          <button type="button" className={GHOST_BUTTON} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Dialog>
  );
}
