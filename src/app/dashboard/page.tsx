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
import { formatWeight } from "@/lib/prices";
import { BAND_LABELS, FRESHNESS_DISCLAIMER } from "@/lib/freshness";
import {
  MEALS_FOR_STRONG_SIGNAL,
  bandedItems,
  impactStats,
  latestScan,
  learningProgress,
  mealPlan,
} from "@/lib/selectors";

export default function DashboardPage() {
  const { data, ready } = useApp();
  const router = useRouter();

  const scan = latestScan(data);
  const items = useMemo(() => (scan ? bandedItems(data, scan) : []), [data, scan]);
  const plan = useMemo(() => mealPlan(data, scan), [data, scan]);
  const stats = useMemo(() => impactStats(data), [data]);
  const learning = useMemo(() => learningProgress(data), [data]);

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

          <LearningCard progress={learning} />

          <section>
            <h2 className="mb-2.5 text-[19px] font-bold text-ink">Since you started</h2>
            <div className="grid grid-cols-2 gap-3">
              {/* The first two are counts of things that actually happened. */}
              <Stat value={String(stats.mealsCooked)} label="Dinners cooked at home" tone="leaf" />
              <Stat value={String(stats.ingredientsUsed)} label="Ingredients used up" tone="leaf" />
              {/* These two are estimates, and the labels say what we can defend:
                  produce that got eaten rather than binned -- not money conjured. */}
              <Stat value={formatWeight(stats.gramsRescued)} label="Produce used in time" />
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

/**
 * How well the app knows this household, and what would sharpen it.
 *
 * Modelled on a calibration countdown rather than a score: discrete segments
 * for meals rated, and a concrete number of meals left. "Rate 3 more meals"
 * is something a family can act on; "62%" isn't.
 */
function LearningCard({ progress }: { progress: ReturnType<typeof learningProgress> }) {
  const done = progress.stage === "knows-you";
  const remaining = Math.max(0, MEALS_FOR_STRONG_SIGNAL - progress.mealsRated);

  return (
    <Card>
      <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">
        {done ? "Calibrated" : "Still calibrating"}
      </p>
      <h2 className="mt-1.5 text-[21px] font-bold leading-snug text-ink">
        {done
          ? "We've got a good feel for your family"
          : progress.mealsRated === 0
            ? `Rate ${MEALS_FOR_STRONG_SIGNAL} meals and we'll know your taste`
            : `${remaining} more meal${remaining === 1 ? "" : "s"} to calibrate`}
      </h2>
      <p className="mt-2 text-[15px] leading-snug text-muted">
        {done
          ? "Suggestions are now shaped by what you've actually cooked and turned down."
          : "Until then we're going on preferences alone, so expect a few misses."}
      </p>

      <div
        className="mt-4 flex gap-1.5"
        role="progressbar"
        aria-valuenow={progress.mealsRated}
        aria-valuemin={0}
        aria-valuemax={MEALS_FOR_STRONG_SIGNAL}
        aria-label={`${progress.mealsRated} of ${MEALS_FOR_STRONG_SIGNAL} meals rated`}
      >
        {Array.from({ length: MEALS_FOR_STRONG_SIGNAL }, (_, i) => (
          <span
            key={i}
            className={`h-2.5 flex-1 rounded-full transition-colors duration-500 ${
              i < progress.mealsRated ? "bg-leaf-500" : "bg-hairline"
            }`}
          />
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="sr-only">Meals rated</dt>
          <dd className="text-[20px] font-bold tabular-nums text-ink">
            {progress.mealsRated}
            <span className="text-[15px] font-medium text-muted">/{MEALS_FOR_STRONG_SIGNAL}</span>
          </dd>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">Meals rated</p>
        </div>
        <div>
          <dt className="sr-only">Meals turned down</dt>
          <dd className="text-[20px] font-bold tabular-nums text-ink">{progress.mealsTurnedDown}</dd>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">Turned down</p>
        </div>
        <div>
          <dt className="sr-only">People set up</dt>
          <dd className="text-[20px] font-bold tabular-nums text-ink">
            {progress.membersWithPreferences}
            <span className="text-[15px] font-medium text-muted">/{progress.totalMembers || 0}</span>
          </dd>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">People set up</p>
        </div>
      </dl>

      {progress.nextStep && (
        <p className="mt-4 rounded-2xl bg-leaf-50 px-4 py-3 text-[15px] leading-snug text-leaf-700">
          <span className="font-semibold">Next:</span> {progress.nextStep}
        </p>
      )}
    </Card>
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
