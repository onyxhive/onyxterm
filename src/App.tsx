import { useEffect, useRef, useState } from "react";
import { DEFAULT_EFFORT, DEFAULT_MODEL } from "./agentOptions";
import { Board } from "./components/Board";
import { ChatView, type ChatActions } from "./components/ChatView";
import { NewChat, type ChatChoice, type ChatStart } from "./components/NewChat";
import { Sidebar } from "./components/Sidebar";
import { TitleBar, type View } from "./components/TitleBar";
import { Toasts } from "./components/Toasts";
import { WorkPanel } from "./components/WorkPanel";
import { EMPTY_FEED } from "./feed";
import { isWaiting } from "./status";
import { toTask } from "./tasks";
import type { Chat, Provider, TaskStatus, Toast } from "./types";
import { useChats } from "./useChats";
import { useSettings } from "./useSettings";
import { useWorkspaces } from "./useWorkspaces";

const CHOICE_SETTING = "chatChoice";
const DEFAULT_CHOICE: ChatChoice = {
  provider: "Claude Code" as Provider,
  command: "claude-lyxa-team",
  model: DEFAULT_MODEL,
  effort: DEFAULT_EFFORT,
};

const ATTENTION_HEADLINES: Partial<Record<TaskStatus, string>> = {
  permission: "needs your permission",
  question: "asked you a question",
  review: "is waiting for you",
  failed: "failed",
};

function rememberedChoice(saved: string | undefined): ChatChoice {
  if (!saved) return DEFAULT_CHOICE;
  try {
    return { ...DEFAULT_CHOICE, ...(JSON.parse(saved) as Partial<ChatChoice>) };
  } catch {
    return DEFAULT_CHOICE;
  }
}

export default function App() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [view, setView] = useState<View>("chat");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isWorkPanelOpen, setIsWorkPanelOpen] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  function showError(message: string) {
    const toast: Toast = { id: `error-${Date.now()}`, taskId: "", headline: "Something failed", detail: message };
    setToasts((current) => [...current, toast]);
  }

  const { settings, remember } = useSettings();
  const workspaceState = useWorkspaces({ settings, remember, onError: showError });
  const { workspaces, workspace, actions: workspaceActions } = workspaceState;
  const selectedTaskIdRef = useRef(selectedTaskId);
  selectedTaskIdRef.current = selectedTaskId;

  function announce(chat: Chat) {
    const headline = ATTENTION_HEADLINES[chat.state];
    if (!headline || chat.id === selectedTaskIdRef.current) return;
    const toast: Toast = {
      id: `${chat.id}-${chat.state}`,
      taskId: chat.id,
      headline: `${chat.title} ${headline}`,
      detail: projectName(chat.projectId),
    };
    setToasts((current) => [...current.filter((candidate) => candidate.taskId !== chat.id), toast]);
  }

  const chatState = useChats({ onError: showError, onStateChange: announce });
  const { chats, feeds, startChat } = chatState;

  const now = Date.now();
  const tasks = chats.map((chat) => toTask(chat, feeds[chat.id] ?? EMPTY_FEED, now));
  const workspaceChatIds = new Set(chats.filter((chat) => chat.workspaceId === workspace?.id).map((chat) => chat.id));
  const workspaceTasks = tasks.filter((task) => workspaceChatIds.has(task.id));
  const selectedTask = workspaceTasks.find((task) => task.id === selectedTaskId) ?? null;
  const waitingTasks = workspaceTasks.filter((task) => isWaiting(task.status));
  const projects = workspaces.flatMap((candidate) => candidate.projects);

  useEffect(() => {
    if (selectedTaskId) void chatState.loadHistory(selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    function startNewChatByShortcut(event: KeyboardEvent) {
      if (!event.metaKey || event.key !== "n") return;
      event.preventDefault();
      openNewChat();
    }
    window.addEventListener("keydown", startNewChatByShortcut);
    return () => window.removeEventListener("keydown", startNewChatByShortcut);
  }, []);

  function projectName(projectId: string): string {
    return projects.find((project) => project.id === projectId)?.name ?? "removed project";
  }

  function openTask(taskId: string) {
    setSelectedTaskId(taskId);
    setView("chat");
  }

  function openNewChat() {
    setSelectedTaskId(null);
    setView("chat");
  }

  async function start(chatStart: ChatStart) {
    const { provider, command, model, effort } = chatStart;
    remember(CHOICE_SETTING, JSON.stringify({ provider, command, model, effort }));
    const chat = await startChat(chatStart);
    if (chat) setSelectedTaskId(chat.id);
  }

  function openToast(toast: Toast) {
    const chat = chats.find((candidate) => candidate.id === toast.taskId);
    if (chat) {
      workspaceActions.onSelect(chat.workspaceId);
      openTask(chat.id);
    }
    dismissToast(toast.id);
  }

  function dismissToast(toastId: string) {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }

  function withSelectedChat(action: (chatId: string) => void) {
    if (selectedTaskId) action(selectedTaskId);
  }

  const chatActions: ChatActions = {
    onReply: (text) => withSelectedChat((chatId) => chatState.send(chatId, text)),
    onDecide: (requestId, decision) => withSelectedChat((chatId) => chatState.decide(chatId, requestId, decision)),
    onAnswer: (requestId, answers) => withSelectedChat((chatId) => chatState.answer(chatId, requestId, answers)),
    onMarkDone: () => withSelectedChat((chatId) => chatState.setState(chatId, "done")),
    onReopen: () => withSelectedChat((chatId) => chatState.setState(chatId, "review")),
    onStop: () => withSelectedChat(chatState.stop),
    onToggleWorkPanel: () => setIsWorkPanelOpen(!isWorkPanelOpen),
  };

  function renderMain() {
    if (!workspace || !settings) return null;
    if (view === "board") return <Board tasks={workspaceTasks} projectName={projectName} onOpen={openTask} />;
    if (!selectedTask) {
      return (
        <NewChat
          key={`${workspace.id}-${workspace.projects.length}`}
          workspace={workspace}
          initialChoice={rememberedChoice(settings[CHOICE_SETTING])}
          initialProjectId={workspaceState.lastAddedProjectId}
          onStart={start}
          onAddProject={workspaceActions.onAddProject}
        />
      );
    }
    return (
      <ChatView
        task={selectedTask}
        projectName={projectName(selectedTask.projectId)}
        isWorkPanelOpen={isWorkPanelOpen}
        actions={chatActions}
      />
    );
  }

  const isWorkPanelVisible = view === "chat" && selectedTask !== null && isWorkPanelOpen;

  if (!workspace) return <div className="app" />;

  return (
    <div className="app">
      <TitleBar
        workspaces={workspaces}
        workspace={workspace}
        tasks={tasks}
        waitingCount={waitingTasks.length}
        view={view}
        onViewChange={setView}
        workspaceActions={{
          ...workspaceActions,
          onSelect: (workspaceId) => {
            workspaceActions.onSelect(workspaceId);
            setSelectedTaskId(null);
          },
        }}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onOpenWaiting={() => waitingTasks[0] && openTask(waitingTasks[0].id)}
      />
      <div className="app__body">
        <Sidebar
          tasks={workspaceTasks}
          selectedTaskId={view === "chat" ? (selectedTask?.id ?? null) : null}
          isNewChatActive={view === "chat" && selectedTask === null}
          isOpen={isSidebarOpen}
          onSelect={openTask}
          onNewChat={openNewChat}
        />
        <main className="app__main">
          {renderMain()}
          <Toasts toasts={toasts} tasks={tasks} onOpen={openToast} onDismiss={dismissToast} />
        </main>
        {isWorkPanelVisible && (
          <WorkPanel
            work={selectedTask.work}
            project={projects.find((project) => project.id === selectedTask.projectId)}
          />
        )}
      </div>
    </div>
  );
}
