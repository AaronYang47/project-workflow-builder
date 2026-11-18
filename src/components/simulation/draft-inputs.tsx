"use client";

import { useState } from "react";

/**
 * Number box that lets people type freely: the text is kept as typed and
 * only a complete, in-range number is passed on. Leaving the box with
 * something invalid puts the last good value back.
 */
export function NumberInput({
  label,
  value,
  min = 0,
  max = 100_000,
  step = 1,
  integer = false,
  onCommit,
  className,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  onCommit: (value: number) => void;
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  // Follow changes made elsewhere (another scenario, auto schedule).
  if (value !== shown) {
    setShown(value);
    if (Number(text) !== value) setText(String(value));
  }
  const parse = (raw: string) => {
    if (!/^\d+(\.\d+)?$/.test(raw.trim())) return undefined;
    const parsed = Number(raw);
    if (integer && !Number.isInteger(parsed)) return undefined;
    return parsed >= min && parsed <= max ? parsed : undefined;
  };
  return (
    <input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      aria-label={label}
      data-step={step}
      value={text}
      aria-invalid={parse(text) === undefined}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = parse(event.target.value);
        if (parsed !== undefined && parsed !== value) {
          setShown(parsed);
          onCommit(parsed);
        }
      }}
      onBlur={() => {
        if (parse(text) === undefined) setText(String(value));
      }}
      className={`${className ?? ""} aria-[invalid=true]:border-red-500`}
    />
  );
}

const validDate = (raw: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const date = new Date(`${raw}T00:00:00Z`);
  const year = Number(raw.slice(0, 4));
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === raw &&
    year >= 2000 &&
    year <= 2100
  );
};

/** Date box that only passes on complete dates between 2000 and 2100. */
export function DateInput({
  label,
  value,
  onCommit,
  className,
  min,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  /** Earliest date allowed (YYYY-MM-DD); earlier dates are not passed on. */
  min?: string;
}) {
  const allowed = (raw: string) => validDate(raw) && (!min || raw >= min);
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(value);
  }
  return (
    <input
      type="date"
      aria-label={label}
      min={min && validDate(min) ? min : "2000-01-01"}
      max="2100-12-31"
      value={text}
      aria-invalid={!allowed(text)}
      onChange={(event) => {
        setText(event.target.value);
        if (allowed(event.target.value) && event.target.value !== value) {
          setShown(event.target.value);
          onCommit(event.target.value);
        }
      }}
      onBlur={() => {
        if (!allowed(text)) setText(value);
      }}
      className={`${className ?? ""} aria-[invalid=true]:border-red-500`}
    />
  );
}
