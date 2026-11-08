import type { ComponentProps, ReactNode } from "react";

type ClassPart = string | false | null | undefined;

export function cn(...parts: ClassPart[]): string {
  return parts.filter(Boolean).join(" ");
}

export const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

export const ICON_BUTTON = cn(
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-(--control-radius)",
  "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
  "disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-accent aria-pressed:text-foreground",
  "[&_svg]:size-4 [&_svg]:shrink-0",
  FOCUS_RING,
);

export const INLINE_BUTTON = cn(
  "inline-flex shrink-0 cursor-pointer items-center gap-1 font-medium underline-offset-2 hover:underline",
  "focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60",
);

export const OUTLINE_BUTTON = cn(
  "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-(--control-radius) border",
  "border-input bg-popover px-3 text-sm font-medium text-foreground shadow-xs/5 transition-colors",
  "hover:bg-accent/50 dark:bg-input/32 dark:hover:bg-input/64 [&_svg]:size-4 [&_svg]:text-muted-foreground",
  FOCUS_RING,
);

export const TEXT_INPUT = cn(
  "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground shadow-xs/5",
  "outline-none transition-shadow placeholder:text-placeholder focus-visible:border-ring",
  "focus-visible:ring-2 focus-visible:ring-ring/24 dark:bg-input/32",
);

export const PRIMARY_BUTTON = cn(
  "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary px-3",
  "text-sm font-medium whitespace-nowrap text-primary-foreground shadow-xs/5 transition-colors hover:bg-primary/90",
  "disabled:pointer-events-none disabled:opacity-64 [&_svg]:size-4",
  FOCUS_RING,
);

export const GHOST_BUTTON = cn(
  "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-sm",
  "font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
  "disabled:pointer-events-none disabled:opacity-64 [&_svg]:size-4",
  FOCUS_RING,
);

export const MENU_POPUP = "dropdown-glass z-50 rounded-lg p-1 text-sm text-foreground";

export const MENU_ITEM = cn(
  "flex min-h-7 w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1 text-left text-sm",
  "text-foreground outline-none hover:bg-accent focus-visible:bg-accent disabled:cursor-not-allowed",
  "disabled:opacity-60 disabled:hover:bg-transparent aria-checked:bg-foreground/[0.06]",
  "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground",
);

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-1 rounded",
        "bg-foreground/[0.07] px-1 font-sans text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{children}</div>;
}

export function MenuSeparator() {
  return <div role="separator" className="mx-2 my-1 h-px bg-border" />;
}
