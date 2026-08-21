import type { ReactNode } from "react";
import { CaretRight } from "@/components/ui/icons";

/**
 * The collapsible fact section that replaces the detail pages' old fixed
 * rail — same idiom as the disclosure already used inside `NyckeltalCards`
 * and `SalsaCards`, generalized so a tab can hold several of them in a row.
 *
 * `<details>` rather than a state hook: each section's open/closed bit does
 * not need to survive a re-render of anything else on the page.
 */
export function Disclosure({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: ReactNode;
  count?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <details className="group" open={defaultOpen}>
        {/*
          Three ways to hide the default marker, because the browsers
          disagree: `list-none` for Chrome and Firefox, `marker:content-none`
          for the spec'd pseudo, and the webkit one for Safari, which honours
          neither.
        */}
        <summary className="flex cursor-pointer list-none items-center gap-2 border-b border-line-softer pb-1.5 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex text-ink-faint transition-transform group-open:rotate-90">
            <CaretRight size={11} />
          </span>
          {/*
            A heading, not a styled span. These are the sections a detail page
            is made of — "Skoluppgifter", "Huvudman", "Kontakt", "Källor" —
            and a reader moving by heading found none of them. `<summary>`
            takes heading content, so the disclosure keeps working as it did.
          */}
          <h2 className="text-micro font-semibold tracking-[0.08em] text-ink-subtle uppercase">
            {title}
          </h2>
          {count != null && (
            <span className="font-mono text-micro text-ink-faint">{count}</span>
          )}
        </summary>
        <div className="mt-3 animate-[reveal_150ms_ease-out]">{children}</div>
      </details>
    </section>
  );
}
