"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { BottomNav, Button, Card, Notice, PageHeader, Screen, Spinner } from "@/components/ui";
import { trackFirstScan } from "@/lib/analytics";
import { newId } from "@/lib/store";
import type { Confidence, DetectedIngredient, ScanSource } from "@/lib/types";

const MAX_PHOTOS = 4;
/** Long edge in px. Keeps uploads small enough for a phone connection. */
const RESIZE_TO = 1280;

interface Photo {
  id: string;
  dataUrl: string;
}

export default function ScanPage() {
  const { data, ready, update } = useApp();
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [source, setSource] = useState<ScanSource>("camera");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return <Spinner />;

  const addFiles = async (files: FileList | null, from: ScanSource) => {
    if (!files?.length) return;
    setError(null);
    setSource(from);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setError(`That's the most we can read at once (${MAX_PHOTOS}).`);
      return;
    }
    const chosen = Array.from(files).slice(0, room);
    try {
      const next = await Promise.all(chosen.map((file) => downscale(file, RESIZE_TO)));
      setPhotos((current) => [...current, ...next.map((dataUrl) => ({ id: newId("img"), dataUrl }))]);
    } catch {
      setError("Couldn't read that photo. Try another one.");
    }
  };

  const analyze = async () => {
    if (photos.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vision/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: photos.map((p) => p.dataUrl) }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "That didn't work. You can add your produce by hand.");
        setBusy(false);
        return;
      }
      createScan(payload.items ?? [], source);
    } catch {
      setError("Couldn't reach the network. You can add your produce by hand.");
      setBusy(false);
    }
  };

  const createScan = (
    items: { name: string; quantity: string; confidence: Confidence }[],
    from: ScanSource,
  ) => {
    const householdId = data.household?.id ?? "household";
    const scanId = newId("scan");
    const now = new Date().toISOString();

    const detected: DetectedIngredient[] = items.map((item) => ({
      id: newId("ing"),
      scanId,
      name: titleCase(item.name),
      quantity: item.quantity,
      confidence: item.confidence,
      addedByUser: false,
      removed: false,
    }));

    update((draft) => ({
      ...draft,
      scans: [
        ...draft.scans,
        {
          id: scanId,
          householdId,
          source: from,
          photoCount: photos.length,
          purchasedOn: null,
          confirmedAt: null,
          createdAt: now,
        },
      ],
      detected: [...draft.detected, ...detected],
    }));

    trackFirstScan({ photoCount: photos.length, detectedCount: detected.length });
    router.push(`/confirm?scan=${scanId}`);
  };

  return (
    <>
      <Screen withNav>
        <PageHeader
          title="Scan my produce"
          subtitle="Lay things out so they're visible. Add a second photo if it won't all fit in one."
        />

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={(e) => {
            void addFiles(e.target.files, "camera");
            e.target.value = "";
          }}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            void addFiles(e.target.files, "upload");
            e.target.value = "";
          }}
        />

        {photos.length === 0 ? (
          <div className="rise space-y-3">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="tap card flex w-full flex-col items-center gap-3 px-6 py-14 text-center transition active:scale-[0.99]"
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-leaf-500 text-white">
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v10A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5z"
                    stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round"
                  />
                  <circle cx="12" cy="13" r="3.6" stroke="currentColor" strokeWidth="1.9" />
                </svg>
              </span>
              <span className="text-[22px] font-bold text-ink">Scan my produce</span>
              <span className="text-[16px] text-muted">Take a photo with your camera</span>
            </button>

            <Button variant="secondary" size="lg" full onClick={() => uploadRef.current?.click()}>
              Upload a photo instead
            </Button>
          </div>
        ) : (
          <div className="rise space-y-4">
            <ul className="grid grid-cols-2 gap-3">
              {photos.map((photo) => (
                <li key={photo.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.dataUrl}
                    alt=""
                    className="h-40 w-full rounded-2xl border border-hairline object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotos((c) => c.filter((p) => p.id !== photo.id))}
                    aria-label="Remove photo"
                    className="tap absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-ink/70 text-[20px] leading-none text-white backdrop-blur"
                  >
                    ×
                  </button>
                </li>
              ))}
              {photos.length < MAX_PHOTOS && (
                <li>
                  <button
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                    className="tap flex h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-hairline text-muted"
                  >
                    <span className="text-[28px] leading-none">+</span>
                    <span className="text-[15px] font-medium">Add another</span>
                  </button>
                </li>
              )}
            </ul>

            <Button size="lg" full onClick={analyze} disabled={busy}>
              {busy ? "Looking at your produce…" : `Use ${photos.length === 1 ? "this photo" : "these photos"}`}
            </Button>
          </div>
        )}

        {error && (
          <div className="mt-4 space-y-3">
            <Notice tone="warn">{error}</Notice>
            <Button variant="secondary" full onClick={() => createScan([], source)}>
              Add produce by hand
            </Button>
          </div>
        )}

        {!error && photos.length === 0 && (
          <p className="mt-6 text-center text-[14px] text-muted">
            Rather not photograph it?{" "}
            <button
              type="button"
              onClick={() => createScan([], "upload")}
              className="tap font-semibold text-leaf-600 underline underline-offset-2"
            >
              Type it in instead
            </button>
          </p>
        )}
      </Screen>
      <BottomNav />
    </>
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Shrinks and re-encodes a photo in the browser before it ever leaves the
 * device: smaller upload, and EXIF (including GPS) is dropped in the process.
 */
async function downscale(file: File, maxEdge: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}
