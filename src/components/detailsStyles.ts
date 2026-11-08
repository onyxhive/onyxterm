import { cn, FOCUS_RING } from "./ui";

const ROW_HOVER = "hover:bg-black/[0.035] dark:hover:bg-white/[0.08]";

const CONTROL = cn(
  "relative h-8 min-w-0 cursor-pointer rounded-lg border border-transparent text-left",
  "text-[13px] font-medium whitespace-nowrap text-foreground/80 outline-none transition-colors",
  "disabled:pointer-events-none disabled:opacity-64 [&_svg]:shrink-0",
  FOCUS_RING,
);

export const DETAILS_ROW = cn(CONTROL, "flex w-full items-center justify-start gap-2.5 px-2.5", ROW_HOVER);

export const DETAILS_SELECT_ROW = cn(
  CONTROL,
  "flex w-full items-center justify-start",
  ROW_HOVER,
  "aria-expanded:bg-black/[0.035] dark:aria-expanded:bg-white/[0.08]",
);

export const DETAILS_STATIC_ROW = cn(
  "flex h-8 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-foreground/80",
);

export const DETAILS_ICON = "size-4 shrink-0 text-muted-foreground";

export const DETAILS_LABEL = "min-w-0 truncate";

export const DETAILS_SPLIT_GROUP = cn(
  "group/details-split relative flex w-full items-center rounded-lg",
  ROW_HOVER,
  "has-[[aria-expanded=true]]:bg-black/[0.035] dark:has-[[aria-expanded=true]]:bg-white/[0.08]",
);

export const DETAILS_SPLIT_PRIMARY = cn(
  CONTROL,
  "flex flex-1 items-center justify-start gap-2.5 rounded-e-none px-2.5",
  ROW_HOVER,
);

export const DETAILS_SPLIT_SECONDARY = cn(
  CONTROL,
  "inline-flex w-8 shrink-0 items-center justify-center rounded-s-none px-0",
  ROW_HOVER,
);

export const DETAILS_SPLIT_SEPARATOR = cn(
  "h-4 w-px shrink-0 bg-transparent group-hover/details-split:bg-border/65",
  "group-has-[[aria-expanded=true]]/details-split:bg-border/65",
);

export const DETAILS_ICON_ACTION = cn(
  "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground",
  "transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-64 [&_svg]:size-4",
  ROW_HOVER,
  FOCUS_RING,
);

export const DETAILS_SECTION = "px-2 py-2 [&+&]:border-t [&+&]:border-border/65";

export const DETAILS_ANCHORED_POPUP = "absolute top-full right-0 left-0 z-20 mt-1 [background:var(--popover)]";
