import { useState, type KeyboardEvent } from "react";
import { cn } from "./ui";

interface NameFieldProps {
  initialValue: string;
  label: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

export function NameField({ initialValue, label, onCommit, onCancel }: NameFieldProps) {
  const [value, setValue] = useState(initialValue);

  function commit() {
    if (!value.trim()) {
      onCancel();
      return;
    }
    onCommit(value.trim());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    event.stopPropagation();
    if (event.key === "Enter") commit();
    if (event.key === "Escape") onCancel();
  }

  return (
    <input
      className={cn(
        "min-w-0 flex-1 rounded-sm bg-transparent text-sm font-medium text-foreground outline-none",
        "ring-1 ring-ring/50 ring-inset focus:ring-ring",
      )}
      autoFocus
      value={value}
      placeholder={label}
      aria-label={label}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={onCancel}
    />
  );
}
