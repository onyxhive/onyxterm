import { useCallback, useRef, useState } from "react";
import { useDismiss } from "./useDismiss";

export function usePopup<T extends HTMLElement = HTMLDivElement>() {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<T>(null);
  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(rootRef, isOpen, close);
  return { isOpen, rootRef, close, toggle: () => setIsOpen(!isOpen) };
}
