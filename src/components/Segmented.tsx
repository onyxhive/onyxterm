import { cn, FOCUS_RING } from "./ui";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function Segmented<T extends string>({ label, options, value, onChange, className }: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex shrink-0 items-center rounded-lg bg-foreground/[0.06] p-0.5", className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex h-6 cursor-pointer items-center rounded-md px-2 text-xs font-medium whitespace-nowrap",
            "text-muted-foreground transition-colors hover:text-foreground",
            "aria-checked:bg-background aria-checked:text-foreground aria-checked:shadow-xs/5",
            "dark:aria-checked:bg-white/10",
            FOCUS_RING,
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
