"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useApp } from "@/components/app-provider";
import {
  BandBadge,
  Button,
  Card,
  EmptyState,
  Notice,
  PageHeader,
  Screen,
  Spinner,
} from "@/components/ui";
import { BAND_BLURB, BAND_LABELS, FRESHNESS_DISCLAIMER } from "@/lib/freshness";
import { bandedItems, groupByBand, scanById } from "@/lib/selectors";

const PURCHASE_OPTIONS = [
  { label: "Today", days: 0 },
  { label: "Yesterday", days: 1 },
  { label: "A few days ago", days: 3 },
  { label: "About a week ago", days: 7 },
];

export default function PriorityPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <PriorityScreen />
    </Suspense>
  );
}

function PriorityScreen() {
  const { data, ready, update } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const scan = scanById(data, params.get("scan"));

  if (!ready) return <Spinner />;
  if (!scan) {
    return (
      <Screen>
        <PageHeader title="Nothing here yet" />
        <EmptyState
          title="No produce on file"
          body="Scan what you've got and we'll work out what to cook first."
          action={<Button onClick={() => router.push("/scan")}>Scan produce</Button>}
        />
      </Screen>
    );
  }

  const items = bandedItems(data, scan);
  const groups = groupByBand(items);

  const setPurchased = (days: number | null) => {
    const value =
      days === null
        ? null
        : (() => {
            const d = new Date();
            d.setDate(d.getDate() - days);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          })();
    update((draft) => ({
      ...draft,
      scans: draft.scans.map((s) => (s.id === scan.id ? { ...s, purchasedOn: value } : s)),
    }));
  };

  const selectedDays = (() => {
    if (!scan.purchasedOn) return null;
    const then = new Date(`${scan.purchasedOn}T00:00:00`);
    const diff = Math.round((Date.now() - then.getTime()) / 86_400_000);
    return PURCHASE_OPTIONS.reduce((best, option) =>
      Math.abs(option.days - diff) < Math.abs(best.days - diff) ? option : best,
    ).days;
  })();

  return (
    <Screen>
      <PageHeader
        eyebrow="Step 2 of 2"
        title="Use these first"
        subtitle="Roughly when did you buy this? It helps us get the order right."
        back={`/confirm?scan=${scan.id}`}
      />

      <div className="mb-6 flex flex-wrap gap-2 rise">
        {PURCHASE_OPTIONS.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => setPurchased(option.days)}
            aria-pressed={selectedDays === option.days}
            className={`tap rounded-full border px-4 py-2.5 text-[15px] font-medium transition ${
              selectedDays === option.days
                ? "border-leaf-500 bg-leaf-50 text-leaf-700"
                : "border-hairline bg-white text-ink"
            }`}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPurchased(null)}
          aria-pressed={selectedDays === null}
          className={`tap rounded-full border px-4 py-2.5 text-[15px] font-medium transition ${
            selectedDays === null
              ? "border-leaf-500 bg-leaf-50 text-leaf-700"
              : "border-hairline bg-white text-ink"
          }`}
        >
          Not sure
        </button>
      </div>

      <div className="space-y-6 rise">
        {groups.map((group) => (
          <section key={group.band}>
            <div className="mb-2.5">
              <h2 className="text-[20px] font-bold text-ink">{BAND_LABELS[group.band]}</h2>
              <p className="text-[14px] text-muted">{BAND_BLURB[group.band]}</p>
            </div>
            <ul className="space-y-2.5">
              {group.items.map((item) => (
                <Card as="li" key={item.id} className="flex items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="text-[17px] font-semibold text-ink">{item.name}</p>
                    <p className="text-[15px] text-muted">{item.quantity}</p>
                  </div>
                  <BandBadge band={item.band}>
                    {scan.purchasedOn
                      ? item.daysLeft === 0
                        ? "Today"
                        : `~${item.daysLeft} day${item.daysLeft === 1 ? "" : "s"}`
                      : BAND_LABELS[item.band]}
                  </BandBadge>
                </Card>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-7 space-y-3">
        <Notice>{FRESHNESS_DISCLAIMER}</Notice>
        <Button size="lg" full onClick={() => router.push(`/meals?scan=${scan.id}`)}>
          Show me what to cook
        </Button>
      </div>
    </Screen>
  );
}
