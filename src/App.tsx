import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DEFAULT_EFFORT, DEFAULT_MODEL } from "./agentOptions";
import { Board } from "./components/Board";
import { ChangesPanel } from "./components/ChangesPanel";
import { ChatHeader, type ChatHeaderActions } from "./components/ChatHeader";
import { ChatView, type ChatActions } from "./components/ChatView";
import type { AgentChoice } from "./components/ComposerControls";
import { NewChat, type ChatStart } from "./components/NewChat";
import { Sidebar, type SidebarActions } from "./components/Sidebar";
import { SidebarToggle, TopBar, TopBarHeading, type View } from "./components/TitleBar";
import { Toasts } from "./components/Toasts";
import { useIsFullscreen } from "./components/useIsFullscreen";
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher";
import { EMPTY_FEED } from "./feed";
import { displayTitle, toTask } from "./tasks";
import type { Chat, Provider, TaskStatus, Toast } from "./types";
import { collapsedSectionsFrom } from "./collapsedSections";
import { useChats } from "./useChats";
import { useProjectBranches } from "./useProjectBranches";
import { useSettings } from "./useSettings";
import { useWorkspaces } from "./useWorkspaces";

const CHOICE_SETTING = "chatChoice";
const DEFAULT_CHOICE: AgentChoice = {
  provider: "Claude Code" as Provider,
  command: "claude-lyxa-team",
  model: DEFAULT_MODEL,
  effort: DEFAULT_EFFORT,
};

const IS_MAC = navigator.platform.startsWith("Mac");
const MAC_WINDOW_CONTROLS_INSET = { "--workspace-controls-left": "90px" } as CSSProperties;

const ROOM_FOR_CHANGES_PANEL = "(min-width: 1181px)";

const TURN_END_STATES = new Set<TaskStatus>(["review", "failed"]);

const ATTENTION_HEADLINES: Partial<Record<TaskStatus, string>> = {
  permission: "needs your permission",
  question: "asked you a question",
  review: "is waiting for you",
  failed: "failed",
};

function rememberedChoice(saved: string | undefined): AgentChoice {
  if (!saved) return DEFAULT_CHOICE;
  try {
    return { ...DEFAULT_CHOICE, ...(JSON.parse(saved) as Partial<AgentChoice>) };
  } catch {
    return DEFAULT_CHOICE;
  }
}

export default function App() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [view, setView] = useState<View>("chat");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const isFullscreen = useIsFullscreen();
  const [isChangesPanelOpen, setIsChangesPanelOpen] = useState(
    () => window.matchMedia(ROOM_FOR_CHANGES_PANEL).matches,
  );
  const [newChatProjectId, setNewChatProjectId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  function showError(message: string) {
    const toast: Toast = { id: `error-${Date.now()}`, taskId: "", headline: "Something failed", detail: message };
    setToasts((current) => [...current, toast]);
  }

  const { settings, remember } = useSettings();
  const workspaceState = useWorkspaces({ settings, remember, onError: showError });
  const { workspaces, workspace, actions: workspaceActions } = workspaceState;
  const projects = workspaces.flatMap((candidate) => candidate.projects);
  const { branches, refresh: refreshBranch } = useProjectBranches(projects.map((project) => project.id));
  const sidebarSections = collapsedSectionsFrom(settings, remember);
  const selectedTaskIdRef = useRef(selectedTaskId);
  selectedTaskIdRef.current = selectedTaskId;

  function announce(chat: Chat) {
    const headline = ATTENTION_HEADLINES[chat.state];
    if (!headline || chat.id === selectedTaskIdRef.current) return;
    const toast: Toast = {
      id: `${chat.id}-${chat.state}`,
      taskId: chat.id,
      headline: `${displayTitle(chat.title)} ${headline}`,
      detail: projectName(chat.projectId),
    };
    setToasts((current) => [...current.filter((candidate) => candidate.taskId !== chat.id), toast]);
  }

  function onStateChange(chat: Chat) {
    announce(chat);
    if (TURN_END_STATES.has(chat.state)) refreshBranch(chat.projectId);
  }

  const chatState = useChats({ onError: showError, onStateChange });
  const { chats, feeds, startChat } = chatState;

  const now = Date.now();
  const tasks = chats.map((chat) => toTask(chat, feeds[chat.id] ?? EMPTY_FEED, now));
  const workspaceChatIds = new Set(chats.filter((chat) => chat.workspaceId === workspace?.id).map((chat) => chat.id));
  const workspaceTasks = tasks.filter((task) => workspaceChatIds.has(task.id));
  const selectedTask = workspaceTasks.find((task) => task.id === selectedTaskId) ?? null;

  useEffect(() => {
    if (selectedTaskId) void chatState.loadHistory(selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    const toggleChangesPanel = () => setIsChangesPanelOpen((isOpen) => !isOpen);
    const shortcuts: Record<string, () => void> = {
      n: () => openNewChat(),
      "shift+o": () => openNewChat(),
      b: () => setIsSidebarOpen((isOpen) => !isOpen),
      d: toggleChangesPanel,
      "alt+b": toggleChangesPanel,
    };
    function runShortcut(event: KeyboardEvent) {
      if (!event.metaKey || event.ctrlKey) return;
      const modifiers = [event.shiftKey && "shift", event.altKey && "alt"].filter(Boolean);
      const shortcut = shortcuts[[...modifiers, event.code.replace(/^Key/, "").toLowerCase()].join("+")];
      if (!shortcut) return;
      event.preventDefault();
      shortcut();
    }
    window.addEventListener("keydown", runShortcut);
    return () => window.removeEventListener("keydown", runShortcut);
  }, []);

  function projectName(projectId: string): string {
    return projects.find((project) => project.id === projectId)?.name ?? "removed project";
  }

  function openTask(taskId: string) {
    setSelectedTaskId(taskId);
    setView("chat");
  }

  function openNewChat(projectId?: string) {
    setNewChatProjectId(projectId ?? null);
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
    onStop: () => withSelectedChat(chatState.stop),
    onOpenChanges: () => setIsChangesPanelOpen(true),
  };

  const chatHeaderActions: ChatHeaderActions = {
    onMarkDone: () => withSelectedChat((chatId) => chatState.setState(chatId, "done")),
    onReopen: () => withSelectedChat((chatId) => chatState.setState(chatId, "review")),
    onToggleChangesPanel: () => setIsChangesPanelOpen(!isChangesPanelOpen),
    onNewChatInProject: () => openNewChat(selectedTask?.projectId),
  };

  const sidebarActions: SidebarActions = {
    onSelect: openTask,
    onMarkDone: (taskId) => chatState.setState(taskId, "done"),
    onReopen: (taskId) => chatState.setState(taskId, "review"),
    onNewChat: openNewChat,
    onAddProject: workspaceActions.onAddProject,
    onToggleBoard: () => setView(view === "board" ? "chat" : "board"),
  };

  function renderHeading() {
    if (view === "board") return <TopBarHeading title="Board" meta={`${workspaceTasks.length} chats`} />;
    if (!selectedTask) return null;
    return (
      <ChatHeader
        task={selectedTask}
        project={projects.find((project) => project.id === selectedTask.projectId)}
        branch={branches[selectedTask.projectId] ?? null}
        isChangesPanelOpen={isChangesPanelOpen}
        actions={chatHeaderActions}
      />
    );
  }

  function renderMain() {
    if (!workspace || !settings) return null;
    if (view === "board") return <Board tasks={workspaceTasks} projectName={projectName} onOpen={openTask} />;
    if (!selectedTask) {
      return (
        <NewChat
          key={`${workspace.id}-${workspace.projects.length}-${newChatProjectId}`}
          workspace={workspace}
          initialChoice={rememberedChoice(settings[CHOICE_SETTING])}
          initialProjectId={newChatProjectId ?? workspaceState.lastAddedProjectId}
          onStart={start}
          onAddProject={workspaceActions.onAddProject}
        />
      );
    }
    return <ChatView task={selectedTask} actions={chatActions} />;
  }

  const isChangesPanelVisible = view === "chat" && selectedTask !== null && isChangesPanelOpen;

  if (!workspace) return <div className="h-full bg-background" />;

  return (
    <div
      style={isFullscreen || !IS_MAC ? undefined : MAC_WINDOW_CONTROLS_INSET}
      data-workspace-root
      className="flex h-full overflow-hidden bg-background text-foreground"
    >
      <SidebarToggle isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
      <Sidebar
        workspace={workspace}
        tasks={workspaceTasks}
        branches={branches}
        sections={sidebarSections}
        selectedTaskId={view === "chat" ? (selectedTask?.id ?? null) : null}
        isOpen={isSidebarOpen}
        isBoardActive={view === "board"}
        actions={sidebarActions}
        header={
          <WorkspaceSwitcher
            workspaces={workspaces}
            current={workspace}
            tasks={tasks}
            actions={{
              ...workspaceActions,
              onSelect: (workspaceId) => {
                workspaceActions.onSelect(workspaceId);
                setSelectedTaskId(null);
              },
            }}
          />
        }
      />
      <main className="flex min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar isSidebarOpen={isSidebarOpen}>{renderHeading()}</TopBar>
          {renderMain()}
        </div>
        {isChangesPanelVisible && (
          <ChangesPanel
            work={selectedTask.work}
            project={projects.find((project) => project.id === selectedTask.projectId)}
          />
        )}
      </main>
      <Toasts toasts={toasts} tasks={tasks} onOpen={openToast} onDismiss={dismissToast} />
    </div>
  );
}
