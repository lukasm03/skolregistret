import Link from "next/link";
import type { ReactNode } from "react";
import { site } from "@/config/site";
import { SearchFieldContents, searchBoxClass } from "@/components/ui/SearchField";

interface Props {
  /** Which top-level section is active — matches `site.nav[].match`. */
  section: string;
  searchPlaceholder: string;
  /** Where the search form submits when there is no `onSearchChange`. */
  searchAction: string;
  searchValue?: string;
  /**
   * Given by the list views, which filter in the browser: the field then
   * reports every keystroke instead of submitting, so searching narrows the
   * table without reloading the page. The detail pages leave it out and get
   * the plain GET form, which needs no JavaScript.
   */
  onSearchChange?: (value: string) => void;
  children: ReactNode;
}

export function AppShell({
  section,
  searchPlaceholder,
  searchAction,
  searchValue,
  onSearchChange,
  children,
}: Props) {
  const searchField = (
    <SearchFieldContents
      placeholder={searchPlaceholder}
      {...(onSearchChange
        ? { value: searchValue, onChange: onSearchChange }
        : { defaultValue: searchValue })}
    />
  );
  // Below sm the field takes a line of its own — brand, nav and a 300px
  // search do not fit across a phone.
  const searchClass = `${searchBoxClass} w-full flex-1 basis-full sm:w-auto sm:max-w-[300px] sm:basis-auto`;

  return (
    <div className="flex min-h-screen justify-center">
      <div className="w-full bg-surface">
        {/* One keystroke past the header, nav and search for keyboard users. */}
        <a
          href="#innehall"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-2 focus:text-base"
        >
          Hoppa till innehållet
        </a>
        {/*
          Pinned from `sm` up, where it is a known 52px and `--stuck-top` in
          globals.css is set to match — everything else that pins itself (the
          tab strip, a table's column headers) stacks under that figure.

          Not on a phone. There it wraps to two rows of roughly 88px, and
          giving away an eighth of the viewport permanently, on the device
          with the least of it, buys less than the rows it would cover.
        */}
        <header className="z-40 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft bg-surface-subtle px-3 py-2.5 sm:sticky sm:top-0 sm:h-[52px] sm:flex-nowrap sm:gap-[18px] sm:px-[18px] sm:py-0">
          <Link
            href="/skolor"
            className="flex items-center gap-[9px] transition-opacity hover:opacity-75"
          >
            <span aria-hidden className="size-[18px] rounded-xs bg-accent" />
            {/* A brand name, not a word — auto-translate garbles it otherwise. */}
            <span translate="no" className="text-lg font-semibold tracking-[-0.01em]">
              {site.brand}
            </span>
          </Link>

          <span className="hidden h-5 w-px bg-line-soft sm:block" />

          <nav
            aria-label="Huvudnavigering"
            className="flex rounded-lg bg-surface-segment p-0.5"
          >
            {site.nav.map((item) => {
              const active = item.match === section;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "rounded-sm bg-surface px-3 py-[5px] text-base font-medium shadow-raised"
                      : "px-3 py-[5px] text-base text-ink-muted hover:text-ink"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {onSearchChange ? (
            <div className={searchClass}>{searchField}</div>
          ) : (
            <form action={searchAction} method="get" className={searchClass}>
              {searchField}
            </form>
          )}
        </header>

        <main id="innehall">{children}</main>
      </div>
    </div>
  );
}
