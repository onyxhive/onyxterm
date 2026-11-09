import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "./api";
import { USAGE_UPDATED, type UsageReport } from "./planUsage";

export interface AccountUsage {
  report: UsageReport | null;
  problem: string | null;
  isLoading: boolean;
}

const COMMAND_SEPARATOR = " ";
const NOT_LOADED: AccountUsage = { report: null, problem: null, isLoading: true };

type FetchUsage = (command: string) => Promise<UsageReport>;

export function usePlanUsage(commands: string[], isOpen: boolean) {
  const [accounts, setAccounts] = useState<Record<string, AccountUsage>>({});
  const commandKey = commands.join(COMMAND_SEPARATOR);

  const update = useCallback((command: string, change: Partial<AccountUsage>) => {
    setAccounts((current) => ({ ...current, [command]: { ...(current[command] ?? NOT_LOADED), ...change } }));
  }, []);

  const load = useCallback(
    (fetchUsage: FetchUsage) => {
      for (const command of commandKey.split(COMMAND_SEPARATOR)) {
        update(command, { isLoading: true });
        fetchUsage(command).then(
          (report) => update(command, { report, problem: null, isLoading: false }),
          (error) => update(command, { problem: String(error), isLoading: false }),
        );
      }
    },
    [commandKey, update],
  );

  useEffect(() => {
    if (isOpen) load(api.planUsage);
  }, [isOpen, load]);

  useEffect(() => {
    const subscription = listen<UsageReport>(USAGE_UPDATED, ({ payload }) =>
      update(payload.command, { report: payload, problem: null }),
    );
    return () => void subscription.then((unlisten) => unlisten());
  }, [update]);

  const shown = commands.map((command) => ({ command, account: accounts[command] ?? NOT_LOADED }));
  const updatedTimes = shown.flatMap(({ account }) => (account.report ? [account.report.updatedAt] : []));

  return {
    accounts: shown,
    oldestUpdate: updatedTimes.length > 0 ? Math.min(...updatedTimes) : null,
    isRefreshing: shown.some(({ account }) => account.isLoading),
    refresh: () => load(api.refreshPlanUsage),
  };
}
