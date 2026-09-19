"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-provider";
import { Button, ButtonLink, Screen, Spinner } from "@/components/ui";

export default function WelcomePage() {
  const { data, ready, seedDemo } = useApp();
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);
  // Seeding the demo sets a completed household, which would otherwise trip the
  // redirect below and dump the user on the dashboard instead of their produce.
  const seedingDemo = useRef(false);

  // Someone who has already set up goes straight to their kitchen.
  useEffect(() => {
    if (seedingDemo.current) return;
    if (ready && data.household?.onboardingComplete) router.replace("/dashboard");
  }, [ready, data.household, router]);

  if (!ready) return <Spinner label="Just a moment" />;
  if (data.household?.onboardingComplete) return <Spinner label="Opening your kitchen" />;

  const onDemo = async () => {
    seedingDemo.current = true;
    setSeeding(true);
    await seedDemo();
    router.push("/priority");
  };

  return (
    <Screen>
      <div className="flex min-h-[85dvh] flex-col justify-between rise">
        <div className="pt-10">
          <div className="mb-8 flex justify-center">
            <ProduceMark />
          </div>
          <h1 className="text-center text-[34px] font-bold leading-[1.15] tracking-tight text-ink">
            Take a photo of
            <br />
            your produce.
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-center text-[18px] leading-snug text-muted">
            Get meal ideas your family will actually eat — before the food goes to waste.
          </p>

          <ul className="mx-auto mt-9 max-w-sm space-y-3.5">
            {[
              "Snap what's in the fridge",
              "See what needs cooking first",
              "Get three meals that fit your family",
            ].map((line, i) => (
              <li key={line} className="flex items-center gap-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-leaf-50 text-[15px] font-bold text-leaf-600">
                  {i + 1}
                </span>
                <span className="text-[17px] text-ink">{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3 pt-10">
          <ButtonLink href="/onboarding" size="lg" full>
            Set up my household
          </ButtonLink>
          <Button variant="secondary" size="lg" full onClick={onDemo} disabled={seeding}>
            {seeding ? "Loading sample…" : "Look around with sample data"}
          </Button>
          <p className="pt-1 text-center text-[13px] leading-snug text-muted">
            Setup takes about two minutes. You can skip any question and come back to it.
          </p>
        </div>
      </div>
    </Screen>
  );
}

function ProduceMark() {
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label="">
      <circle cx="66" cy="66" r="66" fill="var(--color-leaf-50)" />
      <path
        d="M66 34c-17 0-31 13-31 30 0 21 15 38 31 38s31-17 31-38c0-17-14-30-31-30z"
        fill="var(--color-leaf-500)"
      />
      <path
        d="M66 102c-16 0-31-17-31-38 0-5 1-10 3-14 6 27 15 42 28 49z"
        fill="var(--color-leaf-600)"
      />
      <path d="M66 39c2-10 9-17 19-19-1 11-8 18-19 19z" fill="var(--color-tomato)" />
      <path d="M66 38c-1-7-6-12-13-14 1 8 6 13 13 14z" fill="var(--color-squash)" />
    </svg>
  );
}
