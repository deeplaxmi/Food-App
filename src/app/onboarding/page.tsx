"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { TagInput } from "@/components/tag-input";
import {
  Button,
  Card,
  Chip,
  Field,
  NumberStepper,
  PageHeader,
  Screen,
  Spinner,
  TextInput,
} from "@/components/ui";
import { track } from "@/lib/analytics";
import { newId } from "@/lib/store";
import {
  HEAT_LABELS,
  HEAT_LEVELS,
  TEXTURE_OPTIONS,
  type HeatTolerance,
  type HouseholdMember,
  type Preference,
  type TexturePreference,
} from "@/lib/types";
import {
  COMMON_ALLERGIES,
  COMMON_DISLIKES,
  COMMON_PANTRY,
  COMMON_RESTRICTIONS,
  COOK_TIMES,
  CUISINES,
} from "@/lib/vocab";

interface DraftMember {
  id: string;
  name: string;
  isChild: boolean;
  favoriteCuisines: string[];
  heatTolerance: HeatTolerance | null;
  allergies: string[];
  dietaryRestrictions: string[];
  dislikes: string[];
  texturePreferences: TexturePreference[];
}

function blankMember(isChild: boolean): DraftMember {
  return {
    id: newId("mem"),
    name: "",
    isChild,
    favoriteCuisines: [],
    heatTolerance: null,
    allergies: [],
    dietaryRestrictions: [],
    dislikes: [],
    texturePreferences: [],
  };
}

export default function OnboardingPage() {
  const { data, ready, update } = useApp();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [householdName, setHouseholdName] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [members, setMembers] = useState<DraftMember[]>([]);
  const [maxMinutes, setMaxMinutes] = useState(30);
  const [pantry, setPantry] = useState<string[]>(COMMON_PANTRY.slice(0, 10));

  // Keeps the roster in step with the counts without losing what's typed.
  const syncMembers = (nextAdults: number, nextChildren: number) => {
    setMembers((current) => {
      const existingAdults = current.filter((m) => !m.isChild);
      const existingChildren = current.filter((m) => m.isChild);
      const takeOrCreate = (list: DraftMember[], count: number, isChild: boolean) =>
        Array.from({ length: count }, (_, i) => list[i] ?? blankMember(isChild));
      return [
        ...takeOrCreate(existingAdults, nextAdults, false),
        ...takeOrCreate(existingChildren, nextChildren, true),
      ];
    });
  };

  const patchMember = (id: string, patch: Partial<DraftMember>) =>
    setMembers((current) => current.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const steps = useMemo(
    () => ["Household", "Who's eating", "Preferences", "Cooking time", "Pantry"],
    [],
  );

  if (!ready) return <Spinner />;

  const finish = () => {
    const householdId = data.household?.id ?? newId("hh");
    const userId = data.user?.id ?? newId("usr");
    const now = new Date().toISOString();

    const namedMembers: HouseholdMember[] = members.map((m, i) => ({
      id: m.id,
      householdId,
      name: m.name.trim() || (m.isChild ? `Child ${i + 1}` : `Adult ${i + 1}`),
      isChild: m.isChild,
      createdAt: now,
    }));

    const preferences: Preference[] = members.map((m) => ({
      id: newId("pref"),
      memberId: m.id,
      favoriteCuisines: m.favoriteCuisines,
      heatTolerance: m.heatTolerance,
      allergies: m.allergies,
      dietaryRestrictions: m.dietaryRestrictions,
      dislikes: m.dislikes,
      texturePreferences: m.texturePreferences,
    }));

    update((draft) => ({
      ...draft,
      user: draft.user ?? { id: userId, email: null, createdAt: now },
      household: {
        id: householdId,
        userId,
        name: householdName.trim() || "My household",
        adults,
        children,
        maxWeeknightMinutes: maxMinutes,
        pantryStaples: pantry,
        onboardingComplete: true,
        createdAt: now,
      },
      members: namedMembers,
      preferences,
    }));

    track("onboarding_completed", {
      adults,
      children,
      answeredPreferences: preferences.filter(
        (p) => p.favoriteCuisines.length || p.heatTolerance || p.allergies.length,
      ).length,
    });
    router.push("/scan");
  };

  const next = () => {
    if (step === 0) syncMembers(adults, children);
    if (step === steps.length - 1) finish();
    else setStep((s) => s + 1);
  };

  return (
    <Screen>
      <ProgressDots total={steps.length} current={step} />
      <PageHeader
        eyebrow={`Step ${step + 1} of ${steps.length}`}
        title={
          [
            "Tell us about your household",
            "Who's eating?",
            "What does everyone like?",
            "How long do you have on a weeknight?",
            "What's usually in the cupboard?",
          ][step]
        }
        subtitle={
          [
            "This is just so we can size recipes properly.",
            "First names or nicknames are fine.",
            "Skip anyone you're not sure about — you can add this later.",
            "We'll keep weeknight suggestions inside this.",
            "We'll assume you have these, so the shopping list stays short.",
          ][step]
        }
      />

      <div key={step} className="space-y-4 rise">
        {step === 0 && (
          <Card className="space-y-5">
            <Field label="Household name" hint="Whatever you'd call yourselves.">
              <TextInput
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="The Okonjos"
                autoComplete="off"
              />
            </Field>
            <NumberStepper label="Adults" value={adults} onChange={setAdults} min={1} />
            <NumberStepper label="Children" value={children} onChange={setChildren} />
          </Card>
        )}

        {step === 1 && (
          <>
            {members.length === 0 && (
              <Card>
                <p className="text-[16px] text-muted">
                  Go back a step and set how many people are in the household.
                </p>
              </Card>
            )}
            {members.map((m, i) => (
              <Card key={m.id}>
                <Field label={m.isChild ? `Child ${countIn(members, m)}` : `Adult ${countIn(members, m)}`}>
                  <TextInput
                    value={m.name}
                    onChange={(e) => patchMember(m.id, { name: e.target.value })}
                    placeholder={m.isChild ? "Mira" : "Sam"}
                    autoComplete="off"
                    autoFocus={i === 0}
                  />
                </Field>
              </Card>
            ))}
          </>
        )}

        {step === 2 && (
          <>
            {members.map((m) => (
              <MemberPreferences key={m.id} member={m} onPatch={(p) => patchMember(m.id, p)} />
            ))}
          </>
        )}

        {step === 3 && (
          <Card>
            <div className="flex flex-wrap gap-2.5">
              {COOK_TIMES.map((minutes) => (
                <Chip
                  key={minutes}
                  selected={maxMinutes === minutes}
                  onClick={() => setMaxMinutes(minutes)}
                >
                  {minutes} min
                </Chip>
              ))}
            </div>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <TagInput
              values={pantry}
              onChange={setPantry}
              placeholder="Add a staple"
              suggestions={COMMON_PANTRY}
            />
          </Card>
        )}
      </div>

      <div className="mt-7 space-y-3">
        <Button size="lg" full onClick={next}>
          {step === steps.length - 1 ? "Finish setup" : "Continue"}
        </Button>
        <div className="flex justify-between">
          <Button
            variant="ghost"
            onClick={() => (step === 0 ? router.push("/") : setStep((s) => s - 1))}
          >
            Back
          </Button>
          {step > 0 && (
            <Button variant="ghost" onClick={next}>
              Skip this
            </Button>
          )}
        </div>
      </div>
    </Screen>
  );
}

function countIn(members: DraftMember[], member: DraftMember): number {
  return members.filter((m) => m.isChild === member.isChild).indexOf(member) + 1;
}

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="mb-5 flex gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            i <= current ? "bg-leaf-500" : "bg-hairline"
          }`}
        />
      ))}
    </div>
  );
}

export function MemberPreferences({
  member,
  onPatch,
}: {
  member: DraftMember;
  onPatch: (patch: Partial<DraftMember>) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const answered =
    member.favoriteCuisines.length +
    member.allergies.length +
    member.dislikes.length +
    member.texturePreferences.length +
    (member.heatTolerance ? 1 : 0);

  return (
    <Card className="space-y-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="tap flex w-full items-center justify-between text-left"
      >
        <span>
          <span className="block text-[18px] font-bold text-ink">
            {member.name || (member.isChild ? "This child" : "This adult")}
          </span>
          <span className="text-[14px] text-muted">
            {answered === 0 ? "Nothing added yet" : `${answered} preference${answered === 1 ? "" : "s"} noted`}
          </span>
        </span>
        <span className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-hairline pt-4">
          <Field group label="Favourite cuisines">
            <div className="flex flex-wrap gap-2">
              {CUISINES.map((c) => (
                <Chip
                  key={c}
                  selected={member.favoriteCuisines.includes(c)}
                  onClick={() => onPatch({ favoriteCuisines: toggle(member.favoriteCuisines, c) })}
                >
                  {c}
                </Chip>
              ))}
            </div>
          </Field>

          <Field group label="Heat tolerance">
            <div className="flex flex-wrap gap-2">
              {HEAT_LEVELS.map((level) => (
                <Chip
                  key={level}
                  selected={member.heatTolerance === level}
                  onClick={() =>
                    onPatch({ heatTolerance: member.heatTolerance === level ? null : level })
                  }
                >
                  {HEAT_LABELS[level]}
                </Chip>
              ))}
            </div>
          </Field>

          <Field
            group
            label="Allergies"
            hint="We'll never suggest a recipe containing these."
          >
            <TagInput
              values={member.allergies}
              onChange={(allergies) => onPatch({ allergies })}
              placeholder="Add an allergy"
              suggestions={COMMON_ALLERGIES}
              tone="plain"
            />
          </Field>

          <Field group label="Dietary restrictions" hint="Also treated as a hard rule.">
            <TagInput
              values={member.dietaryRestrictions}
              onChange={(dietaryRestrictions) => onPatch({ dietaryRestrictions })}
              placeholder="Add a restriction"
              suggestions={COMMON_RESTRICTIONS}
              tone="plain"
            />
          </Field>

          <Field group label="Foods they don't like" hint="We'll steer around these where we can.">
            <TagInput
              values={member.dislikes}
              onChange={(dislikes) => onPatch({ dislikes })}
              placeholder="Add a food"
              suggestions={COMMON_DISLIKES}
            />
          </Field>

          <Field group label="How they like things prepared">
            <div className="flex flex-wrap gap-2">
              {TEXTURE_OPTIONS.map((t) => (
                <Chip
                  key={t.id}
                  selected={member.texturePreferences.includes(t.id)}
                  onClick={() =>
                    onPatch({ texturePreferences: toggle(member.texturePreferences, t.id) })
                  }
                >
                  {t.label}
                </Chip>
              ))}
            </div>
          </Field>
        </div>
      )}
    </Card>
  );
}
