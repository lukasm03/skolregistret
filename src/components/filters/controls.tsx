"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Label } from "@/components/ui/primitives";

/**
 * The filter controls. They used to be links that reloaded the page; now each
 * one reports a change and the view patches the query string in place, so
 * only the table re-renders. The URL still carries the whole filter, so a
 * filtered list is as shareable and as back-buttonable as before.
 */

export function FilterGroup({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/**
 * Both of these were `<button role="checkbox">` and `<button role="radio">`,
 * which announce correctly and behave wrongly: a declared radiogroup is one
 * tab stop whose members are chosen with the arrow keys, and eight buttons in
 * a row are eight tab stops that ignore them.
 *
 * They are native inputs now, styled with `appearance-none` and a peer-driven
 * mark. The grouping, the arrow keys, the checked state and the form
 * semantics come from the platform; only the look is ours. The `<label>`
 * wraps both halves, so the text is part of the target rather than a dead
 * zone beside it.
 */
const markClass =
  "peer absolute inset-0 appearance-none border border-line-control bg-surface checked:border-accent checked:bg-accent";

export function CheckboxControl({
  onToggle,
  checked,
  label,
  count,
}: {
  onToggle: () => void;
  checked: boolean;
  label: string;
  count?: number;
}) {
  return (
    <label className="group flex cursor-pointer items-center gap-2">
      <span className="relative flex size-[13px] flex-none items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className={`${markClass} rounded-xs`}
        />
        <span
          aria-hidden
          className="pointer-events-none hidden text-[9px] leading-none text-accent-ink peer-checked:block"
        >
          ✓
        </span>
      </span>
      <span className="min-w-0 truncate text-base group-hover:text-accent">{label}</span>
      {count != null && (
        <span className="ml-auto font-mono text-mono text-ink-faint">{count}</span>
      )}
    </label>
  );
}

/** Single-select sibling of `CheckboxControl` — used for skolform. */
export function RadioControl({
  name,
  onSelect,
  checked,
  label,
  count,
}: {
  /** Shared by every radio in one group — this is what makes it a group. */
  name: string;
  onSelect: () => void;
  checked: boolean;
  label: string;
  count?: number;
}) {
  return (
    <label className="group flex cursor-pointer items-center gap-2">
      <span className="relative flex size-[13px] flex-none items-center justify-center">
        <input
          type="radio"
          name={name}
          checked={checked}
          onChange={onSelect}
          className={`${markClass} rounded-full`}
        />
        <span
          aria-hidden
          className="pointer-events-none hidden size-[5px] rounded-full bg-accent-ink peer-checked:block"
        />
      </span>
      <span
        className={`min-w-0 truncate text-base group-hover:text-accent ${checked ? "font-medium" : ""}`}
      >
        {label}
      </span>
      {count != null && (
        <span className="ml-auto font-mono text-mono text-ink-faint">{count}</span>
      )}
    </label>
  );
}

export function Chip({
  onToggle,
  active,
  children,
}: {
  onToggle: () => void;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={`rounded-sm border px-2 py-1 font-mono text-xs ${
        active
          ? "border-accent bg-accent-bg font-medium text-accent"
          : "border-line bg-surface text-ink-muted hover:border-ink-faint"
      }`}
    >
      {children}
    </button>
  );
}

export function Toggle({
  onToggle,
  on,
  label,
}: {
  onToggle: () => void;
  on: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="group flex items-center justify-between"
    >
      <span className="text-base group-hover:text-accent">{label}</span>
      <span
        aria-hidden
        className={`flex h-[17px] w-[30px] flex-none rounded-full p-0.5 ${
          on ? "justify-end bg-accent" : "justify-start bg-line-control"
        }`}
      >
        <span
          className={`size-[13px] rounded-full bg-surface ${on ? "" : "shadow-[0_1px_2px_rgba(20,22,26,0.2)]"}`}
        />
      </span>
    </button>
  );
}

/**
 * Single-select. A radio list is the house style, but with 290 kommuner it
 * would be longer than the page — a native select stays searchable by typing
 * and applies on change, with no button to press.
 */
export function SelectField({
  name,
  value,
  onChange,
  allLabel,
  options,
  label,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: { value: string; label: string; count?: number }[];
  label: string;
}) {
  return (
    <select
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="h-[30px] w-full min-w-0 rounded-md border border-line bg-surface px-2 text-[16px] sm:text-base"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.count != null ? `${o.label} (${o.count})` : o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Numeric range. Applies on change, so the list narrows as you type; an
 * unparseable or empty field simply drops that bound.
 */
export function RangeField({
  min,
  max,
  onChange,
  placeholderMin,
  placeholderMax,
}: {
  min?: number;
  max?: number;
  onChange: (bound: "min" | "max", value: string) => void;
  placeholderMin: number;
  placeholderMax: number;
}) {
  const field =
    "h-[28px] w-full rounded-md border border-line bg-surface px-2 font-mono text-[16px] sm:text-xs";
  return (
    <div className="flex items-center gap-[7px]">
      <input
        type="number"
        inputMode="numeric"
        value={min ?? ""}
        onChange={(e) => onChange("min", e.target.value)}
        placeholder={String(placeholderMin)}
        aria-label="Minsta antal elever"
        className={field}
      />
      <span aria-hidden className="text-sm text-ink-faint">
        –
      </span>
      <input
        type="number"
        inputMode="numeric"
        value={max ?? ""}
        onChange={(e) => onChange("max", e.target.value)}
        placeholder={String(placeholderMax)}
        aria-label="Största antal elever"
        className={field}
      />
    </div>
  );
}

/**
 * Multi-select. Gymnasieprogram can run past 30 nationella + lokala variants
 * on a single unit list, which as chips ran the sidebar off the page — a
 * dropdown keeps the closed state to one line while still letting you pick
 * any number of programmes.
 */
export function MultiSelectDropdown({
  label,
  placeholder,
  selected,
  options,
  onToggle,
}: {
  label: string;
  placeholder: string;
  selected: string[];
  options: { value: string; label: string; count?: number }[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} program valda`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        className="flex h-[30px] w-full min-w-0 items-center justify-between gap-2 rounded-md border border-line bg-surface px-2 text-left text-base"
      >
        <span className={`truncate ${selected.length ? "" : "text-ink-faint"}`}>
          {summary}
        </span>
        <span aria-hidden className="flex-none text-xs text-ink-faint">
          ▾
        </span>
      </button>
      {open && (
        // A listbox's members are options, and these are checkboxes — the
        // roles have to agree with what is actually in the panel.
        <div
          role="group"
          aria-label={label}
          className="absolute top-[calc(100%+4px)] left-0 z-10 max-h-[280px] w-full min-w-[220px] overflow-y-auto rounded-md border border-line bg-surface p-2 shadow-md"
        >
          <div className="flex flex-col gap-[7px]">
            {options.map((o) => (
              <CheckboxControl
                key={o.value}
                label={o.label}
                count={o.count}
                checked={selected.includes(o.value)}
                onToggle={() => onToggle(o.value)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SidebarFootnote({ children }: { children: ReactNode }) {
  return (
    <p className="col-span-full mt-auto border-t border-line-soft pt-4 text-xs leading-[1.5] text-ink-subtle">
      {children}
    </p>
  );
}

/**
 * A rail on a wide screen, a disclosure above the table below `lg` — 236px of
 * filters and a table of fixed-width columns do not share a phone.
 *
 * Open, the panel lays its groups out two or three across rather than as one
 * tall column, so the table is still reachable by scrolling past it. The
 * toggle and the panel are siblings, which is why the views arrange this row
 * as a column until `lg`.
 */
export function Sidebar({
  children,
  activeCount = 0,
}: {
  children: ReactNode;
  /** Shown on the closed toggle, so a collapsed panel still declares itself. */
  activeCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <>
      <div className="flex items-center border-b border-line-soft bg-surface-panel px-4 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex h-[30px] items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-base font-medium hover:border-ink-faint"
        >
          Filter
          {activeCount > 0 && (
            <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-accent px-1 font-mono text-micro text-accent-ink">
              {activeCount}
            </span>
          )}
          <span aria-hidden className="text-[9px] text-ink-faint">
            {open ? "▴" : "▾"}
          </span>
        </button>
      </div>

      <aside
        id={panelId}
        className={`${open ? "grid" : "hidden"} w-full grid-cols-2 gap-x-4 gap-y-5 border-b border-line-soft bg-surface-panel px-4 pt-4 pb-5 sm:grid-cols-3 lg:flex lg:w-[236px] lg:flex-none lg:flex-col lg:gap-5 lg:border-r lg:border-b-0`}
      >
        {children}
      </aside>
    </>
  );
}
