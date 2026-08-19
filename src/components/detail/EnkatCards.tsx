import { DASH, signed } from "@/lib/format";
import type { EnkätDimension, EnkätJämförelse } from "@/lib/enkat-compare";
import { ComparisonBand } from "./ComparisonBand";
import { valueTone } from "./tone";

/**
 * Skolenkäten, one card per group that answered it.
 *
 * The table this replaces put each group's five answers on one row and then
 * repeated the row twice — once for kommunsnittet, once for riksgenomsnittet —
 * so reading "is trygghet good here?" meant tracking one column down three
 * rows. Here the comparison is on the same line as the answer, and the group's
 * own header carries the one thing that decides how much any of it is worth:
 * how many people answered.
 */

export function EnkatCards({ grupper }: { grupper: EnkätJämförelse[] }) {
  return (
    <div className="flex flex-col gap-3">
      {grupper.map((g) => (
        <EnkatCard key={g.key} g={g} />
      ))}
    </div>
  );
}

function EnkatCard({ g }: { g: EnkätJämförelse }) {
  return (
    <section className="rounded-lg border border-line-soft bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-1.5 rounded-t-md border-b border-line-row bg-surface-subtle px-3.5 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h3 className="text-base font-semibold">{g.grupp}</h3>
          <span className="font-mono text-mono text-ink-faint">
            {g.antalSvar} svar
            {g.svarsfrekvens && ` · ${g.svarsfrekvens} svarsfrekvens`}
            {g.läsår !== DASH && ` · ${g.läsår}`}
          </span>
        </div>
        <span
          className={`rounded-xl border px-2.5 py-[2px] text-xs font-medium ${
            g.osäkert
              ? "border-warn-line bg-warn-bg text-warn"
              : "border-ok-line bg-ok-bg text-ok"
          }`}
        >
          {g.tillförlitlighet}
        </span>
      </div>

      <div className="flex flex-col px-3.5 pt-1 pb-3">
        {g.dimensioner.map((d) => (
          <EnkatRad key={d.label} d={d} />
        ))}
        <p className="mt-2.5 text-xs leading-[1.5] text-ink-muted">{g.sammanfattning}</p>
      </div>
    </section>
  );
}

/**
 * Four fields that sit on one line where there is room and stack into three
 * where there is not — the band is the first thing to move, since it is the
 * one part that repeats what the figures beside it already say.
 */
function EnkatRad({ d }: { d: EnkätDimension }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1.5 border-b border-line-row py-2 sm:grid-cols-[minmax(84px,110px)_1fr_56px_minmax(0,auto)]">
      <span className="order-1 text-base">{d.label}</span>
      <span
        className={`order-2 text-right font-mono text-lg sm:order-3 ${valueTone[d.riktning]}`}
      >
        {d.value}
      </span>
      <span className="order-3 col-span-2 sm:order-2 sm:col-span-1">
        <ComparisonBand
          egenPct={d.egenPct}
          kommunPct={d.kommunPct}
          riksPct={d.riksPct}
          riktning={d.riktning}
          height={20}
        />
      </span>
      <span className="order-4 col-span-2 text-right font-mono text-mono text-ink-faint sm:col-span-1">
        kommun {d.kommun} · riket {d.riks}{" "}
        <span className={valueTone[d.riktning]}>{signed(d.diff)}</span>
      </span>
    </div>
  );
}
