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
import { loadData, resetData, saveData, seedDemoData, storageMode } from "@/lib/store";
import { EMPTY_DATA, type AppData } from "@/lib/types";

interface AppContextValue {
  data: AppData;
  ready: boolean;
  /** Read-modify-write against the latest state; persists automatically. */
  update: (mutate: (draft: AppData) => AppData) => void;
  seedDemo: () => Promise<void>;
  reset: () => Promise<void>;
  mode: "supabase" | "on-device";
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadData().then((loaded) => {
      if (cancelled) return;
      setData(loaded);
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
      void saveData(next);
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
    () => ({ data, ready, update, seedDemo, reset, mode: storageMode() }),
    [data, ready, update, seedDemo, reset],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
