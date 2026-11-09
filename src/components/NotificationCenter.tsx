import { Bell } from "lucide-react";
import { elapsedSince } from "../tasks";
import type { NotificationEntry } from "../types";
import { SIDEBAR_HEADER_ICON_BUTTON } from "./Sidebar";
import { NotificationIcon } from "./Toasts";
import { cn, FOCUS_RING, GHOST_BUTTON, MENU_POPUP, MenuLabel, MenuSeparator } from "./ui";
import { usePopup } from "./usePopup";

const BADGE_LIMIT = 9;

export interface NotificationCenterActions {
  onOpen: (entry: NotificationEntry) => void;
  onMarkAllRead: () => void;
  onClear: () => void;
}

interface NotificationCenterProps {
  entries: NotificationEntry[];
  unreadCount: number;
  actions: NotificationCenterActions;
}

interface NotificationGroup {
  title: string;
  entries: NotificationEntry[];
}

const HEADER_BUTTON = cn(GHOST_BUTTON, "h-6 px-2 text-xs");

function isToday(timestamp: number): boolean {
  return new Date(timestamp).toDateString() === new Date().toDateString();
}

function groupsOf(entries: NotificationEntry[]): NotificationGroup[] {
  const groups = [
    { title: "Today", entries: entries.filter((entry) => isToday(entry.createdAt)) },
    { title: "Earlier", entries: entries.filter((entry) => !isToday(entry.createdAt)) },
  ];
  return groups.filter((group) => group.entries.length > 0);
}

function badgeOf(unreadCount: number): string {
  return unreadCount > BADGE_LIMIT ? `${BADGE_LIMIT}+` : String(unreadCount);
}

function NotificationRow({ entry, onOpen }: { entry: NotificationEntry; onOpen: (entry: NotificationEntry) => void }) {
  return (
    <li className="list-none">
      <button
        type="button"
        title={entry.detail}
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
          {entry.detail && (
            <span className="line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {entry.detail}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export function NotificationCenter({ entries, unreadCount, actions }: NotificationCenterProps) {
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
              {groupsOf(entries).map((group) => (
                <section key={group.title} aria-label={group.title}>
                  <MenuLabel>{group.title}</MenuLabel>
                  <ul className="flex flex-col gap-0.5">
                    {group.entries.map((entry) => (
                      <NotificationRow key={entry.id} entry={entry} onOpen={open} />
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
