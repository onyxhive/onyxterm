import { useEffect, useState } from "react";
import { api } from "./api";
import type { ChatStart } from "./components/NewChat";
import { clockTime, titleFrom } from "./tasks";
import type { Chat, FeedItem, TaskStatus } from "./types";

export function useChats(onError: (message: string) => void) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [feeds, setFeeds] = useState<Record<string, FeedItem[]>>({});

  useEffect(() => {
    api.listChats().then(setChats, (error) => onError(String(error)));
  }, []);

  function replaceChat(updated: Chat) {
    setChats((current) => current.map((chat) => (chat.id === updated.id ? updated : chat)));
  }

  function appendUserMessage(chatId: string, text: string) {
    const message: FeedItem = { kind: "user", text, time: clockTime() };
    setFeeds((current) => ({ ...current, [chatId]: [...(current[chatId] ?? []), message] }));
  }

  async function startChat(start: ChatStart): Promise<Chat | null> {
    try {
      const { text, ...choice } = start;
      const chat = await api.createChat({ ...choice, title: titleFrom(text) });
      setChats((current) => [chat, ...current]);
      appendUserMessage(chat.id, text);
      return chat;
    } catch (error) {
      onError(String(error));
      return null;
    }
  }

  async function setState(chatId: string, state: TaskStatus) {
    try {
      replaceChat(await api.setChatState(chatId, state));
    } catch (error) {
      onError(String(error));
    }
  }

  return { chats, feeds, startChat, setState, reply: appendUserMessage };
}
