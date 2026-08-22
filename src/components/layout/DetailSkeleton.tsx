import type { CSSProperties } from "react";
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
 * when it arrives — which means this file has to know that the three routes
 * no longer share a shape. One drawing used to serve all of them, a stat
 * grid over a right-hand rail; but `/skolor/[kod]` and `/huvudman/[slug]`
 * moved to tabs and lost the rail, so on the two routes people actually deep
 * link into, the skeleton was promising a column that never arrived. Each
 * section gets the body it really has below.
 */
export function DetailSkeleton({
  section,
}: {
  section: "/skolor" | "/huvudman" | "/koncern";
}) {
  // Each region breathes a beat after the one above it — in unison the whole
  // page reads as one flashing rectangle rather than something assembling.
  // The delay rides a custom property because those inherit and
  // `animation-delay` does not, and because a class built from a template
  // string is a class Tailwind never sees.
  const block = "animate-pulse rounded-sm bg-line-row [animation-delay:var(--beat,0ms)]";
  const beat = (n: number) => ({ "--beat": `${n * 120}ms` }) as CSSProperties;

  // Only the koncern page still has a rail; the other two are tabbed.
  const railed = section === "/koncern";
  const tiles = railed ? 4 : 3;
  const tileMin = section === "/skolor" ? 176 : 158;

  return (
    <AppShell
      section={section}
      searchAction={section}
      searchPlaceholder={
        section === "/skolor"
          ? site.search.skolor
          : section === "/huvudman"
            ? site.search.huvudman
            : site.search.koncern
      }
    >
      <div aria-busy className="flex flex-col">
        <span className="sr-only" role="status">
          Laddar…
        </span>

        <header
          style={beat(0)}
          className="flex flex-col gap-3 border-b border-line-soft px-4 pt-5 pb-[18px] sm:px-6"
        >
          <div className={`${block} h-[11px] w-[110px]`} />
          <div className={`${block} h-[26px] w-[min(100%,340px)]`} />
          <div className="flex flex-wrap items-center gap-2.5">
            {!railed && <div className={`${block} h-[18px] w-[90px] rounded-xl`} />}
            <div className={`${block} h-[13px] w-[150px]`} />
            <div className={`${block} h-[13px] w-[120px]`} />
          </div>
        </header>

        <div
          className="grid gap-px border-b border-line-soft bg-line-row"
          style={{
            ...beat(1),
            gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${tileMin}px), 1fr))`,
          }}
        >
          {Array.from({ length: tiles }, (_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 bg-surface px-4 py-3.5 sm:px-6 sm:py-4"
            >
              <div className={`${block} h-[10px] w-[64px]`} />
              <div className={`${block} h-[24px] w-[86px]`} />
            </div>
          ))}
        </div>

        {railed ? (
          <div className="flex flex-col lg:flex-row lg:items-stretch">
            <div
              style={beat(2)}
              className="flex min-w-0 flex-1 flex-col gap-2.5 px-4 pt-5 pb-6 sm:px-6"
            >
              <div className={`${block} h-[13px] w-[120px]`} />
              <div className={`${block} h-[30px] w-full`} />
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className={`${block} h-[22px] w-full`} />
              ))}
            </div>

            <aside
              style={beat(3)}
              className="flex w-full flex-col gap-3 border-t border-line-soft bg-surface-panel p-5 lg:w-[300px] lg:flex-none lg:border-t-0 lg:border-l"
            >
              <div className={`${block} h-[10px] w-[110px]`} />
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className={`${block} h-[13px] w-full`} />
              ))}
            </aside>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5 px-4 pt-5 pb-6 sm:px-6">
            {/* The tab strip, and the rule it sits on. */}
            <div style={beat(2)} className="flex gap-3 border-b border-line-soft pb-2.5">
              {[86, 74, 64, 104].map((w, i) => (
                <div key={i} className={`${block} h-[15px]`} style={{ width: w }} />
              ))}
            </div>

            {section === "/skolor" ? (
              // Nyckeltalskort — the same auto-fit grid `NyckeltalCards` lays
              // itself out on, so the first paint does not re-flow into it.
              <div
                className="grid gap-3"
                style={{
                  ...beat(3),
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))",
                }}
              >
                {Array.from({ length: 4 }, (_, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-3 rounded-lg border border-line-soft p-3.5"
                  >
                    <div className={`${block} h-[15px] w-[140px]`} />
                    <div className={`${block} h-[24px] w-full`} />
                    <div className={`${block} h-[11px] w-[70%]`} />
                  </div>
                ))}
              </div>
            ) : (
              // The huvudman page opens on its enheter table, framed.
              <div style={beat(3)} className="flex flex-col gap-2.5">
                <div className="flex gap-2">
                  <div className={`${block} h-[30px] w-[240px]`} />
                  <div className={`${block} h-[30px] w-[170px]`} />
                  <div className={`${block} h-[30px] w-[160px]`} />
                </div>
                <div className="overflow-clip rounded-lg border border-line-soft">
                  <div className={`${block} h-[30px] w-full rounded-none`} />
                  {Array.from({ length: 8 }, (_, i) => (
                    <div
                      key={i}
                      className="border-b border-line-row px-2 py-[9px] last:border-b-0"
                    >
                      <div className={`${block} h-[14px] w-full`} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
