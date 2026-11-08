import { useEffect, useState } from "react";
import { Board } from "./components/Board";
import { ChatView, type ChatActions } from "./components/ChatView";
import { NewChat, type ChatDraft } from "./components/NewChat";
import { Sidebar } from "./components/Sidebar";
import { TitleBar, type View } from "./components/TitleBar";
import { Toasts } from "./components/Toasts";
import { WorkPanel } from "./components/WorkPanel";
import { TASKS, TOASTS, WORKSPACES, type Task, type Toast } from "./mock";
import { isWaiting } from "./status";
import { createTask, withAnswer, withDecision, withDone, withReply, withStop } from "./taskUpdates";

const TOAST_DELAY_MS = 1200;

export default function App() {
  const [workspaceId, setWorkspaceId] = useState(WORKSPACES[0].id);
  const [tasks, setTasks] = useState<Task[]>(TASKS);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>("distance-sort");
  const [view, setView] = useState<View>("chat");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isWorkPanelOpen, setIsWorkPanelOpen] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const workspace = WORKSPACES.find((candidate) => candidate.id === workspaceId) ?? WORKSPACES[0];
  const workspaceTasks = tasks.filter((task) => workspace.projects.some((project) => project.id === task.projectId));
  const selectedTask = workspaceTasks.find((task) => task.id === selectedTaskId) ?? null;
  const waitingTasks = workspaceTasks.filter((task) => isWaiting(task.status));

  useEffect(() => {
    const timer = window.setTimeout(() => setToasts(TOASTS), TOAST_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

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
    return workspace.projects.find((project) => project.id === projectId)?.name ?? projectId;
  }

  function openTask(taskId: string) {
    setSelectedTaskId(taskId);
    setView("chat");
  }

  function openNewChat() {
    setSelectedTaskId(null);
    setView("chat");
  }

  function changeWorkspace(nextWorkspaceId: string) {
    setWorkspaceId(nextWorkspaceId);
    setSelectedTaskId(null);
  }

  function updateSelectedTask(update: (task: Task) => Task) {
    setTasks((current) => current.map((task) => (task.id === selectedTaskId ? update(task) : task)));
  }

  function startChat(draft: ChatDraft) {
    const task = createTask(draft);
    setTasks((current) => [task, ...current]);
    setSelectedTaskId(task.id);
  }

  function openToast(toast: Toast) {
    const task = tasks.find((candidate) => candidate.id === toast.taskId);
    const owner = WORKSPACES.find((candidate) => candidate.projects.some((project) => project.id === task?.projectId));
    if (owner) setWorkspaceId(owner.id);
    openTask(toast.taskId);
    dismissToast(toast.id);
  }

  function dismissToast(toastId: string) {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }

  const chatActions: ChatActions = {
    onReply: (text) => updateSelectedTask((task) => withReply(task, text)),
    onDecide: (decision) => updateSelectedTask((task) => withDecision(task, decision)),
    onAnswer: (answer) => updateSelectedTask((task) => withAnswer(task, answer)),
    onMarkDone: () => updateSelectedTask(withDone),
    onStop: () => updateSelectedTask(withStop),
    onToggleWorkPanel: () => setIsWorkPanelOpen(!isWorkPanelOpen),
  };

  function renderMain() {
    if (view === "board") return <Board tasks={workspaceTasks} projectName={projectName} onOpen={openTask} />;
    if (!selectedTask) return <NewChat key={workspace.id} workspace={workspace} onStart={startChat} />;
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

  return (
    <div className="app">
      <TitleBar
        workspaces={WORKSPACES}
        workspace={workspace}
        tasks={tasks}
        waitingCount={waitingTasks.length}
        view={view}
        onViewChange={setView}
        onWorkspaceChange={changeWorkspace}
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
          <WorkPanel work={selectedTask.work} projectName={projectName(selectedTask.projectId)} />
        )}
      </div>
    </div>
  );
}
