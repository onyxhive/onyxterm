import { useEffect, useRef } from "react";

const COMPOSER_INSERT = "onyx-composer-insert";

export function insertIntoComposer(text: string) {
  window.dispatchEvent(new CustomEvent<string>(COMPOSER_INSERT, { detail: text }));
}

export function withInsertion(current: string, inserted: string): string {
  const separator = current === "" || /\s$/.test(current) ? "" : " ";
  return `${current}${separator}${inserted}`;
}

export function useComposerInsertions(onInsert: (text: string) => void) {
  const onInsertRef = useRef(onInsert);
  onInsertRef.current = onInsert;

  useEffect(() => {
    const receive = (event: Event) => onInsertRef.current((event as CustomEvent<string>).detail);
    window.addEventListener(COMPOSER_INSERT, receive);
    return () => window.removeEventListener(COMPOSER_INSERT, receive);
  }, []);
}
