"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
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
} from "@/components/ui";
import { track } from "@/lib/analytics";
import { buildProfile, explain, scoreRecipe } from "@/lib/rank";
import type { RecommendationSlot } from "@/lib/types";
import { bandedItems, getRecipeFrom, scanById } from "@/lib/selectors";

export default function RecipePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <RecipeScreen />
    </Suspense>
  );
}

function RecipeScreen() {
  const { data, ready, update } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const routeParams = useParams<{ id: string }>();

  const recipeId = routeParams.id;
  const scan = scanById(data, params.get("scan"));
  const recipe = getRecipeFrom(data, recipeId);

  const slot = (params.get("slot") as RecommendationSlot) ?? "best-match";
  const scored = useMemo(() => {
    if (!recipe || !data.household || !scan) return null;
    const profile = buildProfile(data.household, data.members, data.preferences, data.feedback);
    const result = scoreRecipe(recipe, profile, bandedItems(data, scan));
    return result ? { ...result, why: explain(result, slot, profile) } : null;
  }, [recipe, data, scan, slot]);

  if (!ready) return <Spinner />;
  if (!recipe) {
    return (
      <Screen>
        <PageHeader title="Recipe not found" back="/dashboard" />
        <EmptyState
          title="We can't find that one"
          body="It may have been from an older scan."
          action={<Button onClick={() => router.push("/scan")}>Scan produce</Button>}
        />
      </Screen>
    );
  }

  const shoppingList = recipe.otherIngredients.filter(
    (o) => !o.pantry && !data.household?.pantryStaples.some((p) => p.toLowerCase() === o.name.toLowerCase()),
  );

  const cook = () => {
    // Record the selection so the dashboard and the ranker both see it.
    const recommendationId = `rec-${recipe.id}`;
    if (scan && data.household) {
      update((draft) => ({
        ...draft,
        recommendations: draft.recommendations.some((r) => r.id === recommendationId)
          ? draft.recommendations
          : [
              ...draft.recommendations,
              {
                id: recommendationId,
                scanId: scan.id,
                householdId: data.household!.id,
                recipeId: recipe.id,
                slot,
                why: scored?.why ?? "",
                preferencesConsidered: scored?.preferencesConsidered ?? [],
                producedUsedNames: scored?.matchedProduce.map((m) => m.name) ?? [],
                createdAt: new Date().toISOString(),
              },
            ],
      }));
    }
    track("recipe_selected", { recipeId: recipe.id, source: recipe.source });
    router.push(`/feedback/${recipe.id}?kind=cooked&scan=${scan?.id ?? ""}`);
  };

  return (
    <Screen>
      <PageHeader
        title={recipe.title}
        back={scan ? `/meals?scan=${scan.id}` : "/dashboard"}
      />

      <div className="space-y-4 rise">
        <div className="flex flex-wrap gap-2">
          <Pill>{recipe.totalMinutes} min</Pill>
          <Pill>{recipe.difficulty === "easy" ? "Easy" : "A bit of work"}</Pill>
          <Pill>{recipe.cuisine}</Pill>
          <Pill>Serves {recipe.servesAdults}</Pill>
          {recipe.source === "ai-generated" && <Pill tone="ai">Written by AI</Pill>}
        </div>

        {scored && scored.unverified.length > 0 && (
          <div className="rounded-3xl border-2 border-squash bg-squash-50 p-5">
            <h2 className="text-[19px] font-bold text-[#8a5a1c]">Check these yourself</h2>
            <p className="mt-2 text-[16px] leading-snug text-[#8a5a1c]">
              We know your household's allergies, but we can't tell what's inside these
              ingredients. Brands differ, so read the label before you cook:
            </p>
            <ul className="mt-3 space-y-1.5">
              {scored.unverified.map((name) => (
                <li key={name} className="text-[16px] font-semibold text-[#8a5a1c]">
                  • {name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {recipe.source === "ai-generated" && (
          <Notice tone="warn">
            This recipe was written by AI for the produce you have. Read it through before you
            shop, and use your own judgement in the kitchen.
          </Notice>
        )}

        {scored && (
          <Card>
            <h2 className="text-[19px] font-bold text-ink">Why this works for your family</h2>
            <p className="mt-2 text-[16px] leading-snug text-ink">{scored.why}</p>

            {scored.preferencesConsidered.length > 0 && (
              <>
                <p className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-muted">
                  What we took into account
                </p>
                <ul className="mt-2 space-y-1.5">
                  {scored.preferencesConsidered.map((p) => (
                    <li key={p} className="flex gap-2 text-[15px] leading-snug text-ink">
                      <span className="text-leaf-500" aria-hidden="true">
                        ✓
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {scored.warnings.length > 0 && (
              <>
                <p className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-muted">
                  Worth knowing
                </p>
                <ul className="mt-2 space-y-1.5">
                  {scored.warnings.map((w) => (
                    <li key={w} className="flex gap-2 text-[15px] leading-snug text-squash">
                      <span aria-hidden="true">!</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        )}

        <Card>
          <h2 className="text-[19px] font-bold text-ink">Produce you're using</h2>
          <ul className="mt-3 space-y-2">
            {recipe.produceUsed.map((p) => (
              <li
                key={p.name}
                className="flex flex-wrap items-baseline justify-between gap-x-4 text-[16px]"
              >
                <span className="capitalize text-ink">{p.name}</span>
                <span className="ml-auto text-right text-muted">{p.amount}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="text-[19px] font-bold text-ink">Everything else</h2>
          {shoppingList.length > 0 && (
            <p className="mt-1 text-[15px] text-muted">
              You may need to pick up: {shoppingList.map((s) => s.name).join(", ")}.
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {recipe.otherIngredients.map((o) => (
              <li
                key={o.name}
                className="flex flex-wrap items-baseline justify-between gap-x-4 text-[16px]"
              >
                <span className="text-ink">
                  {o.name}
                  {o.pantry && <span className="ml-2 text-[13px] text-muted">pantry</span>}
                </span>
                <span className="ml-auto text-right text-muted">{o.amount}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="text-[19px] font-bold text-ink">Method</h2>
          <ol className="mt-3 space-y-4">
            {recipe.steps.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-leaf-50 text-[14px] font-bold text-leaf-600">
                  {i + 1}
                </span>
                <span className="text-[16px] leading-snug text-ink">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[13px] text-muted">{recipe.sourceNote}</p>
        </Card>
      </div>

      <div className="mt-6 space-y-3">
        <Button size="lg" full onClick={cook}>
          We made this
        </Button>
        <Button
          variant="secondary"
          full
          onClick={() =>
            router.push(`/feedback/${recipe.id}?kind=rejected&scan=${scan?.id ?? ""}`)
          }
        >
          Not for us
        </Button>
      </div>
    </Screen>
  );
}
