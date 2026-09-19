"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useApp } from "@/components/app-provider";
import {
  BandBadge,
  BottomNav,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Notice,
  PageHeader,
  Screen,
  Spinner,
} from "@/components/ui";
import { BAND_LABELS, FRESHNESS_DISCLAIMER } from "@/lib/freshness";
import { bandedItems, impactStats, latestScan, mealPlan } from "@/lib/selectors";

export default function DashboardPage() {
  const { data, ready } = useApp();
  const router = useRouter();

  const scan = latestScan(data);
  const items = useMemo(() => (scan ? bandedItems(data, scan) : []), [data, scan]);
  const plan = useMemo(() => mealPlan(data, scan), [data, scan]);
  const stats = useMemo(() => impactStats(data), [data]);

  if (!ready) return <Spinner />;

  if (!data.household) {
    return (
      <>
        <Screen withNav>
          <PageHeader title="Welcome" />
          <EmptyState
            title="Let's get you set up"
            body="Two minutes of setup and we can start suggesting meals that fit your household."
            action={<Button onClick={() => router.push("/onboarding")}>Set up my household</Button>}
          />
        </Screen>
        <BottomNav />
      </>
    );
  }

  const useFirst = items.filter((i) => i.band === "use-first");
  const nextUp = plan?.suggestions[0];

  return (
    <>
      <Screen withNav>
        <PageHeader
          eyebrow={data.household.name}
          title="Your kitchen"
          subtitle={
            items.length
              ? `${items.length} thing${items.length === 1 ? "" : "s"} at home right now.`
              : "Nothing on the counter yet."
          }
        />

        <div className="space-y-4 rise">
          {items.length === 0 ? (
            <EmptyState
              title="Nothing scanned yet"
              body="Take a photo of what's in the fridge and we'll suggest three meals."
              action={<ButtonLink href="/scan">Scan my produce</ButtonLink>}
            />
          ) : (
            <>
              <Card>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="text-[19px] font-bold text-ink">Use next</h2>
                  {scan && (
                    <Link
                      href={`/priority?scan=${scan.id}`}
                      className="tap text-[15px] font-semibold text-leaf-600"
                    >
                      See all
                    </Link>
                  )}
                </div>
                {useFirst.length === 0 ? (
                  <p className="text-[16px] text-muted">
                    Nothing urgent — everything you have keeps for a while yet.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {useFirst.slice(0, 4).map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[17px] font-semibold text-ink">{item.name}</p>
                          <p className="text-[15px] text-muted">{item.quantity}</p>
                        </div>
                        <BandBadge band={item.band}>{BAND_LABELS[item.band]}</BandBadge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {nextUp && scan && (
                <Card>
                  <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Tonight, maybe
                  </p>
                  <h2 className="mt-1.5 text-[21px] font-bold leading-tight text-ink">
                    {nextUp.recipe.title}
                  </h2>
                  <p className="mt-2 text-[16px] leading-snug text-muted">{nextUp.why}</p>
                  <div className="mt-4 flex gap-2">
                    <ButtonLink href={`/meals?scan=${scan.id}`} full>
                      See all three
                    </ButtonLink>
                  </div>
                </Card>
              )}
            </>
          )}

          <section>
            <h2 className="mb-2.5 text-[19px] font-bold text-ink">Since you started</h2>
            <div className="grid grid-cols-2 gap-3">
              {/* The first two are counts of things that actually happened. */}
              <Stat value={String(stats.mealsCooked)} label="Dinners cooked at home" tone="leaf" />
              <Stat value={String(stats.ingredientsUsed)} label="Ingredients used up" tone="leaf" />
              {/* These two are estimates, and the labels say what we can defend:
                  produce that got eaten rather than binned -- not money conjured. */}
              <Stat
                value={stats.gramsRescued >= 1000
                  ? `${(stats.gramsRescued / 1000).toFixed(1)} kg`
                  : `${stats.gramsRescued} g`}
                label="Produce used in time"
              />
              <Stat value={`$${stats.dollarsSaved.toFixed(2)}`} label="Worth of produce, not binned" />
            </div>
            <p className="mt-2.5 text-[13px] leading-snug text-muted">
              The first two are counts of what you actually did. The bottom two are conservative
              estimates: the quantities you told us you used, priced at the low end of ordinary
              shop prices. We round down, so the real figure is likely a little higher.
            </p>
          </section>

          <Notice>{FRESHNESS_DISCLAIMER}</Notice>
        </div>
      </Screen>
      <BottomNav />
    </>
  );
}

function Stat({
  value,
  label,
  tone = "plain",
}: {
  value: string;
  label: string;
  tone?: "plain" | "leaf";
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        tone === "leaf" ? "border-leaf-300/40 bg-leaf-50" : "border-hairline bg-white"
      }`}
    >
      <p className={`text-[26px] font-bold tabular-nums ${tone === "leaf" ? "text-leaf-700" : "text-ink"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[14px] leading-snug text-muted">{label}</p>
    </div>
  );
}
