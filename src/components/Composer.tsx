import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Paperclip } from "lucide-react";
import { useComposerInsertions, withInsertion } from "../composerInsertions";
import { mentionTargetsOf } from "../mentions";
import { sendNeedsModifier } from "../preferences";
import { ACCEPTED_IMAGE_TYPES, isImageFile } from "../imageAttachments";
import type { ImageAttachment, Suggestion } from "../types";
import { findTrigger, matchSuggestions, type SuggestionSources } from "./composerTrigger";
import { ImageThumbnail } from "./ImageThumbnail";
import { MentionText } from "./MentionText";
import { SuggestionList, suggestionOptionId } from "./SuggestionPopup";
import { cn, ICON_BUTTON } from "./ui";
import { useImageAttachments } from "./useImageAttachments";

interface ComposerProps {
  placeholder: string;
  variant: "hero" | "reply";
  suggestionSources: SuggestionSources;
  onSubmit: (text: string, images: ImageAttachment[]) => void;
  controls?: ReactNode;
  agentControls?: ReactNode;
  drawer?: ReactNode;
  footnote?: ReactNode;
  sendBlockedReason?: string;
  canSubmitEmpty?: boolean;
  submitLabel?: string;
  onStop?: () => void;
}

const DEFAULT_SUBMIT_LABEL = "Send message";
const ATTACH_IMAGES_LABEL = "Attach images";
const COMPOSER_TEXT = "py-[0.0625em] text-sm leading-normal whitespace-pre-wrap break-words";

export const COMPOSER_PLACEHOLDER = "Ask anything. @ files, / commands";
export const QUESTION_PLACEHOLDER = "Type your own answer, or leave this blank to use the selected option";

function cycle(index: number, step: number, length: number): number {
  return (index + step + length) % length;
}

function ArrowUpGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopButton({ onStop }: { onStop: () => void }) {
  return (
    <button
      type="button"
      aria-label="Stop the agent"
      title="Stop"
      onClick={onStop}
      className={cn(
        "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-destructive/90 text-white",
        "shadow-xs shadow-destructive/24 transition-colors duration-150 hover:bg-destructive",
      )}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
        <rect x="2" y="2" width="8" height="8" rx="1.5" />
      </svg>
    </button>
  );
}

function SuggestionsEmpty({ isMention }: { isMention: boolean }) {
  return (
    <div className="px-5 pt-3.5 pb-7">
      <p className="text-xs text-secondary-label">
        {isMention ? "No matching files or folders." : "No matching command."}
      </p>
    </div>
  );
}

function AttachedDrawer({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-0 -mb-4 rounded-t-2xl border border-b-0 border-(--composer-outline) bg-popover pb-4">
      {children}
    </div>
  );
}

export function Composer(props: ComposerProps) {
  const { placeholder, variant, suggestionSources, onSubmit, controls, agentControls, drawer, footnote } = props;
  const { sendBlockedReason, canSubmitEmpty = false, submitLabel = DEFAULT_SUBMIT_LABEL, onStop } = props;
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const listId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachments = useImageAttachments();
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  useComposerInsertions((inserted) => {
    const next = withInsertion(text, inserted);
    pendingCaret.current = next.length;
    setText(next);
    setCaret(next.length);
    inputRef.current?.focus();
  });

  const mentionTargets = useMemo(() => mentionTargetsOf(suggestionSources.mentions), [suggestionSources]);
  const trigger = findTrigger(text, caret, suggestionSources);
  const suggestions = trigger ? matchSuggestions(trigger) : [];
  const isMenuOpen = trigger !== null && dismissedStart !== trigger.start;
  const hasSuggestions = suggestions.length > 0;
  const isListOpen = isMenuOpen && hasSuggestions;
  const highlighted = Math.min(activeIndex, suggestions.length - 1);
  const hasText = text.trim().length > 0;
  const hasImages = attachments.images.length > 0;
  const canSubmit = (hasText || hasImages || canSubmitEmpty) && sendBlockedReason === undefined;
  const showsStop = !hasText && !hasImages && !canSubmitEmpty;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
    if (pendingCaret.current === null) return;
    input.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [text]);

  function syncCaret() {
    setCaret(inputRef.current?.selectionStart ?? 0);
  }

  function pick(suggestion: Suggestion) {
    if (!trigger) return;
    const inserted = suggestion.kind === "folder" ? suggestion.value : `${suggestion.value} `;
    const nextCaret = trigger.start + inserted.length;
    pendingCaret.current = nextCaret;
    setText(text.slice(0, trigger.start) + inserted + text.slice(caret));
    setCaret(nextCaret);
    setActiveIndex(0);
    inputRef.current?.focus();
  }

  function attachFiles(files: FileList | null) {
    if (files && files.length > 0) void attachments.add([...files]);
  }

  function pasteImages(event: ClipboardEvent<HTMLTextAreaElement>) {
    const images = [...event.clipboardData.files].filter(isImageFile);
    if (images.length === 0) return;
    event.preventDefault();
    void attachments.add(images);
  }

  function hasDraggedFiles(event: DragEvent) {
    return event.dataTransfer.types.includes("Files");
  }

  function allowFileDrop(event: DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setIsDraggingFiles(true);
  }

  function dropFiles(event: DragEvent<HTMLDivElement>) {
    setIsDraggingFiles(false);
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    attachFiles(event.dataTransfer.files);
  }

  function submit() {
    if (!canSubmit) return;
    onSubmit(text.trim(), attachments.images);
    attachments.clear();
    setText("");
    setCaret(0);
  }

  function menuActions(): Record<string, () => void> {
    if (!trigger || !isMenuOpen) return {};
    const dismiss = { Escape: () => setDismissedStart(trigger.start) };
    if (!hasSuggestions) return dismiss;
    return {
      ...dismiss,
      ArrowDown: () => setActiveIndex(cycle(highlighted, 1, suggestions.length)),
      ArrowUp: () => setActiveIndex(cycle(highlighted, -1, suggestions.length)),
      Tab: () => pick(suggestions[highlighted]),
      Enter: () => pick(suggestions[highlighted]),
    };
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const menuAction = event.shiftKey ? undefined : menuActions()[event.key];
    if (menuAction) {
      event.preventDefault();
      menuAction();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.altKey) return;
    const hasModifier = event.metaKey || event.ctrlKey;
    if (hasModifier !== sendNeedsModifier(text)) return;
    event.preventDefault();
    submit();
  }

  const suggestionMenu = hasSuggestions ? (
    <SuggestionList
      id={listId}
      suggestions={suggestions}
      query={trigger?.query ?? ""}
      activeIndex={highlighted}
      onPick={pick}
      onHighlight={setActiveIndex}
    />
  ) : (
    <SuggestionsEmpty isMention={trigger?.source === suggestionSources.mentions} />
  );
  const drawerContent = isMenuOpen ? suggestionMenu : drawer;

  return (
    <div className="relative mx-auto w-full max-w-(--chat-content-max-width)">
      {drawerContent && <AttachedDrawer>{drawerContent}</AttachedDrawer>}
      <div
        className={cn(
          "glass composer-outline relative z-10 rounded-2xl transition-shadow",
          isDraggingFiles && "ring-2 ring-ring/60",
        )}
        onDragOver={allowFileDrop}
        onDragLeave={() => setIsDraggingFiles(false)}
        onDrop={dropFiles}
      >
        {(hasImages || attachments.problem) && (
          <div className="flex flex-col gap-1.5 px-3.5 pt-3">
            {hasImages && (
              <div className="flex flex-wrap gap-2">
                {attachments.images.map((image, index) => (
                  <ImageThumbnail
                    key={index}
                    image={image}
                    className="size-14"
                    onRemove={() => attachments.remove(index)}
                  />
                ))}
              </div>
            )}
            {attachments.problem && (
              <p role="alert" className="text-xs text-warning-foreground">
                {attachments.problem}
              </p>
            )}
          </div>
        )}
        <div className="relative px-3.5 pt-3 pb-1">
          <div className="relative max-h-[40vh] overflow-y-auto">
            <div aria-hidden className={cn(COMPOSER_TEXT, "pointer-events-none absolute inset-0 text-foreground")}>
              <MentionText text={text} targets={mentionTargets} />
            </div>
            <textarea
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              ref={inputRef}
              rows={variant === "hero" ? 2 : 1}
              value={text}
              placeholder={placeholder}
              aria-label={placeholder}
              role="combobox"
              aria-expanded={isListOpen}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={isListOpen ? suggestionOptionId(listId, highlighted) : undefined}
              autoFocus
              onChange={(event) => {
                setText(event.target.value);
                setCaret(event.target.selectionStart);
                setActiveIndex(0);
              }}
              onSelect={syncCaret}
              onKeyDown={handleKeyDown}
              onPaste={pasteImages}
              className={cn(
                COMPOSER_TEXT,
                "relative block w-full resize-none overflow-hidden bg-transparent text-transparent caret-foreground",
                "outline-none placeholder:text-placeholder",
              )}
            />
          </div>
        </div>
        <div className="@container flex min-w-0 items-center gap-2 px-2 pb-2">
          <div className="flex min-w-0 flex-1 items-center gap-0.5">
            <button
              type="button"
              aria-label={ATTACH_IMAGES_LABEL}
              title={ATTACH_IMAGES_LABEL}
              className={ICON_BUTTON}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              multiple
              hidden
              onChange={(event) => {
                attachFiles(event.target.files);
                event.target.value = "";
              }}
            />
            {controls}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">{agentControls}</div>
          {onStop && showsStop ? (
            <StopButton onStop={onStop} />
          ) : (
            <span className="inline-flex" title={sendBlockedReason ?? submitLabel}>
              <button
                type="button"
                aria-label={submitLabel}
                disabled={!canSubmit}
                onClick={submit}
                className={cn(
                  "relative flex size-7 items-center justify-center rounded-full bg-message-action shadow-xs",
                  "text-message-action-foreground shadow-message-action/24 transition-all duration-150",
                  "enabled:cursor-pointer enabled:hover:scale-105 enabled:hover:bg-message-action-hover",
                  "disabled:bg-foreground/12 disabled:text-muted-foreground disabled:shadow-none",
                )}
              >
                <ArrowUpGlyph />
              </button>
            </span>
          )}
        </div>
      </div>
      {footnote}
    </div>
  );
}
