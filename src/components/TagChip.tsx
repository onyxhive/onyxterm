import { COLOR_TONE_CLASS } from "../colorTones";
import type { Tag } from "../types";
import { cn } from "./ui";

export function TagChip({ tag }: { tag: Tag }) {
  return (
    <span
      title={tag.name}
      className={cn(
        "inline-block h-4 max-w-24 shrink-0 truncate rounded-full px-1.5 text-[10px] leading-4 font-medium",
        COLOR_TONE_CLASS[tag.color],
      )}
    >
      {tag.name}
    </span>
  );
}
