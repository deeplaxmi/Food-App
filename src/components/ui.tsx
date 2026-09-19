"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { UrgencyBand } from "@/lib/types";

export function Screen({
  children,
  withNav = false,
}: {
  children: ReactNode;
  withNav?: boolean;
}) {
  return (
    <main className={`mx-auto w-full max-w-lg px-5 ${withNav ? "pb-28" : "pb-10"} pt-6`}>
      {children}
    </main>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  back,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  back?: string;
}) {
  return (
    <header className="mb-6 rise">
      {back && (
        <Link
          href={back}
          className="tap mb-3 -ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[15px] font-medium text-muted hover:text-ink"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </Link>
      )}
      {eyebrow && (
        <p className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-leaf-600">
          {eyebrow}
        </p>
      )}
      <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-2 text-[17px] leading-snug text-muted">{subtitle}</p>}
    </header>
  );
}

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg";
  full?: boolean;
  className?: string;
};

const BUTTON_BASE =
  "tap inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS = {
  primary: "bg-leaf-500 text-white hover:bg-leaf-600 shadow-sm",
  secondary: "bg-white text-ink border border-hairline hover:bg-leaf-50",
  ghost: "text-muted hover:text-ink",
  danger: "bg-tomato-50 text-tomato border border-tomato/25 hover:bg-tomato/10",
};

const SIZES = { md: "px-5 py-3 text-[16px]", lg: "px-6 py-4 text-[18px]" };

export function Button({
  children,
  variant = "primary",
  size = "md",
  full,
  className = "",
  ...rest
}: ButtonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${BUTTON_BASE} ${VARIANTS[variant]} ${SIZES[size]} ${full ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  href,
  variant = "primary",
  size = "md",
  full,
  className = "",
}: ButtonProps & { href: string }) {
  return (
    <Link
      href={href}
      className={`${BUTTON_BASE} ${VARIANTS[variant]} ${SIZES[size]} ${full ? "w-full" : ""} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  return <Tag className={`card p-5 ${className}`}>{children}</Tag>;
}

/**
 * `group` matters for screen readers: a <label> may only name a single control,
 * so anything wrapping a set of chips or buttons has to be a fieldset instead.
 */
export function Field({
  label,
  hint,
  children,
  group = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  group?: boolean;
}) {
  if (group) {
    return (
      <fieldset className="block min-w-0 border-0 p-0">
        <legend className="mb-1.5 text-[15px] font-semibold text-ink">{label}</legend>
        {hint && <p className="mb-2 text-[14px] leading-snug text-muted">{hint}</p>}
        {children}
      </fieldset>
    );
  }
  return (
    <label className="block">
      <span className="mb-1.5 block text-[15px] font-semibold text-ink">{label}</span>
      {hint && <span className="mb-2 block text-[14px] leading-snug text-muted">{hint}</span>}
      {children}
    </label>
  );
}

const INPUT_CLASS =
  "w-full rounded-2xl border border-hairline bg-white px-4 py-3.5 text-[16px] text-ink placeholder:text-muted/60 outline-none transition focus:border-leaf-500 focus:ring-2 focus:ring-leaf-100";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT_CLASS} ${props.className ?? ""}`} />;
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 12,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-hairline bg-white px-4 py-3">
      <span className="text-[16px] font-medium text-ink">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`One fewer ${label}`}
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="tap flex h-10 w-10 items-center justify-center rounded-full border border-hairline text-[22px] leading-none text-ink disabled:opacity-30"
        >
          −
        </button>
        <span className="w-6 text-center text-[18px] font-bold tabular-nums">{value}</span>
        <button
          type="button"
          aria-label={`One more ${label}`}
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="tap flex h-10 w-10 items-center justify-center rounded-full border border-hairline text-[22px] leading-none text-ink disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function Chip({
  children,
  selected,
  onClick,
  tone = "leaf",
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  tone?: "leaf" | "plain";
}) {
  const active =
    tone === "leaf"
      ? "border-leaf-500 bg-leaf-50 text-leaf-700"
      : "border-ink bg-ink text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`tap rounded-full border px-4 py-2.5 text-[15px] font-medium transition ${
        selected ? active : "border-hairline bg-white text-ink hover:border-leaf-300"
      }`}
    >
      {children}
    </button>
  );
}

const BAND_STYLES: Record<UrgencyBand, string> = {
  "use-first": "bg-tomato-50 text-tomato border-tomato/25",
  "use-soon": "bg-squash-50 text-squash border-squash/25",
  "can-wait": "bg-leaf-50 text-leaf-700 border-leaf-300/40",
};

export function BandBadge({ band, children }: { band: UrgencyBand; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[13px] font-semibold ${BAND_STYLES[band]}`}
    >
      {children}
    </span>
  );
}

export function Pill({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "leaf" | "ai" }) {
  const tones = {
    plain: "bg-cream text-muted border-hairline",
    leaf: "bg-leaf-50 text-leaf-700 border-leaf-300/40",
    ai: "bg-squash-50 text-squash border-squash/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warn";
}) {
  return (
    <p
      className={`rounded-2xl border px-4 py-3 text-[14px] leading-snug ${
        tone === "warn"
          ? "border-squash/25 bg-squash-50 text-[#8a5a1c]"
          : "border-hairline bg-white/70 text-muted"
      }`}
    >
      {children}
    </p>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-leaf-300 border-t-leaf-500" />
      <span className="text-[16px]">{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="text-center">
      <h2 className="text-[19px] font-bold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-xs text-[16px] leading-snug text-muted">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </Card>
  );
}

const NAV = [
  { href: "/dashboard", label: "Kitchen", icon: "home" },
  { href: "/scan", label: "Scan", icon: "camera" },
  { href: "/settings", label: "Settings", icon: "gear" },
] as const;

function NavIcon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? "var(--color-leaf-600)" : "var(--color-muted)";
  const common = { stroke, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  if (name === "home")
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10.5 12 4l9 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19z" {...common} />
        <path d="M9.5 20.5v-6h5v6" {...common} />
      </svg>
    );
  if (name === "camera")
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v10A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5z" {...common} />
        <circle cx="12" cy="13" r="3.6" {...common} />
      </svg>
    );
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" {...common} />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" {...common} />
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-cream/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-lg justify-around px-4 py-2">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="tap flex min-w-20 flex-col items-center gap-1 rounded-2xl px-3 py-1.5"
            >
              <NavIcon name={item.icon} active={active} />
              <span
                className={`text-[12px] font-semibold ${active ? "text-leaf-600" : "text-muted"}`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
