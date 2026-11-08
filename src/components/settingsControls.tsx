import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn, FOCUS_RING, MENU_ITEM, MENU_POPUP } from "./ui";
import { usePopup } from "./usePopup";

interface SettingsRowProps {
  title: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SettingsSelectProps<T extends string> {
  label: string;
  options: SelectOption<T>[];
  value: T | undefined;
  emptyLabel?: string;
  onChange: (value: T) => void;
}

interface SwitchProps {
  label: string;
  isChecked: boolean;
  onChange: (isChecked: boolean) => void;
}

const SECTION_CARD = cn(
  "rounded-xl border border-border/60 bg-card/40 shadow-xs/5",
  "[&>*+*]:border-t [&>*+*]:border-border/50",
);

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <h2 className="flex min-h-7 items-center px-3 text-base font-semibold text-foreground sm:px-4">{title}</h2>
      <div className={SECTION_CARD}>{children}</div>
    </section>
  );
}

export function SettingsRow({ title, description, control, children }: SettingsRowProps) {
  return (
    <div className={cn("px-3 sm:px-4", children ? "pt-3 pb-3" : "py-3")}>
      <div className="flex items-center gap-8">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          {description && (
            <p className="max-w-2xl text-xs leading-normal text-pretty text-muted-foreground">{description}</p>
          )}
        </div>
        {control && <div className="flex shrink-0 items-center gap-2">{control}</div>}
      </div>
      {children}
    </div>
  );
}

export function Switch({ label, isChecked, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={isChecked}
      onClick={() => onChange(!isChecked)}
      className={cn(
        "inline-flex h-5 w-8 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors",
        "bg-input aria-checked:bg-primary dark:bg-input/80",
        FOCUS_RING,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-4 rounded-full bg-white shadow-xs/10 transition-transform",
          isChecked && "translate-x-3",
        )}
      />
    </button>
  );
}

export function SettingsSelect<T extends string>(props: SettingsSelectProps<T>) {
  const { label, options, value, emptyLabel, onChange } = props;
  const popup = usePopup();
  const current = options.find((option) => option.value === value) ?? options[0];
  return (
    <div className="relative" ref={popup.rootRef}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={popup.isOpen}
        disabled={options.length === 0}
        onClick={popup.toggle}
        className={cn(
          "inline-flex h-8 min-w-40 cursor-pointer items-center justify-between gap-2 rounded-lg border",
          "border-input bg-popover px-3 text-sm text-foreground shadow-xs/5 hover:bg-accent/50",
          "disabled:opacity-64 dark:bg-input/32",
        )}
      >
        {current?.label ?? emptyLabel}
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>
      {popup.isOpen && (
        <div role="menu" aria-label={label} className={cn(MENU_POPUP, "absolute top-full right-0 mt-1 min-w-56")}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === current?.value}
              className={cn(MENU_ITEM, "whitespace-nowrap")}
              onClick={() => {
                onChange(option.value);
                popup.close();
              }}
            >
              {option.label}
              <Check className={cn("ms-auto size-3.5", option.value !== current?.value && "invisible")} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
