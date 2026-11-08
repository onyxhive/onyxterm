import { useEffect, useState } from "react";
import { Check, MessageCircleQuestion } from "lucide-react";
import type { FeedItem, Question } from "../types";
import { Markdown } from "./Markdown";
import { cn, Kbd } from "./ui";

export type QuestionRequest = Extract<FeedItem, { kind: "question" }>;

const SHORTCUT_OPTION_LIMIT = 9;
const MULTI_ANSWER_SEPARATOR = ", ";

interface QuestionAnswersState {
  requestId: string | null;
  index: number;
  answers: Record<string, string>;
  selections: Record<string, string[]>;
}

function freshState(requestId: string | null): QuestionAnswersState {
  return { requestId, index: 0, answers: {}, selections: {} };
}

export interface QuestionAnswers {
  question: Question | null;
  index: number;
  count: number;
  selected: string[];
  toggle: (label: string) => void;
  canSubmit: (text: string) => boolean;
  submit: (text: string) => Record<string, string> | null;
}

export function useQuestionAnswers(request: QuestionRequest | null): QuestionAnswers {
  const requestId = request?.requestId ?? null;
  const [state, setState] = useState<QuestionAnswersState>(() => freshState(requestId));
  const current = state.requestId === requestId ? state : freshState(requestId);
  const question = request?.questions[current.index] ?? null;
  const selected = question ? (current.selections[question.question] ?? []) : [];

  function answerFrom(text: string): string {
    return text.trim() || selected.join(MULTI_ANSWER_SEPARATOR);
  }

  function toggle(label: string) {
    if (!question) return;
    const nextSelected = question.multiSelect
      ? selected.includes(label)
        ? selected.filter((candidate) => candidate !== label)
        : [...selected, label]
      : [label];
    setState({ ...current, selections: { ...current.selections, [question.question]: nextSelected } });
  }

  function submit(text: string): Record<string, string> | null {
    if (!request || !question || !answerFrom(text)) return null;
    const answers = { ...current.answers, [question.question]: answerFrom(text) };
    const isLast = current.index === request.questions.length - 1;
    setState({ ...current, answers, index: isLast ? current.index : current.index + 1 });
    return isLast ? answers : null;
  }

  return {
    question,
    index: current.index,
    count: request?.questions.length ?? 0,
    selected,
    toggle,
    canSubmit: (text) => answerFrom(text).length > 0,
    submit,
  };
}

function isTypingText(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return true;
  return target instanceof HTMLTextAreaElement && target.value.length > 0;
}

function OptionMark({ isChecked, isMulti }: { isChecked: boolean; isMulti: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex size-4 shrink-0 items-center justify-center border border-input bg-background",
        "dark:bg-input/32",
        isMulti ? "rounded-[0.3rem]" : "rounded-full",
        isChecked && "border-primary bg-primary text-primary-foreground dark:bg-primary",
      )}
    >
      {isChecked && isMulti && <Check className="size-3" strokeWidth={3} />}
      {isChecked && !isMulti && <span className="size-1.5 rounded-full bg-primary-foreground" />}
    </span>
  );
}

export function QuestionDrawer({ answers }: { answers: QuestionAnswers }) {
  const { question, toggle } = answers;

  useEffect(() => {
    if (!question) return;
    function selectByNumber(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingText(event.target)) return;
      const option = question?.options[Number(event.key) - 1];
      if (!option) return;
      event.preventDefault();
      toggle(option.label);
    }
    window.addEventListener("keydown", selectByNumber);
    return () => window.removeEventListener("keydown", selectByNumber);
  }, [question, toggle]);

  if (!question) return null;

  return (
    <section aria-label="Question" className="px-1 pt-1 text-xs">
      <div className="flex min-h-7 items-center gap-1 px-1">
        <span className="flex w-6 shrink-0 justify-center text-input-request">
          <MessageCircleQuestion className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {question.header || "The agent asked you"}
        </span>
        {answers.count > 1 && (
          <span className="px-1.5 font-medium tabular-nums text-muted-foreground">
            {answers.index + 1}/{answers.count}
          </span>
        )}
      </div>
      <div className="max-h-[min(24rem,40vh)] overflow-y-auto ps-7 pe-3 pb-1">
        <Markdown source={question.question} className="pt-1 text-foreground/85" />
        <div className="-ms-1.5 mt-1.5">
          {question.options.map((option, position) => {
            const isChecked = answers.selected.includes(option.label);
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={isChecked}
                onClick={() => toggle(option.label)}
                className={cn(
                  "flex w-full cursor-pointer items-start gap-2.5 rounded-md py-1.5 ps-1.5 text-left outline-none",
                  "transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-primary/25",
                  "focus-visible:ring-inset",
                  isChecked ? "text-foreground" : "text-foreground/70 hover:bg-muted",
                )}
              >
                <span className="flex h-5 items-center">
                  <OptionMark isChecked={isChecked} isMulti={question.multiSelect} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">{option.label}</span>
                  {option.description && option.description !== option.label && (
                    <span className="text-2xs text-secondary-label">{option.description}</span>
                  )}
                </span>
                {position < SHORTCUT_OPTION_LIMIT && (
                  <span className="flex h-5 w-6 shrink-0 items-center justify-center">
                    <Kbd>{position + 1}</Kbd>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function QuestionRow({ request }: { request: QuestionRequest }) {
  const first = request.questions[0];
  return (
    <div className="flex min-h-6 items-center gap-1.5 px-0.5 pb-2 text-sm leading-relaxed">
      <span className="flex size-6 shrink-0 items-center justify-center text-input-request">
        <MessageCircleQuestion className="size-4" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1 truncate text-secondary-label">
        {first?.header || first?.question || "The agent asked you"}
      </span>
      <span className="shrink-0 text-xs text-input-request">Answer below</span>
    </div>
  );
}
