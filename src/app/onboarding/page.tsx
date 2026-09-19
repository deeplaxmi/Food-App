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
  AGE_STAGES,
  HEAT_LABELS,
  HEAT_LEVELS,
  TEXTURE_OPTIONS,
  type AgeStage,
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
  ageStage: AgeStage | null;
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
    ageStage: isChild ? null : "adult",
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
  // Absence of allergies has to be stated, not assumed from an empty form.
  const [noAllergies, setNoAllergies] = useState(false);

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
    () => ["Household", "Who's eating", "Allergies", "Preferences", "Cooking time", "Pantry"],
    [],
  );

  const anyAllergies = members.some(
    (m) => m.allergies.length > 0 || m.dietaryRestrictions.length > 0,
  );
  // The one question that can't be left implicitly blank.
  const allergyStepAnswered = anyAllergies || noAllergies;

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
      ageStage: m.ageStage,
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
        allergiesConfirmedNone: noAllergies,
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
            "Does anyone have a food allergy?",
            "What does everyone like?",
            "How long do you have on a weeknight?",
            "What's usually in the cupboard?",
          ][step]
        }
        subtitle={
          [
            "This is just so we can size recipes properly.",
            "First names or nicknames are fine. Ages help us size portions and suggest something a small child will actually eat.",
            "This is the one thing we never guess at. We'll never suggest a recipe containing these.",
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
              <Card key={m.id} className="space-y-4">
                <Field label={m.isChild ? `Child ${countIn(members, m)}` : `Adult ${countIn(members, m)}`}>
                  <TextInput
                    value={m.name}
                    onChange={(e) => patchMember(m.id, { name: e.target.value })}
                    placeholder={m.isChild ? "Mira" : "Sam"}
                    autoComplete="off"
                    autoFocus={i === 0}
                  />
                </Field>
                <Field
                  group
                  label="How old?"
                  hint={
                    i === 0
                      ? "We use this for portions and for suggesting plainer options — we don't give advice on feeding children."
                      : undefined
                  }
                >
                  <div className="flex flex-wrap gap-2">
                    {AGE_STAGES.map((stage) => (
                      <Chip
                        key={stage.id}
                        selected={m.ageStage === stage.id}
                        onClick={() =>
                          patchMember(m.id, { ageStage: m.ageStage === stage.id ? null : stage.id })
                        }
                      >
                        {stage.label} <span className="opacity-60">{stage.hint}</span>
                      </Chip>
                    ))}
                  </div>
                </Field>
              </Card>
            ))}
          </>
        )}

        {step === 2 && (
          <>
            {members.map((m) => (
              <Card key={m.id} className="space-y-5">
                <p className="text-[18px] font-bold text-ink">
                  {m.name.trim() || (m.isChild ? "This child" : "This adult")}
                </p>
                <Field group label="Allergies">
                  <TagInput
                    values={m.allergies}
                    onChange={(allergies) => {
                      patchMember(m.id, { allergies });
                      if (allergies.length) setNoAllergies(false);
                    }}
                    placeholder="Add an allergy"
                    suggestions={COMMON_ALLERGIES}
                    tone="plain"
                  />
                </Field>
                <Field group label="Dietary restrictions" hint="Medical or religious — also never crossed.">
                  <TagInput
                    values={m.dietaryRestrictions}
                    onChange={(dietaryRestrictions) =>
                      patchMember(m.id, { dietaryRestrictions })
                    }
                    placeholder="Add a restriction"
                    suggestions={COMMON_RESTRICTIONS}
                    tone="plain"
                  />
                </Field>
              </Card>
            ))}

            <Card>
              <button
                type="button"
                onClick={() => setNoAllergies((v) => !v)}
                disabled={anyAllergies}
                className="tap flex w-full items-start gap-3 text-left disabled:opacity-40"
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                    noAllergies ? "border-leaf-500 bg-leaf-500 text-white" : "border-hairline"
                  }`}
                  aria-hidden="true"
                >
                  {noAllergies && "\u2713"}
                </span>
                <span className="text-[16px] leading-snug text-ink">
                  Nobody in this household has a food allergy or dietary restriction.
                </span>
              </button>
              <p className="mt-3 text-[14px] leading-snug text-muted">
                We ask outright because we treat allergies as an absolute rule, never a
                preference. You can change this any time in Settings.
              </p>
            </Card>
          </>
        )}

        {step === 3 && (
          <>
            {members.map((m) => (
              <MemberPreferences key={m.id} member={m} onPatch={(p) => patchMember(m.id, p)} />
            ))}
          </>
        )}

        {step === 4 && (
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

        {step === 5 && (
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
        <Button
          size="lg"
          full
          onClick={next}
          disabled={step === 2 && !allergyStepAnswered}
        >
          {step === 2 && !allergyStepAnswered
            ? "Add allergies, or confirm there are none"
            : step === steps.length - 1
              ? "Finish setup"
              : "Continue"}
        </Button>
        <div className="flex justify-between">
          <Button
            variant="ghost"
            onClick={() => (step === 0 ? router.push("/") : setStep((s) => s - 1))}
          >
            Back
          </Button>
          {/* Every question is skippable except the allergy one. */}
          {step > 0 && step !== 2 && (
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
