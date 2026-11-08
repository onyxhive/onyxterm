import { invoke } from "@tauri-apps/api/core";
import type { Chat, Project, Provider, TaskStatus, Workspace } from "./types";

export interface ChatDraft {
  projectId: string;
  provider: Provider;
  command: string;
  model: string;
  effort: string;
  title: string;
}

export type Settings = Record<string, string>;

export const api = {
  listWorkspaces: () => invoke<Workspace[]>("list_workspaces"),
  createWorkspace: (name: string) => invoke<Workspace>("create_workspace", { name }),
  renameWorkspace: (workspaceId: string, name: string) => invoke<void>("rename_workspace", { workspaceId, name }),
  addProject: (workspaceId: string) => invoke<Project | null>("add_project", { workspaceId }),
  removeProject: (projectId: string) => invoke<void>("remove_project", { projectId }),
  listChats: () => invoke<Chat[]>("list_chats"),
  createChat: (draft: ChatDraft) => invoke<Chat>("create_chat", { draft }),
  setChatState: (chatId: string, state: TaskStatus) => invoke<Chat>("set_chat_state", { chatId, state }),
  getSettings: () => invoke<Settings>("get_settings"),
  setSetting: (key: string, value: string) => invoke<void>("set_setting", { key, value }),
};
