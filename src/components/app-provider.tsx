"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { trackReturnVisit } from "@/lib/analytics";
import { loadData, resetData, saveData, seedDemoData, storageMode, type StorageMode } from "@/lib/store";
import { EMPTY_DATA, type AppData } from "@/lib/types";

interface AppContextValue {
  data: AppData;
  ready: boolean;
  /** Read-modify-write against the latest state; persists automatically. */
  update: (mutate: (draft: AppData) => AppData) => void;
  seedDemo: () => Promise<void>;
  reset: () => Promise<void>;
  mode: StorageMode;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);
  // Resolved after the first load, since it depends on whether the server replied.
  const [mode, setMode] = useState<StorageMode>("on-device");

  useEffect(() => {
    let cancelled = false;
    void loadData().then((loaded) => {
      if (cancelled) return;
      setData(loaded);
      setMode(storageMode());
      setReady(true);
      trackReturnVisit();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((mutate: (draft: AppData) => AppData) => {
    setData((current) => {
      const next = mutate(current);
      void saveData(next).then(() => setMode(storageMode()));
      return next;
    });
  }, []);

  const seedDemo = useCallback(async () => {
    setData(await seedDemoData());
  }, []);

  const reset = useCallback(async () => {
    setData(await resetData());
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({ data, ready, update, seedDemo, reset, mode }),
    [data, ready, update, seedDemo, reset, mode],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
