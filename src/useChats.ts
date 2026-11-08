import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { CHAT_EVENT, CHAT_UPDATED, type ChatEventPayload } from "./agentEvents";
import { api, type ChatOptions } from "./api";
import type { ChatStart } from "./components/NewChat";
import {
  EMPTY_FEED,
  feedFromHistory,
  reduceFeed,
  reduceLiveFeed,
  withAnswers,
  withDecision,
  withSentMessage,
  withStop,
  type ChatFeed,
} from "./feed";
import { titleFrom } from "./tasks";
import type { Chat, PermissionDecision, TaskStatus } from "./types";

export interface ChatsInput {
  onError: (message: string) => void;
  onStateChange: (chat: Chat, previous: TaskStatus | undefined) => void;
}

export function useChats(input: ChatsInput) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [feeds, setFeeds] = useState<Record<string, ChatFeed>>({});
  const chatsRef = useRef(chats);
  const requestedHistories = useRef(new Set<string>());
  const inputRef = useRef(input);
  chatsRef.current = chats;
  inputRef.current = input;

  function report(error: unknown) {
    inputRef.current.onError(String(error));
  }

  function updateFeed(chatId: string, update: (feed: ChatFeed) => ChatFeed) {
    setFeeds((current) => ({ ...current, [chatId]: update(current[chatId] ?? EMPTY_FEED) }));
  }

  function upsertChat(updated: Chat) {
    setChats((current) =>
      current.some((chat) => chat.id === updated.id)
        ? current.map((chat) => (chat.id === updated.id ? updated : chat))
        : [updated, ...current],
    );
  }

  useEffect(() => {
    api.listChats().then(setChats, report);
    const subscriptions = [
      listen<ChatEventPayload>(CHAT_EVENT, ({ payload }) => {
        updateFeed(payload.chatId, (feed) => reduceLiveFeed(feed, payload.event));
      }),
      listen<Chat>(CHAT_UPDATED, ({ payload }) => {
        const previous = chatsRef.current.find((chat) => chat.id === payload.id)?.state;
        upsertChat(payload);
        if (previous !== payload.state) inputRef.current.onStateChange(payload, previous);
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.then((unlisten) => unlisten()));
  }, []);

  async function send(chatId: string, text: string) {
    updateFeed(chatId, (feed) => withSentMessage(feed, text));
    try {
      await api.sendMessage(chatId, text);
    } catch (error) {
      updateFeed(chatId, (feed) => reduceFeed(feed, { kind: "processExited", message: String(error) }));
      report(error);
    }
  }

  async function startChat(start: ChatStart): Promise<Chat | null> {
    const { text, ...choice } = start;
    try {
      const chat = await api.createChat({ ...choice, title: titleFrom(text) });
      upsertChat(chat);
      requestedHistories.current.add(chat.id);
      setFeeds((current) => ({ ...current, [chat.id]: EMPTY_FEED }));
      void send(chat.id, text);
      return chat;
    } catch (error) {
      report(error);
      return null;
    }
  }

  async function decide(chatId: string, requestId: string, decision: PermissionDecision) {
    try {
      await api.answerPermission(chatId, requestId, decision);
      updateFeed(chatId, (feed) => withDecision(feed, requestId, decision));
    } catch (error) {
      report(error);
    }
  }

  async function answer(chatId: string, requestId: string, answers: Record<string, string>) {
    try {
      await api.answerQuestion(chatId, requestId, answers);
      updateFeed(chatId, (feed) => withAnswers(feed, requestId, answers));
    } catch (error) {
      report(error);
    }
  }

  async function stop(chatId: string) {
    try {
      await api.interruptChat(chatId);
      updateFeed(chatId, withStop);
    } catch (error) {
      report(error);
    }
  }

  async function loadHistory(chatId: string) {
    if (requestedHistories.current.has(chatId)) return;
    requestedHistories.current.add(chatId);
    try {
      const history = feedFromHistory(await api.loadChatHistory(chatId));
      setFeeds((current) => (current[chatId] ? current : { ...current, [chatId]: history }));
    } catch (error) {
      requestedHistories.current.delete(chatId);
      report(error);
    }
  }

  async function changeOptions(chatId: string, update: Partial<ChatOptions>) {
    const chat = chatsRef.current.find((candidate) => candidate.id === chatId);
    if (!chat) return;
    const { command, model, effort, permissionMode } = chat;
    try {
      upsertChat(await api.updateChatOptions(chatId, { command, model, effort, permissionMode, ...update }));
    } catch (error) {
      report(error);
    }
  }

  async function setState(chatId: string, state: TaskStatus) {
    try {
      upsertChat(await api.setChatState(chatId, state));
    } catch (error) {
      report(error);
    }
  }

  return { chats, feeds, startChat, send, decide, answer, stop, setState, loadHistory, upsertChat, changeOptions };
}
