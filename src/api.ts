import { invoke } from "@tauri-apps/api/core";
import type { AgentEvent, Capabilities } from "./agentEvents";
import type { PermissionDecision } from "./components/PermissionCard";
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
  sendMessage: (chatId: string, text: string) => invoke<void>("send_message", { chatId, text }),
  interruptChat: (chatId: string) => invoke<void>("interrupt_chat", { chatId }),
  answerPermission: (chatId: string, requestId: string, decision: PermissionDecision) =>
    invoke<void>("answer_permission", { chatId, requestId, decision }),
  answerQuestion: (chatId: string, requestId: string, answers: Record<string, string>) =>
    invoke<void>("answer_question", { chatId, requestId, answers }),
  loadChatHistory: (chatId: string) => invoke<AgentEvent[]>("load_chat_history", { chatId }),
  discoverCapabilities: (command: string, projectId: string) =>
    invoke<Capabilities>("discover_capabilities", { command, projectId }),
  listProjectFiles: (projectId: string) => invoke<string[]>("list_project_files", { projectId }),
};
