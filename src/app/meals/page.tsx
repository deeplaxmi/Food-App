"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { RecipeCard } from "@/components/recipe-card";
import {
  BottomNav,
  Button,
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
  useEffect(() => {
    if (!scan || !profile || shortfall <= 0 || requested.current) return;
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
            count: shortfall,
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
  }, [scan, profile, shortfall, items, update]);

  if (!ready) return <Spinner />;

  if (!scan || !plan || plan.suggestions.length === 0) {
    return (
      <>
        <Screen withNav>
          <PageHeader title="Tonight's options" />
          <EmptyState
            title={topUp === "loading" ? "Working on it…" : "Nothing to suggest yet"}
            body={
              topUp === "loading"
                ? "Putting together some ideas for what you have."
                : "Scan some produce and we'll find three meals that fit your family."
            }
            action={
              topUp === "loading" ? undefined : (
                <Button onClick={() => router.push("/scan")}>Scan produce</Button>
              )
            }
          />
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
          <div className="mb-4">
            <Notice tone="warn">{LEARNING_MESSAGE}</Notice>
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
