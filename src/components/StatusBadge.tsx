import type { TaskStatus } from "../types";
import { STATUS_LABEL, STATUS_TONE } from "../status";
import { cn } from "./ui";

function ToneDot({ status, className }: { status: TaskStatus; className?: string }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        tone.dotClass,
        tone.isPulsing && "animate-status-pulse",
        className,
      )}
    />
  );
}

export function StatusDot({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span className="inline-flex items-center">
      <ToneDot status={status} className={className} />
      <span className="sr-only">{STATUS_LABEL[status]}</span>
    </span>
  );
}

export function StatusLabel({ status }: { status: TaskStatus }) {
  return (
    <span
      title={STATUS_LABEL[status]}
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium", STATUS_TONE[status].textClass)}
    >
      <ToneDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}
