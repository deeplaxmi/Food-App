"use client";

import { useState } from "react";
import { Chip, TextInput } from "./ui";

/**
 * Free-text list with quick-pick suggestions. Used for allergies, restrictions
 * and dislikes, where we can't know the vocabulary in advance.
 */
export function TagInput({
  values,
  onChange,
  placeholder,
  suggestions = [],
  tone = "leaf",
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  suggestions?: string[];
  tone?: "leaf" | "plain";
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (values.some((v) => v.toLowerCase() === value.toLowerCase())) return;
    onChange([...values, value]);
    setDraft("");
  };

  const remove = (value: string) => onChange(values.filter((v) => v !== value));

  const unused = suggestions.filter(
    (s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {values.map((value) => (
            <li key={value}>
              <button
                type="button"
                onClick={() => remove(value)}
                className={`tap inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[15px] font-medium ${
                  tone === "leaf"
                    ? "border-leaf-500 bg-leaf-50 text-leaf-700"
                    : "border-tomato/30 bg-tomato-50 text-tomato"
                }`}
              >
                {value}
                <span aria-label={`Remove ${value}`} className="text-[17px] leading-none opacity-60">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <TextInput
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
        />
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={!draft.trim()}
          className="tap shrink-0 rounded-2xl border border-hairline bg-white px-4 text-[16px] font-semibold text-leaf-600 disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {unused.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {unused.map((s) => (
            <Chip key={s} onClick={() => add(s)} tone="leaf">
              + {s}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
