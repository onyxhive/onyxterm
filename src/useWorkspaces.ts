import { useCallback, useEffect, useState } from "react";
import { api, type Settings } from "./api";
import type { ColorTone } from "./colorTones";
import type { Tag, Workspace } from "./types";

const WORKSPACE_SETTING = "workspaceId";

function inOrder(workspaces: Workspace[], workspaceIds: string[]): Workspace[] {
  return workspaceIds.flatMap((workspaceId) => workspaces.find((workspace) => workspace.id === workspaceId) ?? []);
}

interface WorkspacesInput {
  settings: Settings | null;
  remember: (key: string, value: string) => void;
  onError: (message: string) => void;
}

export function useWorkspaces({ settings, remember, onError }: WorkspacesInput) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [lastAddedProjectId, setLastAddedProjectId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [loadedWorkspaces, loadedTags] = await Promise.all([api.listWorkspaces(), api.listTags()]);
    setWorkspaces(loadedWorkspaces);
    setTags(loadedTags);
  }, []);

  const isSettingsLoaded = settings !== null;

  useEffect(() => {
    if (!settings) return;
    api.listWorkspaces().then(
      (loaded) => {
        setWorkspaces(loaded);
        const remembered = loaded.find((candidate) => candidate.id === settings[WORKSPACE_SETTING]);
        setWorkspaceId((remembered ?? loaded[0])?.id ?? null);
      },
      (error) => onError(String(error)),
    );
    api.listTags().then(setTags, (error) => onError(String(error)));
  }, [isSettingsLoaded]);

  const workspace = workspaces.find((candidate) => candidate.id === workspaceId) ?? workspaces[0] ?? null;

  const select = useCallback(
    (nextWorkspaceId: string) => {
      setWorkspaceId(nextWorkspaceId);
      remember(WORKSPACE_SETTING, nextWorkspaceId);
    },
    [remember],
  );

  async function guarded(work: () => Promise<unknown>) {
    try {
      await work();
      await reload();
    } catch (error) {
      onError(String(error));
    }
  }

  const actions = {
    onSelect: select,
    onCreate: (name: string) =>
      guarded(async () => {
        const created = await api.createWorkspace(name);
        select(created.id);
      }),
    onRename: (id: string, name: string) => guarded(() => api.renameWorkspace(id, name)),
    onReorder: (workspaceIds: string[]) => {
      const previous = workspaces;
      setWorkspaces(inOrder(workspaces, workspaceIds));
      return guarded(() =>
        api.reorderWorkspaces(workspaceIds).catch((error: unknown) => {
          setWorkspaces(previous);
          throw error;
        }),
      );
    },
    onCreateTag: (workspaceId: string, name: string, color: ColorTone) =>
      guarded(async () => {
        const created = await api.createTag(name, color);
        await api.attachTag(workspaceId, created.id);
      }),
    onAttachTag: (workspaceId: string, tagId: string) => guarded(() => api.attachTag(workspaceId, tagId)),
    onDetachTag: (workspaceId: string, tagId: string) => guarded(() => api.detachTag(workspaceId, tagId)),
    onSetTagColor: (tagId: string, color: ColorTone) => guarded(() => api.setTagColor(tagId, color)),
    onAddProject: () =>
      guarded(async () => {
        if (!workspace) return;
        const added = await api.addProject(workspace.id);
        if (added) setLastAddedProjectId(added.id);
      }),
    onRemoveProject: (projectId: string) => guarded(() => api.removeProject(projectId)),
  };

  return { workspaces, workspace, tags, actions, lastAddedProjectId };
}
