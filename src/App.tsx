import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CHAT_CHOICE_SETTING as CHOICE_SETTING, DEFAULT_EFFORT, DEFAULT_MODEL } from "./agentOptions";
import { Board } from "./components/Board";
import { ChatHeader, type ChatHeaderActions } from "./components/ChatHeader";
import { ChatView, type ChatActions } from "./components/ChatView";
import { DiffPanel, LATEST_TURN_SCOPE, type DiffScope } from "./components/DiffPanel";
import { FilesPanel } from "./components/FilesPanel";
import type { AgentChoice } from "./components/ComposerControls";
import { NewChat, type ChatStart } from "./components/NewChat";
import { prAuthorFilterFrom, PullRequestsPage } from "./components/PullRequestsPage";
import { SettingsPage } from "./components/SettingsPage";
import { Sidebar, type SidebarActions } from "./components/Sidebar";
import { TerminalDrawer } from "./components/TerminalDrawer";
import { defaultPermissionModeOf } from "./permissionModes";
import { openTerminal } from "./terminalSessions";
import { SidebarToggle, TopBar, TopBarHeading, type View } from "./components/TitleBar";
import { ThreadDetails, type ThreadDetailsActions } from "./components/ThreadDetails";
import { Toasts } from "./components/Toasts";
import { useIsFullscreen } from "./components/useIsFullscreen";
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher";
import { EMPTY_FEED } from "./feed";
import { PR_AUTHOR_FILTER_SETTING, PREFERRED_EDITOR_SETTING, WORK_IN_WORKTREES_SETTING } from "./gitApi";
import { displayTitle, toTask } from "./tasks";
import type { Chat, Provider, TaskStatus, Toast } from "./types";
import { collapsedSectionsFrom } from "./collapsedSections";
import { useChats } from "./useChats";
import { shortcutCommandFor, type ShortcutCommand } from "./keybindings";
import { applyPreferences, areInAppNotificationsOn } from "./preferences";
import { useProjectBranches } from "./useProjectBranches";
import { useSettings } from "./useSettings";
import { useWorkbench } from "./useWorkbench";
import { useWorkspaces } from "./useWorkspaces";

const DEFAULT_CHOICE: AgentChoice = {
  provider: "Claude Code" as Provider,
  command: "claude-lyxa-team",
  model: DEFAULT_MODEL,
  effort: DEFAULT_EFFORT,
};

const IS_MAC = navigator.platform.startsWith("Mac");
const MAC_WINDOW_CONTROLS_INSET = { "--workspace-controls-left": "90px" } as CSSProperties;

const ROOM_FOR_CHANGES_PANEL = "(min-width: 1181px)";

const LAST_PROJECT_SETTING_PREFIX = "lastProject:";

const TURN_END_STATES = new Set<TaskStatus>(["review", "failed"]);

const ATTENTION_HEADLINES: Partial<Record<TaskStatus, string>> = {
  permission: "needs your permission",
  question: "asked you a question",
  review: "is waiting for you",
  failed: "failed",
};

function lastProjectSettingOf(workspaceId: string): string {
  return `${LAST_PROJECT_SETTING_PREFIX}${workspaceId}`;
}

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
  const [diffScope, setDiffScope] = useState<DiffScope>(LATEST_TURN_SCOPE);
  const workbench = useWorkbench();
  const { closeFilesPanel, toggleFilesPanel, toggleTerminal } = workbench;
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
  const { lastAddedProjectId } = workspaceState;
  const lastProjectSetting = workspace ? lastProjectSettingOf(workspace.id) : null;
  const lastProjectId = lastProjectSetting ? settings?.[lastProjectSetting] : undefined;
  useEffect(() => {
    if (settings) applyPreferences(settings);
  }, [settings]);
  const selectedTaskIdRef = useRef(selectedTaskId);
  selectedTaskIdRef.current = selectedTaskId;

  function announce(chat: Chat) {
    const headline = ATTENTION_HEADLINES[chat.state];
    if (!headline || chat.id === selectedTaskIdRef.current || !areInAppNotificationsOn()) return;
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

  function toggleChangesPanel() {
    closeFilesPanel();
    setIsChangesPanelOpen((isOpen) => !isOpen);
  }

  function toggleFiles() {
    setIsChangesPanelOpen(false);
    toggleFilesPanel();
  }

  useEffect(() => {
    const commands: Record<ShortcutCommand, () => void> = {
      newChat: () => openNewChat(),
      toggleSidebar: () => setIsSidebarOpen((isOpen) => !isOpen),
      toggleChangesPanel,
      toggleTerminal,
      toggleFilesPanel: toggleFiles,
    };
    function runShortcut(event: KeyboardEvent) {
      const command = shortcutCommandFor(event);
      if (!command) return;
      event.preventDefault();
      commands[command]();
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

  function rememberProject(projectId: string) {
    if (lastProjectSetting) remember(lastProjectSetting, projectId);
  }

  function openNewChat(projectId?: string) {
    if (projectId) rememberProject(projectId);
    setSelectedTaskId(null);
    setView("chat");
  }

  useEffect(() => {
    if (lastAddedProjectId) rememberProject(lastAddedProjectId);
  }, [lastAddedProjectId]);

  async function start(chatStart: ChatStart) {
    const { provider, command, model, effort, projectId } = chatStart;
    remember(CHOICE_SETTING, JSON.stringify({ provider, command, model, effort }));
    rememberProject(projectId);
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
    onChangeChoice: ({ command, model, effort }) =>
      withSelectedChat((chatId) => chatState.changeOptions(chatId, { command, model, effort })),
    onChangePermissionMode: (permissionMode) =>
      withSelectedChat((chatId) => chatState.changeOptions(chatId, { permissionMode })),
    onOpenChanges: () => {
      setDiffScope(LATEST_TURN_SCOPE);
      closeFilesPanel();
      setIsChangesPanelOpen(true);
    },
  };

  const chatHeaderActions: ChatHeaderActions = {
    onMarkDone: () => withSelectedChat((chatId) => chatState.setState(chatId, "done")),
    onReopen: () => withSelectedChat((chatId) => chatState.setState(chatId, "review")),
    onToggleChangesPanel: toggleChangesPanel,
    onToggleFilesPanel: toggleFiles,
    onToggleTerminal: toggleTerminal,
    onNewChatInProject: () => openNewChat(selectedTask?.projectId),
  };

  const threadDetailsActions: ThreadDetailsActions = {
    onOpenDiff: () => {
      setDiffScope({ kind: "workingTree" });
      closeFilesPanel();
      setIsChangesPanelOpen(true);
    },
    onBranchChanged: () => selectedTask && refreshBranch(selectedTask.projectId),
    onWorktreeRemoved: chatState.upsertChat,
    onRunInTerminal: (command) =>
      withSelectedChat((chatId) => {
        workbench.showTerminal();
        openTerminal(chatId, command).catch((error) => showError(String(error)));
      }),
    onError: showError,
  };

  const sidebarActions: SidebarActions = {
    onSelect: openTask,
    onMarkDone: (taskId) => chatState.setState(taskId, "done"),
    onReopen: (taskId) => chatState.setState(taskId, "review"),
    onNewChat: openNewChat,
    onAddProject: workspaceActions.onAddProject,
    onToggleBoard: () => setView(view === "board" ? "chat" : "board"),
    onTogglePullRequests: () => setView(view === "prs" ? "chat" : "prs"),
    onToggleSettings: () => setView(view === "settings" ? "chat" : "settings"),
  };

  function renderHeading() {
    if (view === "board") return <TopBarHeading title="Board" meta={`${workspaceTasks.length} chats`} />;
    if (view === "prs") return <TopBarHeading title="Pull requests" meta={workspace?.name ?? ""} />;
    if (view === "settings") return <TopBarHeading title="Settings" meta="" />;
    if (!selectedTask) return null;
    const project = projects.find((candidate) => candidate.id === selectedTask.projectId);
    return (
      <ChatHeader
        task={selectedTask}
        project={project}
        details={
          project && (
            <ThreadDetails
              key={selectedTask.id}
              task={selectedTask}
              project={project}
              actions={threadDetailsActions}
            />
          )
        }
        branch={selectedTask.branch ?? branches[selectedTask.projectId] ?? null}
        isChangesPanelOpen={isChangesPanelOpen}
        isFilesPanelOpen={workbench.isFilesPanelOpen}
        isTerminalOpen={workbench.isTerminalOpen}
        actions={chatHeaderActions}
      />
    );
  }

  function renderMain() {
    if (!workspace || !settings) return null;
    if (view === "prs") {
      return (
        <PullRequestsPage
          key={workspace.id}
          projects={workspace.projects}
          author={prAuthorFilterFrom(settings[PR_AUTHOR_FILTER_SETTING])}
          onAuthorChange={(author) => remember(PR_AUTHOR_FILTER_SETTING, author)}
        />
      );
    }
    if (view === "settings") {
      return (
        <SettingsPage
          settings={settings}
          projects={projects}
          defaultChoice={rememberedChoice(settings[CHOICE_SETTING])}
          onDefaultChoiceChange={(choice) => remember(CHOICE_SETTING, JSON.stringify(choice))}
          onRemember={remember}
        />
      );
    }
    if (view === "board") {
      return (
        <Board
          tasks={workspaceTasks}
          projectName={projectName}
          projectBranch={(projectId) => branches[projectId] ?? null}
          onOpen={openTask}
        />
      );
    }
    if (!selectedTask) {
      return (
        <NewChat
          key={workspace.id}
          workspace={workspace}
          initialChoice={rememberedChoice(settings[CHOICE_SETTING])}
          initialPermissionMode={defaultPermissionModeOf(settings)}
          projectId={lastProjectId ?? null}
          isWorktreeMode={settings[WORK_IN_WORKTREES_SETTING] === "true"}
          onStart={start}
          onPickProject={rememberProject}
          onAddProject={workspaceActions.onAddProject}
        />
      );
    }
    return <ChatView task={selectedTask} actions={chatActions} />;
  }

  const isChatOpen = view === "chat" && selectedTask !== null;
  const isChangesPanelVisible = isChatOpen && isChangesPanelOpen;

  if (!workspace) return <div className="h-full bg-window" />;

  return (
    <div
      style={isFullscreen || !IS_MAC ? undefined : MAC_WINDOW_CONTROLS_INSET}
      data-workspace-root
      data-tauri-drag-region
      className="flex h-full overflow-hidden bg-window p-(--island-gap) text-foreground"
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
        isPullRequestsActive={view === "prs"}
        isSettingsActive={view === "settings"}
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
      <main data-tauri-drag-region className="flex min-w-0 flex-1 gap-(--island-gap)">
        <div data-tauri-drag-region className="flex min-w-0 flex-1 flex-col gap-(--island-gap)">
          <div className="island flex min-h-0 flex-1 flex-col bg-background">
            <TopBar isSidebarOpen={isSidebarOpen}>{renderHeading()}</TopBar>
            {renderMain()}
          </div>
          {isChatOpen && workbench.isTerminalOpen && (
            <TerminalDrawer
              chatId={selectedTask.id}
              height={workbench.terminalHeight}
              onHeightChange={workbench.resizeTerminal}
              onHide={workbench.hideTerminal}
              onError={showError}
            />
          )}
        </div>
        {isChatOpen && workbench.isFilesPanelOpen && (
          <FilesPanel
            key={selectedTask.id}
            task={selectedTask}
            preferredEditor={settings?.[PREFERRED_EDITOR_SETTING]}
            onError={showError}
          />
        )}
        {isChangesPanelVisible && (
          <DiffPanel
            key={selectedTask.id}
            task={selectedTask}
            project={projects.find((project) => project.id === selectedTask.projectId)}
            scope={diffScope}
            onScopeChange={setDiffScope}
          />
        )}
      </main>
      <Toasts toasts={toasts} tasks={tasks} onOpen={openToast} onDismiss={dismissToast} />
    </div>
  );
}
