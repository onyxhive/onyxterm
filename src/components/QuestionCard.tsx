import { useState, type KeyboardEvent } from "react";
import { MessageCircleQuestion } from "lucide-react";
import type { FeedItem } from "../mock";
import { Markdown } from "./Markdown";

type Question = Extract<FeedItem, { kind: "question" }>;

interface QuestionCardProps {
  question: Question;
  onAnswer: (answer: string) => void;
}

export function QuestionCard({ question, onAnswer }: QuestionCardProps) {
  const [answer, setAnswer] = useState("");

  function submit() {
    if (!answer.trim()) return;
    onAnswer(answer.trim());
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
        <span className="card__meta">waiting {question.waited}</span>
      </header>
      <Markdown source={question.markdown} />
      <div className="question-card__chips">
        {question.choices.map((choice) => (
          <button
            key={choice}
            type="button"
            className="chip"
            aria-pressed={answer === choice}
            onClick={() => setAnswer(choice)}
          >
            {choice}
          </button>
        ))}
      </div>
      <div className="question-card__answer">
        <input
          className="question-card__input"
          value={answer}
          placeholder="Type your answer"
          aria-label="Your answer"
          onChange={(event) => setAnswer(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="button button--primary" disabled={!answer.trim()} onClick={submit}>
          Answer <kbd>↵</kbd>
        </button>
      </div>
    </section>
  );
}
