import { useState, type KeyboardEvent } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { elapsedSince } from "../tasks";
import type { FeedItem } from "../types";
import { Markdown } from "./Markdown";

type QuestionRequest = Extract<FeedItem, { kind: "question" }>;

interface QuestionCardProps {
  request: QuestionRequest;
  onAnswer: (requestId: string, answers: Record<string, string>) => void;
}

export function QuestionCard({ request, onAnswer }: QuestionCardProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const isComplete = request.questions.every((question) => answers[question.question]?.trim());

  function answer(question: string, value: string) {
    setAnswers({ ...answers, [question]: value });
  }

  function submit() {
    if (!isComplete) return;
    const trimmed = Object.fromEntries(Object.entries(answers).map(([question, value]) => [question, value.trim()]));
    onAnswer(request.requestId, trimmed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submit();
  }

  return (
    <section className="card question-card" aria-label="Question">
      <header className="card__header">
        <MessageCircleQuestion size={15} className="question-card__icon" />
        <span className="card__title">Question for you</span>
        <span className="card__meta">waiting {elapsedSince(request.since, Date.now())}</span>
      </header>
      {request.questions.map((question) => (
        <div key={question.question} className="question-card__question">
          <Markdown source={question.header ? `**${question.header}.** ${question.question}` : question.question} />
          <div className="question-card__chips">
            {question.options.map((option) => (
              <button
                key={option.label}
                type="button"
                className="chip"
                title={option.description}
                aria-pressed={answers[question.question] === option.label}
                onClick={() => answer(question.question, option.label)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <input
            className="question-card__input"
            value={answers[question.question] ?? ""}
            placeholder="Or type your own answer"
            aria-label={question.question}
            onChange={(event) => answer(question.question, event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      ))}
      <div className="question-card__answer">
        <button type="button" className="button button--primary" disabled={!isComplete} onClick={submit}>
          Answer <kbd>↵</kbd>
        </button>
      </div>
    </section>
  );
}
