"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useApp } from "@/components/app-provider";
import { TagInput } from "@/components/tag-input";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  PageHeader,
  Screen,
  Spinner,
  TextInput,
} from "@/components/ui";
import { track } from "@/lib/analytics";
import { bandedItems, estimateSaved, getRecipeFrom, scanById } from "@/lib/selectors";
import { newId } from "@/lib/store";
import { REJECTION_REASONS, type MealFeedback, type RejectionReason } from "@/lib/types";

export default function FeedbackPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <FeedbackScreen />
    </Suspense>
  );
}

function FeedbackScreen() {
  const { data, ready, update } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const routeParams = useParams<{ id: string }>();

  const kind = params.get("kind") === "cooked" ? "cooked" : "rejected";
  const recipe = getRecipeFrom(data, routeParams.id);
  const scan = scanById(data, params.get("scan"));

  const [reason, setReason] = useState<RejectionReason | null>(null);
  const [note, setNote] = useState("");
  const [ate, setAte] = useState<string[]>([]);
  const [rating, setRating] = useState<number | null>(null);
  const [spice, setSpice] = useState<MealFeedback["spiceLevelRight"]>(null);
  const [again, setAgain] = useState<boolean | null>(null);
  const [leftovers, setLeftovers] = useState<boolean | null>(null);
  const [remaining, setRemaining] = useState<string[]>([]);

  if (!ready) return <Spinner />;
  if (!recipe) {
    return (
      <Screen>
        <PageHeader title="Recipe not found" back="/dashboard" />
        <EmptyState
          title="We can't find that one"
          body="Head back to your kitchen and pick again."
          action={<Button onClick={() => router.push("/dashboard")}>My kitchen</Button>}
        />
      </Screen>
    );
  }

  const produceNames = scan ? bandedItems(data, scan).map((i) => i.name) : [];
  const usedNames = recipe.produceUsed
    .map((p) => p.name)
    .filter((name) =>
      produceNames.some((available) => available.toLowerCase().includes(name.toLowerCase())),
    );

  const submit = () => {
    const feedbackId = newId("fb");
    const now = new Date().toISOString();
    const householdId = data.household?.id ?? "household";

    const entry: MealFeedback = {
      id: feedbackId,
      householdId,
      recipeId: recipe.id,
      recommendationId: null,
      kind,
      rejectionReason: kind === "rejected" ? reason : null,
      rejectionNote: kind === "rejected" && note.trim() ? note.trim() : null,
      ateIt: kind === "cooked" ? ate : [],
      rating: kind === "cooked" ? rating : null,
      spiceLevelRight: kind === "cooked" ? spice : null,
      wouldMakeAgain: kind === "cooked" ? again : null,
      hadLeftovers: kind === "cooked" ? leftovers : null,
      createdAt: now,
    };

    update((draft) => {
      // Produce the household says is gone comes off the counter.
      const stillHave = new Set(remaining.map((r) => r.toLowerCase()));
      const consumed =
        kind === "cooked"
          ? draft.detected.filter(
              (d) =>
                scan &&
                d.scanId === scan.id &&
                !d.removed &&
                usedNames.some((u) => d.name.toLowerCase().includes(u.toLowerCase())) &&
                !stillHave.has(d.name.toLowerCase()),
            )
          : [];
      const consumedIds = new Set(consumed.map((c) => c.id));
      const saved = estimateSaved(consumed.map((c) => c.name));

      return {
        ...draft,
        feedback: [...draft.feedback, entry],
        detected: draft.detected.map((d) =>
          consumedIds.has(d.id) ? { ...d, removed: true } : d,
        ),
        remaining: [
          ...draft.remaining,
          ...remaining.map((name) => ({
            id: newId("rem"),
            householdId,
            feedbackId,
            name,
            createdAt: now,
          })),
        ],
        saved:
          kind === "cooked" && consumed.length > 0
            ? [
                ...draft.saved,
                {
                  id: newId("sav"),
                  householdId,
                  feedbackId,
                  ingredientNames: consumed.map((c) => c.name),
                  estimatedGrams: saved.grams,
                  estimatedValueUsd: saved.usd,
                  createdAt: now,
                },
              ]
            : draft.saved,
      };
    });

    if (kind === "cooked") track("recipe_cooked", { recipeId: recipe.id, rating });
    track("feedback_submitted", { kind, reason });
    router.push("/dashboard");
  };

  const canSubmit = kind === "rejected" ? reason !== null : rating !== null;

  return (
    <Screen>
      <PageHeader
        title={kind === "rejected" ? "What put you off?" : "How did it go?"}
        subtitle={
          kind === "rejected"
            ? `We won't suggest ${recipe.title} again, and we'll use this to pick better next time.`
            : "A few quick questions so the next suggestions land better."
        }
        back={scan ? `/meals?scan=${scan.id}` : "/dashboard"}
      />

      <div className="space-y-4 rise">
        {kind === "rejected" ? (
          <>
            <Card>
              <div className="flex flex-wrap gap-2">
                {REJECTION_REASONS.map((r) => (
                  <Chip key={r.id} selected={reason === r.id} onClick={() => setReason(r.id)}>
                    {r.label}
                  </Chip>
                ))}
              </div>
            </Card>
            {reason === "other" && (
              <Card>
                <Field label="Tell us more">
                  <TextInput
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What was it?"
                    autoFocus
                  />
                </Field>
              </Card>
            )}
          </>
        ) : (
          <>
            <Card>
              <Field group label="Who ate it?">
                <div className="flex flex-wrap gap-2">
                  {data.members.map((m) => (
                    <Chip
                      key={m.id}
                      selected={ate.includes(m.name)}
                      onClick={() =>
                        setAte((current) =>
                          current.includes(m.name)
                            ? current.filter((n) => n !== m.name)
                            : [...current, m.name],
                        )
                      }
                    >
                      {m.name}
                    </Chip>
                  ))}
                  {data.members.length === 0 && (
                    <p className="text-[15px] text-muted">No one added to the household yet.</p>
                  )}
                </div>
              </Field>
            </Card>

            <Card>
              <Field group label="How was it overall?">
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      aria-label={`${n} out of 5`}
                      aria-pressed={rating === n}
                      className={`tap h-14 flex-1 rounded-2xl border text-[18px] font-bold transition ${
                        rating !== null && n <= rating
                          ? "border-leaf-500 bg-leaf-50 text-leaf-700"
                          : "border-hairline bg-white text-muted"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </Field>
            </Card>

            <Card>
              <Field group label="Was the spice level right?">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["too-mild", "Too mild"],
                      ["just-right", "Just right"],
                      ["too-spicy", "Too spicy"],
                    ] as const
                  ).map(([value, label]) => (
                    <Chip key={value} selected={spice === value} onClick={() => setSpice(value)}>
                      {label}
                    </Chip>
                  ))}
                </div>
              </Field>
            </Card>

            <Card className="space-y-5">
              <Field group label="Would you make it again?">
                <YesNo value={again} onChange={setAgain} />
              </Field>
              <Field group label="Were there leftovers?">
                <YesNo value={leftovers} onChange={setLeftovers} />
              </Field>
            </Card>

            {usedNames.length > 0 && (
              <Card>
                <Field
                  group
                  label="Anything left over?"
                  hint="Add anything you still have. Everything else we'll mark as used."
                >
                  <TagInput
                    values={remaining}
                    onChange={setRemaining}
                    placeholder="Add an ingredient"
                    suggestions={usedNames.map(
                      (n) => n.charAt(0).toUpperCase() + n.slice(1),
                    )}
                  />
                </Field>
              </Card>
            )}
          </>
        )}
      </div>

      <div className="mt-6 space-y-3">
        <Button size="lg" full onClick={submit} disabled={!canSubmit}>
          {canSubmit ? "Save" : kind === "rejected" ? "Pick a reason" : "Give it a rating"}
        </Button>
        <Button variant="ghost" full onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </Screen>
  );
}

function YesNo({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-2">
      <Chip selected={value === true} onClick={() => onChange(true)}>
        Yes
      </Chip>
      <Chip selected={value === false} onClick={() => onChange(false)}>
        No
      </Chip>
    </div>
  );
}
