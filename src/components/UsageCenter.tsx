import { ChartNoAxesColumn, RotateCw } from "lucide-react";
import type { ExtraUsage, PlanUsage, UsageWindow } from "../planUsage";
import { usePlanUsage, type AccountUsage } from "../usePlanUsage";
import { SIDEBAR_UTILITY_BUTTON } from "./Sidebar";
import { cn, ICON_BUTTON, MENU_POPUP, MenuLabel, MenuSeparator } from "./ui";
import { useNow } from "./useNow";
import { usePopup } from "./usePopup";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const WARNING_PERCENT = 80;
const FULL_PERCENT = 100;
const SKELETON_ROWS = 2;
const SKELETON = "rounded-full bg-foreground/[0.07] animate-pulse motion-reduce:animate-none";

function minutesUntil(timestamp: number, now: number): number {
  return Math.max(0, Math.round((timestamp - now) / MS_PER_SECOND / SECONDS_PER_MINUTE));
}

function resetLabel(resetsAt: number, now: number): string {
  const minutes = minutesUntil(resetsAt, now);
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < 1) return `Resets in ${minutes}m`;
  if (hours < HOURS_PER_DAY) return `Resets in ${hours}h ${minutes % MINUTES_PER_HOUR}m`;
  const clock = new Date(resetsAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  return `Resets ${clock}`;
}

function updatedLabel(updatedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - updatedAt) / MS_PER_SECOND));
  if (seconds < SECONDS_PER_MINUTE) return `Updated ${seconds}s ago`;
  return `Updated ${Math.floor(seconds / SECONDS_PER_MINUTE)}m ago`;
}

function planLabel(subscriptionType: string | null): string {
  if (!subscriptionType) return "";
  return subscriptionType.charAt(0).toUpperCase() + subscriptionType.slice(1);
}

function money(amount: number, currency: string | null): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency ?? "USD" }).format(amount);
}

function spentLabel(extra: ExtraUsage): string | null {
  if (extra.used === null) return null;
  const used = money(extra.used, extra.currency);
  if (extra.monthlyLimit === null) return `${used} spent`;
  return `${used} of ${money(extra.monthlyLimit, extra.currency)} spent`;
}

function fillTone(utilization: number): string {
  if (utilization >= FULL_PERCENT) return "bg-error";
  if (utilization >= WARNING_PERCENT) return "bg-warning";
  return "bg-primary";
}

interface MeterProps {
  label: string;
  utilization: number;
  note: string | null;
  noteTitle?: string;
}

function Meter({ label, utilization, note, noteTitle }: MeterProps) {
  return (
    <div className="flex flex-col gap-1 px-2 py-1.5">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{Math.round(utilization)}% used</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={FULL_PERCENT}
        aria-valuenow={Math.round(utilization)}
        className="h-1 overflow-hidden rounded-full bg-foreground/10"
      >
        <div className={cn("h-full rounded-full", fillTone(utilization))} style={{ width: `${utilization}%` }} />
      </div>
      {note && (
        <span title={noteTitle} className="text-xs text-muted-foreground">
          {note}
        </span>
      )}
    </div>
  );
}

function WindowMeter({ label, window, now }: { label: string; window: UsageWindow; now: number }) {
  const resetsAt = window.resetsAt;
  return (
    <Meter
      label={label}
      utilization={window.utilization}
      note={resetsAt === null ? null : resetLabel(resetsAt, now)}
      noteTitle={resetsAt === null ? undefined : new Date(resetsAt).toLocaleString()}
    />
  );
}

function ExtraUsageMeter({ extra }: { extra: ExtraUsage }) {
  const spent = spentLabel(extra);
  if (extra.utilization === null) {
    return (
      <p className="px-2 py-1.5 text-sm">
        Extra usage{spent && <span className="text-muted-foreground"> {spent}</span>}
      </p>
    );
  }
  return <Meter label="Extra usage" utilization={extra.utilization} note={spent} />;
}

function Note({ children, className }: { children: string; className?: string }) {
  return <p className={cn("px-2 pb-1.5 text-xs text-muted-foreground", className)}>{children}</p>;
}

function UsageDetails({ usage, now }: { usage: PlanUsage; now: number }) {
  if (!usage.hasPlanLimits) return <Note>Not available for API-key accounts</Note>;
  const hasWindows = usage.session || usage.week || usage.modelWeeks.length > 0;
  return (
    <>
      {!hasWindows && <Note>No limits reported</Note>}
      {usage.session && <WindowMeter label="Current session" window={usage.session} now={now} />}
      {usage.week && <WindowMeter label="Current week (all models)" window={usage.week} now={now} />}
      {usage.modelWeeks.map((week) => (
        <WindowMeter key={week.model} label={`Current week (${week.model})`} window={week} now={now} />
      ))}
      {usage.extraUsage && <ExtraUsageMeter extra={usage.extraUsage} />}
    </>
  );
}

function UsageSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <div key={row} className="flex flex-col gap-1.5 px-2 py-2">
          <div className="flex justify-between">
            <span className={cn(SKELETON, "h-3 w-28")} />
            <span className={cn(SKELETON, "h-3 w-12")} />
          </div>
          <span className={cn(SKELETON, "h-1 w-full")} />
          <span className={cn(SKELETON, "h-2.5 w-20")} />
        </div>
      ))}
    </div>
  );
}

function AccountBody({ account, now }: { account: AccountUsage; now: number }) {
  if (account.problem) {
    return (
      <p title={account.problem} className="px-2 pb-1.5 text-xs">
        <span className="font-medium text-error-foreground">Usage unavailable</span>
        <span className="line-clamp-2 text-muted-foreground [overflow-wrap:anywhere]">{account.problem}</span>
      </p>
    );
  }
  if (!account.report) return <UsageSkeleton />;
  return <UsageDetails usage={account.report.usage} now={now} />;
}

function AccountSection({ command, account, now }: { command: string; account: AccountUsage; now: number }) {
  const plan = planLabel(account.report?.usage.subscriptionType ?? null);
  return (
    <section aria-label={command} aria-busy={account.isLoading}>
      <MenuLabel>
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate">{command}</span>
          {plan && <span className="shrink-0 font-normal">{plan}</span>}
        </span>
      </MenuLabel>
      <AccountBody account={account} now={now} />
    </section>
  );
}

export function UsageCenter({ commands }: { commands: string[] }) {
  const popup = usePopup();
  const usage = usePlanUsage(commands, popup.isOpen);
  const now = useNow(popup.isOpen);

  return (
    <div ref={popup.rootRef} className="shrink-0">
      <button
        type="button"
        aria-label="Usage"
        title="Usage"
        aria-haspopup="dialog"
        aria-expanded={popup.isOpen}
        onClick={popup.toggle}
        className={cn(
          SIDEBAR_UTILITY_BUTTON,
          "aria-expanded:bg-sidebar-row-active aria-expanded:text-sidebar-foreground",
        )}
      >
        <ChartNoAxesColumn />
      </button>
      {popup.isOpen && (
        <div
          role="dialog"
          aria-label="Usage"
          className={cn(
            MENU_POPUP,
            "fixed bottom-12 left-2 flex max-h-[min(32rem,calc(100vh-6rem))] w-80 flex-col",
          )}
        >
          <div className="flex h-8 shrink-0 items-center gap-2 ps-2">
            <span className="font-medium">Usage</span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground tabular-nums">
              {usage.oldestUpdate !== null && updatedLabel(usage.oldestUpdate, now)}
            </span>
            <button
              type="button"
              aria-label="Refresh usage"
              title="Refresh usage"
              disabled={usage.isRefreshing}
              onClick={usage.refresh}
              className={cn(ICON_BUTTON, "size-6 [&_svg]:size-3.5")}
            >
              <RotateCw className={cn(usage.isRefreshing && "animate-spin motion-reduce:animate-none")} />
            </button>
          </div>
          <MenuSeparator />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {usage.accounts.map(({ command, account }, index) => (
              <div key={command}>
                {index > 0 && <MenuSeparator />}
                <AccountSection command={command} account={account} now={now} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
