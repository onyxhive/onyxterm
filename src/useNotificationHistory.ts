import { useEffect, useState } from "react";
import { api } from "./api";
import { STATUS_LABEL } from "./status";
import type { NotificationEntry, Toast } from "./types";

const NOTIFICATION_HISTORY_SETTING = "notificationHistory";
const HISTORY_LIMIT = 100;

function isNotificationEntry(value: unknown): value is NotificationEntry {
  if (typeof value !== "object" || value === null) return false;
  const { id, taskId, headline, detail, tone, createdAt, isRead } = value as Record<string, unknown>;
  const hasKnownTone = tone === "error" || (typeof tone === "string" && Object.hasOwn(STATUS_LABEL, tone));
  return (
    hasKnownTone &&
    [id, taskId, headline, detail].every((field) => typeof field === "string") &&
    typeof createdAt === "number" &&
    typeof isRead === "boolean"
  );
}

function parsedHistory(saved: string | undefined): NotificationEntry[] {
  if (!saved) return [];
  try {
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter(isNotificationEntry) : [];
  } catch {
    return [];
  }
}

export function useNotificationHistory() {
  const [entries, setEntries] = useState<NotificationEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    function restore(saved: NotificationEntry[]) {
      if (!isCurrent) return;
      setEntries((current) => [...current, ...saved].slice(0, HISTORY_LIMIT));
      setIsLoaded(true);
    }
    api.getSettings().then(
      (settings) => restore(parsedHistory(settings[NOTIFICATION_HISTORY_SETTING])),
      () => restore([]),
    );
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (isLoaded) void api.setSetting(NOTIFICATION_HISTORY_SETTING, JSON.stringify(entries));
  }, [entries, isLoaded]);

  function record(toast: Toast) {
    const entry: NotificationEntry = { ...toast, createdAt: Date.now(), isRead: false };
    setEntries((current) => [entry, ...current].slice(0, HISTORY_LIMIT));
  }

  function markReadWhere(isTarget: (entry: NotificationEntry) => boolean) {
    setEntries((current) =>
      current.some((entry) => !entry.isRead && isTarget(entry))
        ? current.map((entry) => (isTarget(entry) ? { ...entry, isRead: true } : entry))
        : current,
    );
  }

  return {
    entries,
    unreadCount: entries.filter((entry) => !entry.isRead).length,
    record,
    markRead: (entryId: string) => markReadWhere((entry) => entry.id === entryId),
    markChatRead: (taskId: string) => markReadWhere((entry) => entry.taskId === taskId),
    markAllRead: () => markReadWhere(() => true),
    clear: () => setEntries([]),
  };
}
