import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn, ICON_BUTTON } from "./ui";

interface DialogProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function Dialog({ title, description, onClose, children, className }: DialogProps) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/32 px-4 pt-[12vh] backdrop-blur-[1px]"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn("dropdown-glass w-full max-w-lg rounded-2xl text-foreground", className)}
      >
        <header className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button type="button" className={cn(ICON_BUTTON, "-me-2")} aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
