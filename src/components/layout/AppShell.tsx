import Link from "next/link";
import type { ReactNode } from "react";
import { site } from "@/config/site";

interface Crumb {
  label: string;
  href?: string;
}

interface Props {
  /** Which top-level section is active — matches `site.nav[].match`. */
  section: string;
  crumbs: Crumb[];
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
  crumbs,
  searchPlaceholder,
  searchAction,
  searchValue,
  onSearchChange,
  children,
}: Props) {
  const searchField = (
    <>
      <span
        aria-hidden
        className="size-[11px] flex-none rounded-full border-[1.5px] border-ink-faint"
      />
      <input
        type="search"
        name="q"
        {...(onSearchChange
          ? {
              value: searchValue ?? "",
              onChange: (e) => onSearchChange(e.target.value),
            }
          : { defaultValue: searchValue })}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        className="w-full min-w-0 bg-transparent text-base outline-none"
      />
    </>
  );
  const searchClass =
    "flex h-[30px] max-w-[300px] flex-1 items-center gap-2 rounded-md border border-line bg-surface px-2.5 focus-within:border-accent";

  return (
    <div className="flex min-h-screen justify-center">
      <div className="w-full bg-surface">
        <header className="flex h-[52px] items-center gap-[18px] border-b border-line-soft bg-surface-subtle px-[18px]">
          <Link href="/skolor" className="flex items-center gap-[9px]">
            <span className="size-[18px] rounded-xs bg-accent" />
            <span className="text-lg font-semibold tracking-[-0.01em]">
              {site.brand}
            </span>
          </Link>

          <span className="h-5 w-px bg-line-soft" />

          <nav
            aria-label="Huvudnavigering"
            className="flex rounded-md bg-surface-segment p-0.5"
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
                      ? "rounded-sm bg-surface px-3 py-[5px] text-base font-medium shadow-[0_1px_1px_rgba(20,22,26,0.06)]"
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

        {children}
      </div>
    </div>
  );
}
