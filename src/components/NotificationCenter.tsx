import { Bell } from "lucide-react";
import { elapsedSince } from "../tasks";
import type { Chat, NotificationEntry, Project } from "../types";
import { SIDEBAR_HEADER_ICON_BUTTON } from "./Sidebar";
import { NotificationIcon } from "./Toasts";
import { cn, FOCUS_RING, GHOST_BUTTON, MENU_POPUP, MenuLabel, MenuSeparator } from "./ui";
import { usePopup } from "./usePopup";

const BADGE_LIMIT = 9;
const UNGROUPED_KEY = "onyx";
const UNGROUPED_TITLE = "Onyx";

export interface NotificationCenterActions {
  onOpen: (entry: NotificationEntry) => void;
  onMarkAllRead: () => void;
  onClear: () => void;
}

interface NotificationCenterProps {
  entries: NotificationEntry[];
  unreadCount: number;
  projects: Project[];
  chats: Chat[];
  actions: NotificationCenterActions;
}

interface ProjectLookup {
  projects: Project[];
  chats: Chat[];
}

interface GroupIdentity {
  key: string;
  title: string;
}

interface NotificationGroup extends GroupIdentity {
  entries: NotificationEntry[];
}

const HEADER_BUTTON = cn(GHOST_BUTTON, "h-6 px-2 text-xs");

function groupIdentityOf(entry: NotificationEntry, lookup: ProjectLookup): GroupIdentity {
  const projectId = entry.projectId ?? lookup.chats.find((chat) => chat.id === entry.taskId)?.projectId;
  const project = lookup.projects.find((candidate) => candidate.id === projectId);
  if (project) return { key: project.id, title: project.name };
  if (entry.taskId && entry.detail) return { key: `detail:${entry.detail}`, title: entry.detail };
  return { key: UNGROUPED_KEY, title: UNGROUPED_TITLE };
}

function groupsOf(entries: NotificationEntry[], lookup: ProjectLookup): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  const newestFirst = [...entries].sort((first, second) => second.createdAt - first.createdAt);
  for (const entry of newestFirst) {
    const identity = groupIdentityOf(entry, lookup);
    const group = groups.get(identity.key) ?? { ...identity, entries: [] };
    group.entries.push(entry);
    groups.set(identity.key, group);
  }
  return [...groups.values()];
}

function detailWithin(entry: NotificationEntry, group: NotificationGroup): string {
  return entry.detail === group.title ? "" : entry.detail;
}

function badgeOf(unreadCount: number): string {
  return unreadCount > BADGE_LIMIT ? `${BADGE_LIMIT}+` : String(unreadCount);
}

interface NotificationRowProps {
  entry: NotificationEntry;
  detail: string;
  onOpen: (entry: NotificationEntry) => void;
}

function NotificationRow({ entry, detail, onOpen }: NotificationRowProps) {
  return (
    <li className="list-none">
      <button
        type="button"
        title={detail || undefined}
        onClick={() => onOpen(entry)}
        className={cn(
          "flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent",
          FOCUS_RING,
        )}
      >
        <span className="flex h-5 w-4 shrink-0 items-center justify-center">
          <NotificationIcon tone={entry.tone} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-start gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 text-sm leading-5 [overflow-wrap:anywhere]",
                entry.isRead ? "text-foreground/70" : "font-medium text-foreground",
              )}
            >
              {entry.headline}
            </span>
            <span className="flex h-5 shrink-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
              {elapsedSince(entry.createdAt, Date.now())}
              {!entry.isRead && (
                <span className="size-1.5 rounded-full bg-primary">
                  <span className="sr-only">Unread</span>
                </span>
              )}
            </span>
          </span>
          {detail && (
            <span className="line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{detail}</span>
          )}
        </span>
      </button>
    </li>
  );
}

export function NotificationCenter({ entries, unreadCount, projects, chats, actions }: NotificationCenterProps) {
  const popup = usePopup();
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";

  function open(entry: NotificationEntry) {
    actions.onOpen(entry);
    if (entry.taskId) popup.close();
  }

  return (
    <div ref={popup.rootRef} className="shrink-0">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={popup.isOpen}
        onClick={popup.toggle}
        className={cn(
          SIDEBAR_HEADER_ICON_BUTTON,
          "aria-expanded:bg-sidebar-row-active aria-expanded:text-sidebar-foreground",
        )}
      >
        <Bell />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-0.5 right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary",
              "px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums",
            )}
          >
            {badgeOf(unreadCount)}
          </span>
        )}
      </button>
      {popup.isOpen && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={cn(
            MENU_POPUP,
            "fixed top-[calc(var(--topbar-height)-0.5rem)] left-2 flex w-[22rem] max-w-[calc(100vw-1rem)] flex-col",
            "max-h-[min(32rem,calc(100vh-var(--topbar-height)))]",
          )}
        >
          <div className="flex h-8 shrink-0 items-center gap-1 ps-2">
            <span className="min-w-0 flex-1 truncate font-medium">Notifications</span>
            <button
              type="button"
              className={HEADER_BUTTON}
              disabled={unreadCount === 0}
              onClick={actions.onMarkAllRead}
            >
              Mark all read
            </button>
            <button
              type="button"
              className={HEADER_BUTTON}
              disabled={entries.length === 0}
              onClick={actions.onClear}
            >
              Clear
            </button>
          </div>
          <MenuSeparator />
          {entries.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">No notifications yet</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {groupsOf(entries, { projects, chats }).map((group, index) => (
                <section key={group.key} aria-label={group.title}>
                  {index > 0 && <MenuSeparator />}
                  <MenuLabel>{group.title}</MenuLabel>
                  <ul className="flex flex-col gap-0.5">
                    {group.entries.map((entry) => (
                      <NotificationRow
                        key={entry.id}
                        entry={entry}
                        detail={detailWithin(entry, group)}
                        onOpen={open}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
