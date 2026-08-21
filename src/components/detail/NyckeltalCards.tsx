import { CaretRight } from "@/components/ui/icons";
import { DASH, signed } from "@/lib/format";
import type { NyckeltalJämförelse } from "@/lib/nyckeltal-compare";
import { ComparisonBand } from "./ComparisonBand";
import { pillTone, valueTone } from "./tone";

/**
 * The nyckeltal, one card each: the unit's own figure, where it sits against
 * kommunen and riket, where it ranks in its kommun, and — behind a disclosure
 * — what the figure counts and where it came from.
 *
 * The provenance is the point. A page that colours a number green owes the
 * reader an answer to "says who?", and the answer differs per metric: some
 * rikstal are Skolverket's own, some are averages we computed because
 * Skolverket publishes none for that skolform. `Varifrån kommer talet?` is
 * where that difference is stated rather than smoothed over.
 *
 * `<details>` rather than a state hook: the disclosure is one open/closed bit
 * per card that nothing else reads, and the element gets the keyboard, the
 * accessibility tree and find-in-page for free.
 */

export function NyckeltalCards({ rader }: { rader: NyckeltalJämförelse[] }) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))" }}
    >
      {rader.map((r) => (
        <NyckeltalCard key={r.key} r={r} />
      ))}
    </div>
  );
}

function NyckeltalCard({ r }: { r: NyckeltalJämförelse }) {
  return (
    <article className="flex flex-col gap-2.5 rounded-lg border border-line-soft bg-surface p-3.5 pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <h2 className="text-base leading-[1.3] font-medium">{r.label}</h2>
          <p className="text-xs text-ink-faint">
            {r.läsår !== DASH ? `läsår ${r.läsår} · ` : ""}
            {r.riktningsText}
          </p>
        </div>
        <div className="flex flex-none flex-col items-end gap-[3px]">
          <span className={`font-mono text-[22px] leading-none ${valueTone[r.riktning]}`}>
            {r.value}
          </span>
          {r.diffRiks != null && (
            <span className={`font-mono text-micro ${valueTone[r.riktning]}`}>
              {signed(r.diffRiks)} mot riket
            </span>
          )}
        </div>
      </div>

      {r.saknas ? (
        <p className="text-xs leading-[1.5] text-ink-muted">{r.saknas}</p>
      ) : null}

      {(r.egenPct != null || r.kommunPct != null || r.riksPct != null) && (
        <div className="flex flex-col gap-1.5">
          <ComparisonBand
            egenPct={r.egenPct}
            kommunPct={r.kommunPct}
            riksPct={r.riksPct}
            riktning={r.riktning}
          />
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
            <span className="flex items-center gap-1.5 font-mono text-micro text-ink-muted">
              <span
                aria-hidden
                className="h-[11px] w-[2px]"
                style={{
                  background:
                    "repeating-linear-gradient(var(--line-control) 0 3px, transparent 3px 6px)",
                }}
              />
              kommun {r.kommun}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-micro font-medium text-accent">
              <span aria-hidden className="h-[11px] w-[2px] bg-accent" />
              riket {r.riks}
              {r.beräknatRiks && " (beräknat)"}
            </span>
            <span className="ms-auto font-mono text-micro text-ink-faint">
              skala {r.skala}
            </span>
          </div>
        </div>
      )}

      {r.tal != null && (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-xl border px-2.5 py-[2px] text-xs font-medium ${pillTone[r.riktning]}`}
          >
            {r.omdöme}
          </span>
          {r.placering !== DASH && (
            <>
              <span className="text-xs text-ink-muted">{r.placering} i kommunen</span>
              {r.rankPct != null && (
                <span
                  aria-hidden
                  className="relative h-[6px] min-w-[60px] flex-1 rounded-full bg-line-row"
                >
                  <span
                    className="absolute -top-[3px] h-[12px] w-[2px] bg-ink"
                    style={{ left: `${r.rankPct}%` }}
                  />
                </span>
              )}
            </>
          )}
        </div>
      )}

      <details className="group">
        {/*
          Three ways to hide the default marker, because the browsers disagree:
          `list-none` for Chrome and Firefox, `marker:content-none` for the
          spec'd pseudo, and the webkit one for Safari, which honours neither.
        */}
        <summary className="flex cursor-pointer list-none items-center gap-[7px] border-t border-line-row pt-2.5 text-xs text-accent marker:content-none [&::-webkit-details-marker]:hidden">
          <CaretRight size={11} className="transition-transform group-open:rotate-90" />
          Varifrån kommer talet?
        </summary>
        <div className="mt-2 flex animate-[reveal_150ms_ease-out] flex-col gap-1.5 rounded-md border border-line-row bg-surface-subtle px-3 py-2.5">
          <dl className="flex flex-col gap-1.5">
            {r.källa.map((k) => (
              <div key={k.k} className="flex justify-between gap-3.5 text-xs">
                <dt className="text-ink-muted">{k.k}</dt>
                <dd className="m-0 text-right">{k.v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-0.5 text-xs leading-[1.5] text-ink-muted">{r.förklaring}</p>
        </div>
      </details>
    </article>
  );
}

/** Read out under both views — the caveat applies to the figures, not the layout. */
export function NyckeltalKälla({ beräknat }: { beräknat: boolean }) {
  return (
    <p className="text-xs leading-[1.55] text-ink-faint">
      Källa: Skolverkets statistik-API. Kommunsnitt och placering är räknade av oss över
      kommunens egna enheter.
      {beräknat &&
        " Riksgenomsnitt märkta beräknat saknas hos Skolverket och är räknade" +
          " av oss ur varje enhets egna redovisade tal."}
    </p>
  );
}
