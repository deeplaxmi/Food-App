"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app-provider";
import { TagInput } from "@/components/tag-input";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  NumberStepper,
  PageHeader,
  Screen,
  Spinner,
  TextInput,
} from "@/components/ui";
import { newId } from "@/lib/store";
import {
  HEAT_LABELS,
  HEAT_LEVELS,
  TEXTURE_OPTIONS,
  type HeatTolerance,
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

export default function HouseholdPage() {
  const { data, ready, update } = useApp();
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(timer);
  }, [saved]);

  if (!ready) return <Spinner />;
  if (!data.household) {
    return (
      <Screen>
        <PageHeader title="Household" back="/settings" />
        <EmptyState
          title="No household yet"
          body="Set one up and we can tailor what we suggest."
          action={<Button onClick={() => router.push("/onboarding")}>Set up my household</Button>}
        />
      </Screen>
    );
  }

  const household = data.household;
  const flash = () => setSaved(true);

  const patchHousehold = (patch: Partial<typeof household>) => {
    update((draft) => ({
      ...draft,
      household: draft.household ? { ...draft.household, ...patch } : draft.household,
    }));
    flash();
  };

  const prefFor = (memberId: string): Preference =>
    data.preferences.find((p) => p.memberId === memberId) ?? {
      id: newId("pref"),
      memberId,
      favoriteCuisines: [],
      heatTolerance: null,
      allergies: [],
      dietaryRestrictions: [],
      dislikes: [],
      texturePreferences: [],
    };

  const patchPreference = (memberId: string, patch: Partial<Preference>) => {
    update((draft) => {
      const exists = draft.preferences.some((p) => p.memberId === memberId);
      const base = prefFor(memberId);
      return {
        ...draft,
        preferences: exists
          ? draft.preferences.map((p) => (p.memberId === memberId ? { ...p, ...patch } : p))
          : [...draft.preferences, { ...base, ...patch }],
      };
    });
    flash();
  };

  const addMember = (isChild: boolean) => {
    const id = newId("mem");
    update((draft) => ({
      ...draft,
      members: [
        ...draft.members,
        {
          id,
          householdId: household.id,
          name: "",
          isChild,
          ageStage: isChild ? null : "adult",
          createdAt: new Date().toISOString(),
        },
      ],
      household: draft.household
        ? {
            ...draft.household,
            adults: draft.household.adults + (isChild ? 0 : 1),
            children: draft.household.children + (isChild ? 1 : 0),
          }
        : draft.household,
    }));
    flash();
  };

  const removeMember = (id: string) => {
    const member = data.members.find((m) => m.id === id);
    update((draft) => ({
      ...draft,
      members: draft.members.filter((m) => m.id !== id),
      preferences: draft.preferences.filter((p) => p.memberId !== id),
      household: draft.household
        ? {
            ...draft.household,
            adults: Math.max(0, draft.household.adults - (member && !member.isChild ? 1 : 0)),
            children: Math.max(0, draft.household.children - (member?.isChild ? 1 : 0)),
          }
        : draft.household,
    }));
    flash();
  };

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <Screen>
      <PageHeader
        title="Household profile"
        subtitle="Change anything here and the next suggestions will follow it."
        back="/settings"
      />

      {saved && (
        <p className="mb-4 rounded-2xl border border-leaf-300/40 bg-leaf-50 px-4 py-2.5 text-[15px] font-medium text-leaf-700">
          Saved
        </p>
      )}

      <div className="space-y-4 rise">
        <Card className="space-y-5">
          <Field label="Household name">
            <TextInput
              value={household.name}
              onChange={(e) => patchHousehold({ name: e.target.value })}
            />
          </Field>
          <NumberStepper
            label="Adults"
            value={household.adults}
            min={0}
            onChange={(adults) => patchHousehold({ adults })}
          />
          <NumberStepper
            label="Children"
            value={household.children}
            onChange={(children) => patchHousehold({ children })}
          />
        </Card>

        <Card>
          <Field group label="Weeknight cooking time" hint="We'll keep suggestions inside this.">
            <div className="flex flex-wrap gap-2">
              {COOK_TIMES.map((minutes) => (
                <Chip
                  key={minutes}
                  selected={household.maxWeeknightMinutes === minutes}
                  onClick={() => patchHousehold({ maxWeeknightMinutes: minutes })}
                >
                  {minutes} min
                </Chip>
              ))}
            </div>
          </Field>
        </Card>

        <Card>
          <Field group label="Pantry staples" hint="We assume you have these, so shopping lists stay short.">
            <TagInput
              values={household.pantryStaples}
              onChange={(pantryStaples) => patchHousehold({ pantryStaples })}
              placeholder="Add a staple"
              suggestions={COMMON_PANTRY}
            />
          </Field>
        </Card>

        <h2 className="pt-2 text-[20px] font-bold text-ink">Everyone at the table</h2>

        {data.members.map((member) => {
          const pref = prefFor(member.id);
          return (
            <Card key={member.id} className="space-y-5">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Field label={member.isChild ? "Child" : "Adult"}>
                    <TextInput
                      value={member.name}
                      placeholder="Name or nickname"
                      onChange={(e) => {
                        const name = e.target.value;
                        update((draft) => ({
                          ...draft,
                          members: draft.members.map((m) =>
                            m.id === member.id ? { ...m, name } : m,
                          ),
                        }));
                        flash();
                      }}
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={() => removeMember(member.id)}
                  className="tap mb-0.5 rounded-2xl border border-hairline px-4 py-3.5 text-[15px] font-semibold text-muted hover:border-tomato/40 hover:text-tomato"
                >
                  Remove
                </button>
              </div>

              <Field group label="Favourite cuisines">
                <div className="flex flex-wrap gap-2">
                  {CUISINES.map((c) => (
                    <Chip
                      key={c}
                      selected={pref.favoriteCuisines.includes(c)}
                      onClick={() =>
                        patchPreference(member.id, {
                          favoriteCuisines: toggle(pref.favoriteCuisines, c),
                        })
                      }
                    >
                      {c}
                    </Chip>
                  ))}
                </div>
              </Field>

              <Field group label="Heat tolerance">
                <div className="flex flex-wrap gap-2">
                  {HEAT_LEVELS.map((level: HeatTolerance) => (
                    <Chip
                      key={level}
                      selected={pref.heatTolerance === level}
                      onClick={() =>
                        patchPreference(member.id, {
                          heatTolerance: pref.heatTolerance === level ? null : level,
                        })
                      }
                    >
                      {HEAT_LABELS[level]}
                    </Chip>
                  ))}
                </div>
              </Field>

              <Field group label="Allergies" hint="Never included in a suggestion.">
                <TagInput
                  values={pref.allergies}
                  onChange={(allergies) => patchPreference(member.id, { allergies })}
                  placeholder="Add an allergy"
                  suggestions={COMMON_ALLERGIES}
                  tone="plain"
                />
              </Field>

              <Field group label="Dietary restrictions" hint="Also a hard rule.">
                <TagInput
                  values={pref.dietaryRestrictions}
                  onChange={(dietaryRestrictions) =>
                    patchPreference(member.id, { dietaryRestrictions })
                  }
                  placeholder="Add a restriction"
                  suggestions={COMMON_RESTRICTIONS}
                  tone="plain"
                />
              </Field>

              <Field group label="Foods they don't like">
                <TagInput
                  values={pref.dislikes}
                  onChange={(dislikes) => patchPreference(member.id, { dislikes })}
                  placeholder="Add a food"
                  suggestions={COMMON_DISLIKES}
                />
              </Field>

              <Field group label="How they like things prepared">
                <div className="flex flex-wrap gap-2">
                  {TEXTURE_OPTIONS.map((t) => (
                    <Chip
                      key={t.id}
                      selected={pref.texturePreferences.includes(t.id)}
                      onClick={() =>
                        patchPreference(member.id, {
                          texturePreferences: toggle(
                            pref.texturePreferences,
                            t.id as TexturePreference,
                          ),
                        })
                      }
                    >
                      {t.label}
                    </Chip>
                  ))}
                </div>
              </Field>
            </Card>
          );
        })}

        <div className="flex gap-2">
          <Button variant="secondary" full onClick={() => addMember(false)}>
            Add an adult
          </Button>
          <Button variant="secondary" full onClick={() => addMember(true)}>
            Add a child
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <Button size="lg" full onClick={() => router.push("/dashboard")}>
          Done
        </Button>
      </div>
    </Screen>
  );
}
