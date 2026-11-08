import { useCallback, useEffect, useState } from "react";
import { api, type Settings } from "./api";
import type { Workspace } from "./types";

const WORKSPACE_SETTING = "workspaceId";

interface WorkspacesInput {
  settings: Settings | null;
  remember: (key: string, value: string) => void;
  onError: (message: string) => void;
}

export function useWorkspaces({ settings, remember, onError }: WorkspacesInput) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setWorkspaces(await api.listWorkspaces());
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
    onAddProject: () => guarded(async () => workspace && api.addProject(workspace.id)),
    onRemoveProject: (projectId: string) => guarded(() => api.removeProject(projectId)),
  };

  return { workspaces, workspace, actions };
}
