"use client";

import { buildDemoData } from "../demo";
import { EMPTY_DATA, type AppData } from "../types";
import { loadLocal, saveLocal, clearLocal } from "./local";
import { loadRemote, saveRemote, syncStatus } from "./remote";

/**
 * A single document per household. Small enough that read-modify-write is the
 * right trade for an MVP.
 *
 * Always written locally first, then mirrored to the server if a database is
 * configured there. Local is the source of truth for responsiveness and for
 * anyone offline; the server copy is what survives a lost phone and what lets
 * a household carry on across devices.
 */
export type StorageMode = "synced" | "on-device";

export function storageMode(): StorageMode {
  return syncStatus() ? "synced" : "on-device";
}

export async function loadData(): Promise<AppData> {
  const local = loadLocal();
  const remote = await loadRemote();
  // Prefer the server copy when it has a household on it; otherwise whatever
  // is on this device, which also covers the very first run.
  if (remote?.household) return remote;
  return local ?? EMPTY_DATA;
}

export async function saveData(data: AppData): Promise<void> {
  saveLocal(data);
  await saveRemote(data);
}

export async function resetData(): Promise<AppData> {
  clearLocal();
  const fresh = EMPTY_DATA;
  await saveData(fresh);
  return fresh;
}

export async function seedDemoData(): Promise<AppData> {
  const demo = buildDemoData();
  await saveData(demo);
  return demo;
}

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}
