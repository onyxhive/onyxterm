import { invoke } from "@tauri-apps/api/core";
import type { AgentEvent, Capabilities } from "./agentEvents";
import type { GitTarget } from "./gitApi";
import type { PermissionMode } from "./permissionModes";
import type {
  Chat,
  ImageAttachment,
  PermissionDecision,
  Project,
  Provider,
  RuleScope,
  TaskStatus,
  Workspace,
} from "./types";

export interface ChatDraft {
  projectId: string;
  provider: Provider;
  command: string;
  model: string;
  effort: string;
  permissionMode: PermissionMode;
  fastMode?: boolean;
  ultracode?: boolean;
  title: string;
}

export interface ChatOptions {
  command: string;
  model: string;
  effort: string;
  permissionMode: PermissionMode;
  fastMode: boolean;
  ultracode: boolean;
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
  sendMessage: (chatId: string, text: string, attachments: ImageAttachment[]) =>
    invoke<void>("send_message", { chatId, text, attachments }),
  interruptChat: (chatId: string) => invoke<void>("interrupt_chat", { chatId }),
  updateChatOptions: (chatId: string, options: ChatOptions) =>
    invoke<Chat>("update_chat_options", { chatId, options }),
  answerPermission: (chatId: string, requestId: string, decision: PermissionDecision, suggestion?: RuleScope) =>
    invoke<void>("answer_permission", { chatId, requestId, decision, suggestion }),
  answerQuestion: (chatId: string, requestId: string, answers: Record<string, string>) =>
    invoke<void>("answer_question", { chatId, requestId, answers }),
  loadChatHistory: (chatId: string) => invoke<AgentEvent[]>("load_chat_history", { chatId }),
  discoverCapabilities: (command: string, projectId: string, model?: string) =>
    invoke<Capabilities>("discover_capabilities", { command, projectId, model }),
  listProjectFiles: (target: GitTarget) => invoke<string[]>("list_project_files", { target }),
  projectBranch: (projectId: string) => invoke<string | null>("project_branch", { projectId }),
};
