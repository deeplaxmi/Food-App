"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { RecipeCard } from "@/components/recipe-card";
import {
  BottomNav,
  Button,
  Card,
  EmptyState,
  Notice,
  PageHeader,
  Screen,
  Spinner,
} from "@/components/ui";
import { LEARNING_MESSAGE, formatList } from "@/lib/rank";
import { bandedItems, householdProfile, mealPlan, scanById } from "@/lib/selectors";
import { newId } from "@/lib/store";
import type { Recipe } from "@/lib/types";

export default function MealsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <MealsScreen />
    </Suspense>
  );
}

/**
 * An invented recipe the household deliberately asked for is a different
 * contract from one we served up as a recommendation. Say plainly that nobody
 * has cooked it, and let them decide.
 */
function AiChefOffer({
  produce,
  onAsk,
  busy,
}: {
  produce: string[];
  onAsk: () => void;
  busy: boolean;
}) {
  return (
    <Card>
      <h2 className="text-[19px] font-bold text-ink">Want our AI chef to try?</h2>
      <p className="mt-2 text-[16px] leading-snug text-muted">
        It'll invent something around your {formatList(produce.map((p) => p.toLowerCase()))} from
        scratch. Nobody has cooked it before, so read it through before you shop and trust your
        own judgement in the kitchen.
      </p>
      <p className="mt-2 text-[15px] leading-snug text-muted">
        We'll still keep it clear of anything your household is allergic to.
      </p>
      <div className="mt-4">
        <Button full onClick={onAsk} disabled={busy}>
          {busy ? "Thinking up a recipe…" : "Let the AI chef try"}
        </Button>
      </div>
    </Card>
  );
}

function MealsScreen() {
  const { data, ready, update } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const scan = scanById(data, params.get("scan"));

  const plan = useMemo(() => mealPlan(data, scan), [data, scan]);
  const [topUp, setTopUp] = useState<"idle" | "loading" | "done">("idle");
  const requested = useRef(false);

  const items = scan ? bandedItems(data, scan) : [];
  const profile = householdProfile(data);
  const shortfall = plan ? 3 - plan.suggestions.length : 0;

  // If the curated library can't fill all three slots for this produce, ask the
  // model for the remainder. Anything it returns is labelled as AI-written.
  const askTheAiChef = () => {
    if (!scan || !profile || requested.current) return;
    requested.current = true;
    setTopUp("loading");

    void (async () => {
      try {
        const response = await fetch("/api/recipes/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            produce: items.map((i) => ({ name: i.name, band: i.band })),
            mustNotContain: [...profile.allergens],
            requiredDiets: [...profile.requiredDietaryTags],
            dislikes: [...profile.dislikes.keys()],
            cuisines: [...profile.cuisineFans.keys()],
            heatTolerance: profile.heatCeiling,
            maxMinutes: profile.maxMinutes,
            pantry: [...profile.pantry],
            adults: profile.adults,
            children: profile.children,
            count: Math.max(1, shortfall),
          }),
        });
        const payload = await response.json();
        const generated: Recipe[] = (payload.recipes ?? []).map((r: Partial<Recipe>) => ({
          ...r,
          id: newId("ai"),
          source: "ai-generated" as const,
          sourceNote: "Written by AI for your produce — check quantities before you shop.",
          texturePreferences: [],
          servesAdults: r.servesAdults ?? 4,
          dietaryTags: r.dietaryTags ?? [],
          containsAllergens: r.containsAllergens ?? [],
        })) as Recipe[];

        if (generated.length) {
          update((draft) => ({ ...draft, recipes: [...draft.recipes, ...generated] }));
        }
      } catch {
        // Library results still stand; nothing to show the user.
      } finally {
        setTopUp("done");
      }
    })();
  };

  // Produce nothing we can cook uses. Naming it beats a silent short list.
  const unmatched = useMemo(() => {
    if (!plan) return [];
    const used = new Set(
      plan.suggestions.flatMap((s) => s.matchedProduce.map((m) => m.name.toLowerCase())),
    );
    return items.filter((i) => !used.has(i.name.toLowerCase())).map((i) => i.name);
  }, [plan, items]);

  if (!ready) return <Spinner />;

  if (!scan || !plan || plan.suggestions.length === 0) {
    const have = items.map((i) => i.name.toLowerCase());
    return (
      <>
        <Screen withNav>
          <PageHeader title="Tonight's options" back={scan ? `/priority?scan=${scan.id}` : undefined} />
          {have.length > 0 ? (
            <div className="space-y-4 rise">
              <EmptyState
                title="We don't have a good match for this yet"
                body={`Our recipes don't cover ${formatList(have)} properly, and we'd rather say so than invent something you haven't cooked before.`}
              />
              <Notice>
                Everything we recommend has actually been cooked and checked. That keeps the
                quality honest, but it does leave gaps — fruit especially.
              </Notice>
              <AiChefOffer produce={items.map((i) => i.name)} onAsk={askTheAiChef} busy={topUp === "loading"} />
              <Button variant="secondary" full onClick={() => router.push("/scan")}>
                Scan something else
              </Button>
            </div>
          ) : (
            <EmptyState
              title="Nothing to suggest yet"
              body="Scan some produce and we'll find meals that fit your family."
              action={<Button onClick={() => router.push("/scan")}>Scan produce</Button>}
            />
          )}
        </Screen>
        <BottomNav />
      </>
    );
  }

  const useFirstNames = items.filter((i) => i.band === "use-first").map((i) => i.name);

  return (
    <>
      <Screen withNav>
        <PageHeader
          title="Three ways to go"
          subtitle={
            useFirstNames.length
              ? `Built around the ${formatList(useFirstNames.slice(0, 3).map((n) => n.toLowerCase()))} you should cook first.`
              : "Built around what you've got in."
          }
          back={`/priority?scan=${scan.id}`}
        />

        {plan.learning && (
          <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-squash/25 bg-squash-50 px-4 py-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-squash" aria-hidden="true" />
            <p className="text-[14px] leading-snug text-[#8a5a1c]">
              <span className="font-bold">Still calibrating.</span> {LEARNING_MESSAGE}
            </p>
          </div>
        )}

        <div className="space-y-4 rise">
          {plan.suggestions.map((suggestion) => (
            <RecipeCard key={suggestion.recipe.id} suggestion={suggestion} scanId={scan.id} />
          ))}
        </div>

        {topUp === "loading" && (
          <p className="mt-5 text-center text-[15px] text-muted">Looking for one more idea…</p>
        )}

        {unmatched.length > 0 && (
          <div className="mt-5 space-y-3">
            <Notice>
              These meals don't use your {formatList(unmatched.map((n) => n.toLowerCase()))} — we
              don't have a tested recipe that does.
            </Notice>
            <AiChefOffer produce={unmatched} onAsk={askTheAiChef} busy={topUp === "loading"} />
          </div>
        )}

        {plan.suggestions.length < 3 && (
          <div className="mt-3">
            <Notice>
              Only {plan.suggestions.length === 1 ? "one match" : `${plan.suggestions.length} matches`} this
              time. We'd rather show fewer good meals than pad the list.
            </Notice>
          </div>
        )}

        <div className="mt-6">
          <Button variant="secondary" full onClick={() => router.push("/scan")}>
            Scan something else
          </Button>
        </div>
      </Screen>
      <BottomNav />
    </>
  );
}
