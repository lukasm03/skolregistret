import type { ReactNode } from "react";

/**
 * The app's search input, in two halves so its two callers can each wrap it in
 * what they need.
 *
 * The header's field is a `<form>` when the page has no JavaScript filtering
 * to offer — the detail pages submit a plain GET — and a `<div>` when it
 * filters as you type. The huvudman page's enheter tab is always a `<div>`,
 * sized to sit in a toolbar rather than to span a header. That is the whole
 * of the difference between them, and it lives in the element and the sizing
 * classes; everything inside was duplicated between the two, down to the
 * `text-[16px]` that keeps iOS from zooming.
 *
 * Not a client component. `AppShell` renders it from server pages (no
 * `onChange`, plain form submit) and from client views (`onChange`, filtering
 * in place), and it has no state of its own either way.
 */

/**
 * The box the field sits in. Compose sizing onto it; the element it lands on
 * is the caller's choice.
 *
 * The input drops its own outline so the ring sits on the whole field rather
 * than inside its border, and this draws it back: the border firms up for any
 * focus, and `has-[:focus-visible]` repeats the global 2px accent outline for
 * the keyboard only — the same rule globals.css applies everywhere else,
 * which a bare border-colour swap did not meet.
 */
export const searchBoxClass =
  "flex h-[30px] items-center gap-2 rounded-md border border-line bg-surface px-2.5 focus-within:border-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent";

export function SearchFieldContents({
  placeholder,
  value,
  defaultValue,
  onChange,
}: {
  /** Doubles as the accessible name — the field carries no visible label. */
  placeholder: string;
  /** Controlled: pass both this and `onChange`. */
  value?: string;
  /** Uncontrolled, for the plain GET form. */
  defaultValue?: string;
  onChange?: (value: string) => void;
}): ReactNode {
  return (
    <>
      <span
        aria-hidden
        className="size-[11px] flex-none rounded-full border-[1.5px] border-ink-faint"
      />
      <input
        type="search"
        name="q"
        autoComplete="off"
        spellCheck={false}
        {...(onChange
          ? { value: value ?? "", onChange: (e) => onChange(e.target.value) }
          : { defaultValue })}
        placeholder={placeholder}
        aria-label={placeholder}
        // 16px until sm: iOS Safari zooms the page when a focused field is
        // set smaller than that, and coming back out of the zoom is manual.
        className="w-full min-w-0 bg-transparent text-[16px] outline-none sm:text-base"
      />
    </>
  );
}
