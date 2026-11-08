import { useCallback, useEffect, useState } from "react";
import { api, type Settings } from "./api";

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    api.getSettings().then(setSettings, () => setSettings({}));
  }, []);

  const remember = useCallback((key: string, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }));
    void api.setSetting(key, value);
  }, []);

  return { settings, remember };
}
