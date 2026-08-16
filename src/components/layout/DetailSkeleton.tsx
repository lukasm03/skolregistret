import { AppShell } from "@/components/layout/AppShell";
import { site } from "@/config/site";

/**
 * What a detail route shows while it is being fetched.
 *
 * The detail pages are prerendered, so a link that has been prefetched opens
 * with no pending phase at all and this is never seen. It is for the link
 * that has not: further down a 100-row page, or followed straight from a
 * shared URL. Next's own guidance is to reach for a route-level fallback
 * before per-link spinners, which is what this is.
 *
 * The blocks stand where the real content will, so the page does not jump
 * when it arrives.
 */
export function DetailSkeleton({ section }: { section: "/skolor" | "/huvudman" }) {
  const block = "animate-pulse rounded-sm bg-line-row";

  return (
    <AppShell
      section={section}
      searchAction={section}
      searchPlaceholder={
        section === "/skolor" ? site.search.skolor : site.search.huvudman
      }
    >
      <div aria-busy className="flex flex-col">
        <span className="sr-only" role="status">
          Laddar
        </span>

        <header className="flex flex-col gap-3 border-b border-line-soft px-4 pt-5 pb-[18px] sm:px-6">
          <div className={`${block} h-[11px] w-[110px]`} />
          <div className={`${block} h-[26px] w-[min(100%,340px)]`} />
          <div className="flex flex-wrap items-center gap-2.5">
            <div className={`${block} h-[18px] w-[90px] rounded-xl`} />
            <div className={`${block} h-[13px] w-[150px]`} />
            <div className={`${block} h-[13px] w-[120px]`} />
          </div>
        </header>

        <div
          className="grid gap-px border-b border-line-soft bg-line-row"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 158px), 1fr))",
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-2 bg-surface px-4 py-3.5 sm:px-6 sm:py-4"
            >
              <div className={`${block} h-[10px] w-[64px]`} />
              <div className={`${block} h-[24px] w-[86px]`} />
            </div>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-stretch">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 px-4 pt-5 pb-6 sm:px-6">
            <div className={`${block} h-[13px] w-[120px]`} />
            <div className={`${block} h-[30px] w-full`} />
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className={`${block} h-[22px] w-full`} />
            ))}
          </div>

          <aside className="flex w-full flex-col gap-3 border-t border-line-soft bg-surface-panel p-5 lg:w-[300px] lg:flex-none lg:border-t-0 lg:border-l">
            <div className={`${block} h-[10px] w-[110px]`} />
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className={`${block} h-[13px] w-full`} />
            ))}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
