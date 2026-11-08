import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "./ui";

const COPIED_FEEDBACK_MS = 1000;

const COPY_BUTTON = cn(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap",
  "rounded-(--control-radius) border border-transparent font-medium outline-none transition-[box-shadow,scale]",
  "active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
  "disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
);

const COPY_BUTTON_VARIANTS = {
  message: "h-6 px-[calc(--spacing(2)-1px)] text-xs text-foreground hover:bg-accent",
  code: "size-6 text-muted-foreground hover:bg-accent hover:text-foreground",
};

interface CopyButtonProps {
  text: string;
  label: string;
  variant: keyof typeof COPY_BUTTON_VARIANTS;
}

export function CopyButton({ text, label, variant }: CopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  function showCopied() {
    setIsCopied(true);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS);
  }

  const Icon = isCopied ? Check : Copy;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={isCopied}
      onClick={() => void navigator.clipboard.writeText(text).then(showCopied)}
      className={cn(COPY_BUTTON, COPY_BUTTON_VARIANTS[variant])}
    >
      <Icon className={cn("size-3", isCopied ? "text-primary" : "text-muted-foreground")} />
    </button>
  );
}
