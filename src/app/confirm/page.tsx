"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useApp } from "@/components/app-provider";
import {
  Button,
  Card,
  EmptyState,
  Notice,
  PageHeader,
  Pill,
  Screen,
  Spinner,
  TextInput,
} from "@/components/ui";
import { track } from "@/lib/analytics";
import { FRESHNESS_DISCLAIMER } from "@/lib/freshness";
import { ingredientsFor, scanById } from "@/lib/selectors";
import { newId } from "@/lib/store";
import type { Confidence } from "@/lib/types";

const CONFIDENCE_COPY: Record<Confidence, string> = {
  high: "Confident",
  medium: "Fairly sure",
  low: "Not sure — check this",
};

export default function ConfirmPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ConfirmScreen />
    </Suspense>
  );
}

function ConfirmScreen() {
  const { data, ready, update } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const scan = scanById(data, params.get("scan"));

  const [newName, setNewName] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [adding, setAdding] = useState(false);

  if (!ready) return <Spinner />;
  if (!scan) {
    return (
      <Screen>
        <PageHeader title="Nothing to confirm" back="/scan" />
        <EmptyState
          title="We lost track of that scan"
          body="Start again and we'll pick it back up."
          action={<Button onClick={() => router.push("/scan")}>Scan produce</Button>}
        />
      </Screen>
    );
  }

  const items = ingredientsFor(data, scan.id);

  const setQuantity = (id: string, quantity: string) =>
    update((draft) => ({
      ...draft,
      detected: draft.detected.map((d) => (d.id === id ? { ...d, quantity } : d)),
    }));

  const remove = (id: string) =>
    update((draft) => ({
      ...draft,
      detected: draft.detected.map((d) => (d.id === id ? { ...d, removed: true } : d)),
    }));

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    update((draft) => ({
      ...draft,
      detected: [
        ...draft.detected,
        {
          id: newId("ing"),
          scanId: scan.id,
          name: name.charAt(0).toUpperCase() + name.slice(1),
          quantity: newQuantity.trim() || "1",
          confidence: "high",
          addedByUser: true,
          removed: false,
        },
      ],
    }));
    setNewName("");
    setNewQuantity("");
    setAdding(false);
  };

  const confirm = () => {
    update((draft) => ({
      ...draft,
      scans: draft.scans.map((s) =>
        s.id === scan.id ? { ...s, confirmedAt: new Date().toISOString() } : s,
      ),
    }));
    track("ingredients_confirmed", {
      count: items.length,
      corrected: items.filter((i) => i.addedByUser).length,
    });
    router.push(`/priority?scan=${scan.id}`);
  };

  return (
    <Screen>
      <PageHeader
        eyebrow="Step 1 of 2"
        title={items.length ? "Does this look right?" : "What did you get?"}
        subtitle={
          items.length
            ? "Fix anything we got wrong. You know your kitchen better than we do."
            : "Add what you have and we'll take it from there."
        }
        back="/scan"
      />

      <ul className="space-y-3 rise">
        {items.map((item) => (
          <Card as="li" key={item.id} className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[18px] font-bold text-ink">{item.name}</h2>
                {item.addedByUser ? (
                  <Pill tone="leaf">Added by you</Pill>
                ) : (
                  <Pill tone={item.confidence === "low" ? "ai" : "plain"}>
                    {CONFIDENCE_COPY[item.confidence]}
                  </Pill>
                )}
              </div>
              <label className="mt-2.5 block">
                <span className="sr-only">Quantity of {item.name}</span>
                <TextInput
                  value={item.quantity}
                  onChange={(e) => setQuantity(item.id, e.target.value)}
                  placeholder="How much?"
                  aria-label={`Quantity of ${item.name}`}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => remove(item.id)}
              aria-label={`Remove ${item.name}`}
              className="tap mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline text-muted hover:border-tomato/40 hover:text-tomato"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 7h14M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7M7 7l.8 12A1.5 1.5 0 0 0 9.3 20.4h5.4A1.5 1.5 0 0 0 16.2 19L17 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </Card>
        ))}
      </ul>

      {adding ? (
        <Card className="mt-3 space-y-3 rise">
          <TextInput
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="What is it? e.g. Kale"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <TextInput
            value={newQuantity}
            onChange={(e) => setNewQuantity(e.target.value)}
            placeholder="How much? e.g. 1 bunch"
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <div className="flex gap-2">
            <Button full onClick={add} disabled={!newName.trim()}>
              Add it
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="tap mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-hairline px-4 py-4 text-[16px] font-semibold text-leaf-600"
        >
          <span className="text-[20px] leading-none">+</span> Add something we missed
        </button>
      )}

      <div className="mt-6 space-y-3">
        <Notice>{FRESHNESS_DISCLAIMER}</Notice>
        <Button size="lg" full onClick={confirm} disabled={items.length === 0}>
          {items.length === 0 ? "Add at least one item" : `Looks right — ${items.length} item${items.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </Screen>
  );
}
