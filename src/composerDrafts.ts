import type { ImageAttachment } from "./types";

const STORAGE_PREFIX = "onyx-composer-draft.";

export interface ComposerDraft {
  text: string;
  images: ImageAttachment[];
}

export const EMPTY_DRAFT: ComposerDraft = { text: "", images: [] };

const drafts = new Map<string, ComposerDraft>();

function isEmptyDraft(draft: ComposerDraft): boolean {
  return draft.text === "" && draft.images.length === 0;
}

function mirrorText(key: string, text: string) {
  const storageKey = STORAGE_PREFIX + key;
  if (text === "") localStorage.removeItem(storageKey);
  else localStorage.setItem(storageKey, text);
}

export function draftFor(key: string): ComposerDraft {
  return drafts.get(key) ?? { text: localStorage.getItem(STORAGE_PREFIX + key) ?? "", images: [] };
}

export function saveDraft(key: string, draft: ComposerDraft) {
  if (isEmptyDraft(draft)) drafts.delete(key);
  else drafts.set(key, draft);
  mirrorText(key, draft.text);
}

export function newChatDraftKey(workspaceId: string): string {
  return `new-chat.${workspaceId}`;
}
