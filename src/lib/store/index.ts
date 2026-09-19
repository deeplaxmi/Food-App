"use client";

import { buildDemoData } from "../demo";
import { EMPTY_DATA, type AppData } from "../types";
import { loadLocal, saveLocal, clearLocal } from "./local";
import { isSupabaseConfigured, loadRemote, saveRemote } from "./supabase";

/**
 * A single document per household. Small enough that read-modify-write is the
 * right trade for an MVP, and it keeps the two adapters trivially consistent.
 *
 * When Supabase credentials are present the document is mirrored to Postgres
 * (see supabase/schema.sql for the normalised tables). Without them the app
 * runs fully on-device so it can be tried before any backend exists.
 */
export type StorageMode = "supabase" | "on-device";

export function storageMode(): StorageMode {
  return isSupabaseConfigured() ? "supabase" : "on-device";
}

export async function loadData(): Promise<AppData> {
  const local = loadLocal();
  if (isSupabaseConfigured()) {
    const remote = await loadRemote();
    if (remote) return remote;
  }
  return local ?? EMPTY_DATA;
}

export async function saveData(data: AppData): Promise<void> {
  saveLocal(data);
  if (isSupabaseConfigured()) await saveRemote(data);
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
