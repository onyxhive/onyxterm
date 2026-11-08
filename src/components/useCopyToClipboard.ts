import { useEffect, useRef, useState } from "react";

const COPIED_FEEDBACK_MS = 1500;

export function useCopyToClipboard() {
  const [isCopied, setIsCopied] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  function showCopied() {
    setIsCopied(true);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS);
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(showCopied);
  }

  return { isCopied, copy };
}
