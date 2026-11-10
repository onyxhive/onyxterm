import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CHAT_CHOICE_SETTING as CHOICE_SETTING, DEFAULT_EFFORT, DEFAULT_MODEL } from "./agentOptions";
import { Board } from "./components/Board";
import { ChatHeader, type ChatHeaderActions } from "./components/ChatHeader";
import { ChatView, type ChatActions } from "./components/ChatView";
import { DiffPanel } from "./components/DiffPanel";
import { FilesPanel } from "./components/FilesPanel";
import type { AgentChoice } from "./components/ComposerControls";
import { NewChat, type ChatStart } from "./components/NewChat";
import { NotificationCenter } from "./components/NotificationCenter";
import { UsageCenter } from "./components/UsageCenter";
import { prAuthorFilterFrom, PullRequestsPage, type PullRequestSelection } from "./components/PullRequestsPage";
import { SettingsPage } from "./components/SettingsPage";
import { SidePanel } from "./components/SidePanel";
import { SubagentsPanel } from "./components/SubagentsPanel";
import { Sidebar, type SidebarActions } from "./components/Sidebar";
import { TerminalDrawer } from "./components/TerminalDrawer";
import { defaultPermissionModeOf, PERMISSION_MODE_SETTING } from "./permissionModes";
import { openTerminal } from "./terminalSessions";
import { SidebarToggle, TopBar, TopBarHeading, type View } from "./components/TitleBar";
import type { ThreadDetailsActions } from "./components/ThreadDetails";
import { Toasts } from "./components/Toasts";
import { useIsFullscreen } from "./components/useIsFullscreen";
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher";
import { EMPTY_FEED } from "./feed";
import { PR_AUTHOR_FILTER_SETTING, PREFERRED_EDITOR_SETTING, WORK_IN_WORKTREES_SETTING } from "./gitApi";
import { displayTitle, toTask } from "./tasks";
import type { Chat, Provider, Task, TaskStatus, Toast } from "./types";
import { collapsedSectionsFrom } from "./collapsedSections";
import { commandsByRecentUse } from "./planUsage";
import { useChats } from "./useChats";
import { useNotificationHistory } from "./useNotificationHistory";
import { shortcutCommandFor, type ShortcutCommand } from "./keybindings";
import { statusSectionsOf } from "./status";
import { setPullRequestOpener } from "./links";
import { applyPreferences, areInAppNotificationsOn, isToggleOn } from "./preferences";
import { useProjectBranches } from "./useProjectBranches";
import { useSettings } from "./useSettings";
import { useWorkbench, type SidePanelTab } from "./useWorkbench";
import { useWorkspaces } from "./useWorkspaces";

const DEFAULT_CHOICE: AgentChoice = {
  provider: "Claude Code" as Provider,
  command: "claude-lyxa-team",
  model: DEFAULT_MODEL,
  effort: DEFAULT_EFFORT,
};

const IS_MAC = navigator.platform.startsWith("Mac");
const MAC_WINDOW_CONTROLS_INSET = { "--workspace-controls-left": "90px" } as CSSProperties;

const SIDE_PANEL_SETTING = "sidePanelOpen";
const SUBAGENT_TRAY_COLLAPSED_SETTING = "subagentTrayCollapsed";

const LAST_PROJECT_SETTING_PREFIX = "lastProject:";

const CHAT_SWITCH_COMMANDS = new Set<ShortcutCommand>(["nextChat", "previousChat"]);

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

interface OpenedPullRequest extends PullRequestSelection {
  openedAt: number;
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
  const [openedPullRequest, setOpenedPullRequest] = useState<OpenedPullRequest | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const isFullscreen = useIsFullscreen();
  const workbench = useWorkbench();
  const { toggleTerminal, selectSidePanelTab, openAgent } = workbench;
  const sidePanelTabRef = useRef(workbench.sidePanelTab);
  sidePanelTabRef.current = workbench.sidePanelTab;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notificationHistory = useNotificationHistory();

  function showError(message: string) {
    const toast: Toast = {
      id: `error-${Date.now()}`,
      taskId: "",
      headline: "Something failed",
      detail: message,
      tone: "error",
    };
    setToasts((current) => [...current, toast]);
    notificationHistory.record(toast);
  }

  const { settings, remember } = useSettings();
  const isSidePanelOpen = settings?.[SIDE_PANEL_SETTING] === "true";
  const isSidePanelOpenRef = useRef(isSidePanelOpen);
  isSidePanelOpenRef.current = isSidePanelOpen;

  function setIsSidePanelOpen(isOpen: boolean) {
    remember(SIDE_PANEL_SETTING, String(isOpen));
  }

  const isSubagentTrayCollapsed = isToggleOn(settings ?? {}, SUBAGENT_TRAY_COLLAPSED_SETTING, false);
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
      id: `${chat.id}-${chat.state}-${Date.now()}`,
      taskId: chat.id,
      headline: `${displayTitle(chat.title)} ${headline}`,
      detail: projectName(chat.projectId),
      tone: chat.state,
    };
    setToasts((current) => [...current.filter((candidate) => candidate.taskId !== chat.id), toast]);
    notificationHistory.record(toast);
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
  const sidebarChatIdsRef = useRef<string[]>([]);
  sidebarChatIdsRef.current = statusSectionsOf(workspaceTasks).flatMap((section) =>
    section.tasks.map((task) => task.id),
  );

  useEffect(() => {
    if (selectedTaskId) void chatState.loadHistory(selectedTaskId);
  }, [selectedTaskId]);

  function toggleSidePanel() {
    setIsSidePanelOpen(!isSidePanelOpenRef.current);
  }

  function openSidePanelTab(tab: SidePanelTab) {
    selectSidePanelTab(tab);
    setIsSidePanelOpen(true);
  }

  function toggleSidePanelTab(tab: SidePanelTab) {
    const isShowingTab = isSidePanelOpenRef.current && sidePanelTabRef.current === tab;
    selectSidePanelTab(tab);
    setIsSidePanelOpen(!isShowingTab);
  }

  function openSubagents(agentId: string | null) {
    openAgent(agentId);
    setIsSidePanelOpen(true);
  }

  function openChatAtOffset(offset: number) {
    const chatIds = sidebarChatIdsRef.current;
    if (chatIds.length === 0) return;
    const currentIndex = chatIds.indexOf(selectedTaskIdRef.current ?? "");
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + offset + chatIds.length) % chatIds.length;
    openTask(chatIds[nextIndex]);
  }

  useEffect(() => {
    const commands: Record<ShortcutCommand, () => void> = {
      newChat: () => openNewChat(),
      toggleSidebar: () => setIsSidebarOpen((isOpen) => !isOpen),
      toggleChangesPanel: () => toggleSidePanelTab("changes"),
      toggleTerminal,
      toggleFilesPanel: () => toggleSidePanelTab("files"),
      nextChat: () => openChatAtOffset(1),
      previousChat: () => openChatAtOffset(-1),
    };
    function runShortcut(event: KeyboardEvent) {
      const command = shortcutCommandFor(event);
      if (!command) return;
      event.preventDefault();
      commands[command]();
    }
    function runChatSwitch(event: KeyboardEvent) {
      const command = shortcutCommandFor(event);
      if (!command || !CHAT_SWITCH_COMMANDS.has(command)) return;
      event.stopPropagation();
      runShortcut(event);
    }
    window.addEventListener("keydown", runChatSwitch, { capture: true });
    window.addEventListener("keydown", runShortcut);
    return () => {
      window.removeEventListener("keydown", runChatSwitch, { capture: true });
      window.removeEventListener("keydown", runShortcut);
    };
  }, []);

  function projectName(projectId: string): string {
    return projects.find((project) => project.id === projectId)?.name ?? "removed project";
  }

  function openTask(taskId: string) {
    notificationHistory.markChatRead(taskId);
    setSelectedTaskId(taskId);
    setView("chat");
  }

  function showPullRequest(projectIds: string[], number: number) {
    const projectId = projectIds.find((id) => workspace?.projects.some((project) => project.id === id)) ?? projectIds[0];
    const projectWorkspaceId = projects.find((project) => project.id === projectId)?.workspaceId;
    if (projectWorkspaceId && projectWorkspaceId !== workspace?.id) workspaceActions.onSelect(projectWorkspaceId);
    setOpenedPullRequest({ projectId, number, openedAt: Date.now() });
    setView("prs");
  }

  useEffect(() => {
    setPullRequestOpener(showPullRequest);
    return () => setPullRequestOpener(null);
  });

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

  function openNotification(toast: Toast) {
    notificationHistory.markRead(toast.id);
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
    onReply: (text, images) => withSelectedChat((chatId) => chatState.send(chatId, text, images)),
    onDecide: (requestId, decision, suggestion) =>
      withSelectedChat((chatId) => chatState.decide(chatId, requestId, decision, suggestion)),
    onAnswer: (requestId, answers) => withSelectedChat((chatId) => chatState.answer(chatId, requestId, answers)),
    onStop: () => withSelectedChat(chatState.stop),
    onChangeChoice: ({ command, model, effort }) =>
      withSelectedChat((chatId) => chatState.changeOptions(chatId, { command, model, effort })),
    onChangeFastMode: (fastMode) => withSelectedChat((chatId) => chatState.changeOptions(chatId, { fastMode })),
    onChangeUltracode: (ultracode) => withSelectedChat((chatId) => chatState.changeOptions(chatId, { ultracode })),
    onOpenSubagents: openSubagents,
    onToggleSubagentTray: () => remember(SUBAGENT_TRAY_COLLAPSED_SETTING, String(!isSubagentTrayCollapsed)),
    onChangePermissionMode: (permissionMode) => {
      remember(PERMISSION_MODE_SETTING, permissionMode);
      withSelectedChat((chatId) => chatState.changeOptions(chatId, { permissionMode }));
    },
  };

  const chatHeaderActions: ChatHeaderActions = {
    onToggleSidePanel: toggleSidePanel,
    onToggleTerminal: toggleTerminal,
    onNewChatInProject: () => openNewChat(selectedTask?.projectId),
  };

  const threadDetailsActions: ThreadDetailsActions = {
    onMarkDone: () => withSelectedChat((chatId) => chatState.setState(chatId, "done")),
    onReopen: () => withSelectedChat((chatId) => chatState.setState(chatId, "review")),
    onOpenDiff: () => openSidePanelTab("changes"),
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
    onTogglePullRequests: () => {
      setOpenedPullRequest(null);
      setView(view === "prs" ? "chat" : "prs");
    },
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
        isSidePanelOpen={isSidePanelOpen}
        isTerminalOpen={workbench.isTerminalOpen}
        actions={chatHeaderActions}
        detailsActions={threadDetailsActions}
      />
    );
  }

  function renderSidePanelTab(task: Task) {
    if (workbench.sidePanelTab === "files") {
      return (
        <FilesPanel
          key={task.id}
          task={task}
          preferredEditor={settings?.[PREFERRED_EDITOR_SETTING]}
          onError={showError}
        />
      );
    }
    if (workbench.sidePanelTab === "agents") {
      return (
        <SubagentsPanel
          key={task.id}
          task={task}
          projectPath={projects.find((project) => project.id === task.projectId)?.path ?? null}
          agentId={workbench.openedAgentId}
          onOpenAgent={openAgent}
        />
      );
    }
    return <DiffPanel key={task.id} task={task} />;
  }

  function renderMain() {
    if (!workspace || !settings) return null;
    if (view === "prs") {
      return (
        <PullRequestsPage
          key={`${workspace.id}:${openedPullRequest?.openedAt}`}
          projects={workspace.projects}
          initialSelection={openedPullRequest}
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
          onPickPermissionMode={(mode) => remember(PERMISSION_MODE_SETTING, mode)}
          onAddProject={workspaceActions.onAddProject}
        />
      );
    }
    const chatProject = projects.find((project) => project.id === selectedTask.projectId);
    return (
      <ChatView
        task={selectedTask}
        projectPath={chatProject?.path ?? null}
        isSubagentTrayCollapsed={isSubagentTrayCollapsed}
        actions={chatActions}
      />
    );
  }

  const isChatOpen = view === "chat" && selectedTask !== null;
  const isSidePanelVisible = isChatOpen && isSidePanelOpen;

  if (!workspace) return <div className="h-full bg-window" />;

  return (
    <div
      style={isFullscreen || !IS_MAC ? undefined : MAC_WINDOW_CONTROLS_INSET}
      data-workspace-root
      data-tauri-drag-region
      className="flex h-full overflow-hidden bg-window text-foreground"
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
        usage={<UsageCenter commands={commandsByRecentUse(chats)} />}
        header={
          <>
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
            <NotificationCenter
              entries={notificationHistory.entries}
              unreadCount={notificationHistory.unreadCount}
              actions={{
                onOpen: openNotification,
                onMarkAllRead: notificationHistory.markAllRead,
                onClear: notificationHistory.clear,
              }}
            />
          </>
        }
      />
      <main data-tauri-drag-region className="flex min-w-0 flex-1">
        <div data-tauri-drag-region className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
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
        {isSidePanelVisible && (
          <SidePanel tab={workbench.sidePanelTab} onSelectTab={selectSidePanelTab}>
            {renderSidePanelTab(selectedTask)}
          </SidePanel>
        )}
      </main>
      <Toasts toasts={toasts} onOpen={openNotification} onDismiss={dismissToast} />
    </div>
  );
}
