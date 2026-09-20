"use client";

import Link from "next/link";
import { formatList, type Suggestion } from "@/lib/rank";
import { BandBadge, Card, Pill } from "./ui";

const SLOT_TONE: Record<string, string> = {
  "best-match": "bg-leaf-500",
  fastest: "bg-squash",
  "saves-most": "bg-tomato",
};

/** A warm, produce-toned header used when a recipe has no photograph. */
function CardArt({ title, slot }: { title: string; slot: string }) {
  const palettes: Record<string, [string, string]> = {
    "best-match": ["#d7ecda", "#8cc79a"],
    fastest: ["#fdf2e5", "#e8b06a"],
    "saves-most": ["#fcefec", "#e39181"],
  };
  const [from, to] = palettes[slot] ?? palettes["best-match"];
  return (
    <div
      className="flex h-24 items-end rounded-t-[1.5rem] px-5 pb-3"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      aria-hidden="true"
    >
      <span className="text-[15px] font-semibold text-ink/70">{title}</span>
    </div>
  );
}

export function RecipeCard({ suggestion, scanId }: { suggestion: Suggestion; scanId: string }) {
  const { recipe, slot, slotLabel, why, matchedProduce, missingPurchases, unverified, dislikedMain } =
    suggestion;
  const useFirst = matchedProduce.filter((m) => m.band === "use-first");

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-2 px-5 pt-5">
        <span className={`h-2.5 w-2.5 rounded-full ${SLOT_TONE[slot]}`} aria-hidden="true" />
        <span className="text-[13px] font-bold uppercase tracking-wide text-muted">{slotLabel}</span>
      </div>

      <div className="px-5 pb-5 pt-2.5">
        <h2 className="text-[22px] font-bold leading-tight text-ink">{recipe.title}</h2>

        <div className="mt-3 flex flex-wrap gap-2">
          <Pill>{recipe.totalMinutes} min</Pill>
          <Pill>{recipe.difficulty === "easy" ? "Easy" : "A bit of work"}</Pill>
          <Pill>{recipe.cuisine}</Pill>
          {recipe.source === "ai-generated" && <Pill tone="ai">Written by AI</Pill>}
        </div>

        <p className="mt-4 text-[16px] leading-snug text-ink">{why}</p>

        {/* If we're offering a meal built on something someone here won't eat, it
            has to say so on the card. "Why this works for your family" sitting
            above an unmentioned dislike is the fastest way to lose their trust. */}
        {dislikedMain.map((d) => (
          <p
            key={d.ingredient}
            className="mt-3 rounded-2xl border border-hairline bg-shell px-4 py-3 text-[14px] leading-snug text-ink"
          >
            <strong className="font-bold">{formatList(d.who)} doesn&apos;t eat {d.ingredient}</strong>
            , and it&apos;s a main ingredient here. Nothing else tonight used up as much of your
            produce, so it&apos;s still worth a look.
          </p>
        ))}

        <div className="mt-4 space-y-2">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">Uses</p>
          <ul className="flex flex-wrap gap-2">
            {matchedProduce.map((m) => (
              <li key={m.name}>
                {m.band === "use-first" ? (
                  <BandBadge band="use-first">{m.name}</BandBadge>
                ) : (
                  <Pill tone="leaf">{m.name}</Pill>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[14px] text-muted">
            {missingPurchases.length === 0
              ? "Nothing extra to buy."
              : `Still need: ${missingPurchases.join(", ")}.`}
          </p>
        </div>

        {unverified.length > 0 && (
          <p className="mt-4 rounded-2xl border border-squash/40 bg-squash-50 px-4 py-3 text-[14px] leading-snug text-[#8a5a1c]">
            <strong className="font-bold">We couldn't check {formatList(unverified)}</strong> against
            your allergies. Read the label before you cook this.
          </p>
        )}

        {useFirst.length > 0 && (
          <p className="mt-3 text-[14px] text-tomato">
            Clears {useFirst.length} item{useFirst.length === 1 ? "" : "s"} from your use-first list.
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <Link
            href={`/recipe/${recipe.id}?scan=${scanId}&slot=${slot}`}
            className="tap flex-1 rounded-full bg-leaf-500 px-5 py-3.5 text-center text-[16px] font-semibold text-white active:scale-[0.98]"
          >
            Make this
          </Link>
          <Link
            href={`/feedback/${recipe.id}?scan=${scanId}&kind=rejected&slot=${slot}`}
            className="tap rounded-full border border-hairline bg-white px-5 py-3.5 text-[16px] font-semibold text-muted active:scale-[0.98]"
          >
            Not for us
          </Link>
        </div>
      </div>
    </Card>
  );
}

export { CardArt };
