import darkModeMark from "../assets/logo-dark-mode.svg";
import lightModeMark from "../assets/logo-light-mode.svg";
import { cn } from "./ui";

interface OnyxMarkProps {
  className?: string;
}

export function OnyxMark({ className }: OnyxMarkProps) {
  return (
    <span className={cn("inline-flex shrink-0", className)}>
      <img src={lightModeMark} alt="Onyx Hive" draggable={false} className="size-full dark:hidden" />
      <img src={darkModeMark} alt="Onyx Hive" draggable={false} className="hidden size-full dark:block" />
    </span>
  );
}
