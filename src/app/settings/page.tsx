"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/app-provider";
import {
  BottomNav,
  Button,
  ButtonLink,
  Card,
  PageHeader,
  Pill,
  Screen,
  Spinner,
} from "@/components/ui";

export default function SettingsPage() {
  const { data, ready, reset, seedDemo, mode } = useApp();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!ready) return <Spinner />;

  const onReset = async () => {
    setBusy(true);
    await reset();
    setBusy(false);
    setConfirming(false);
    router.push("/");
  };

  const onDemo = async () => {
    setBusy(true);
    await seedDemo();
    setBusy(false);
    router.push("/dashboard");
  };

  return (
    <>
      <Screen withNav>
        <PageHeader title="Settings" subtitle={data.household?.name ?? "No household yet"} />

        <div className="space-y-4 rise">
          <Card>
            <h2 className="text-[19px] font-bold text-ink">Household</h2>
            <p className="mt-1 text-[16px] leading-snug text-muted">
              {data.members.length
                ? `${data.members.map((m) => m.name || "Someone").join(", ")}.`
                : "No one added yet."}
            </p>
            <div className="mt-4">
              <ButtonLink href="/household" variant="secondary" full>
                Edit household and preferences
              </ButtonLink>
            </div>
          </Card>

          <Card>
            <h2 className="text-[19px] font-bold text-ink">Your data</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pill tone={mode === "supabase" ? "leaf" : "plain"}>
                {mode === "supabase" ? "Synced to your account" : "Stored on this device"}
              </Pill>
            </div>
            <p className="mt-3 text-[15px] leading-snug text-muted">
              {mode === "supabase"
                ? "Your household, scans and feedback are saved to your account."
                : "Everything stays in this browser. Add Supabase credentials to sync across devices."}
            </p>
          </Card>

          <Card>
            <h2 className="text-[19px] font-bold text-ink">Try the sample household</h2>
            <p className="mt-1 text-[16px] leading-snug text-muted">
              Loads a family of four with a sample produce scan. This replaces what's here now.
            </p>
            <div className="mt-4">
              <Button variant="secondary" full onClick={onDemo} disabled={busy}>
                Load sample data
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="text-[19px] font-bold text-ink">Start over</h2>
            <p className="mt-1 text-[16px] leading-snug text-muted">
              Clears your household, scans and feedback. This can't be undone.
            </p>
            <div className="mt-4">
              {confirming ? (
                <div className="flex gap-2">
                  <Button variant="danger" full onClick={onReset} disabled={busy}>
                    Yes, clear everything
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button variant="danger" full onClick={() => setConfirming(true)}>
                  Clear all my data
                </Button>
              )}
            </div>
          </Card>

          <p className="px-1 pb-2 text-center text-[13px] leading-snug text-muted">
            UseFirst gives general guidance about typical storage life. It cannot tell whether food
            is safe to eat — always check it yourself.
          </p>
        </div>
      </Screen>
      <BottomNav />
    </>
  );
}
