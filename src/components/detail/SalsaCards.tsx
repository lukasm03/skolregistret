import { DASH } from "@/lib/format";
import type { SalsaJämförelse } from "@/lib/salsa-compare";
import { pillTone, valueTone } from "./tone";

/**
 * SALSA has no kommun/riks comparison — the `Deviation` figure already *is*
 * the comparison, against a modeled expectation rather than other schools —
 * so this skips `ComparisonBand` entirely rather than forcing a two-number
 * measure through machinery built for three-way bands.
 */
export function SalsaCards({ rader }: { rader: SalsaJämförelse[] }) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))" }}
    >
      {rader.map((r) => (
        <SalsaCard key={r.key} r={r} />
      ))}
    </div>
  );
}

function SalsaCard({ r }: { r: SalsaJämförelse }) {
  return (
    <article className="flex flex-col gap-2.5 rounded-lg border border-line-soft bg-surface p-3.5 pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <h3 className="text-base leading-[1.3] font-medium">{r.label}</h3>
          <p className="text-xs text-ink-faint">
            {r.läsår !== DASH ? `läsår ${r.läsår} · ` : ""}avvikelse mot SALSA:s modell
          </p>
        </div>
        <div className="flex flex-none flex-col items-end gap-[3px]">
          <span className={`font-mono text-[22px] leading-none ${valueTone[r.riktning]}`}>
            {r.value}
          </span>
          <span className="font-mono text-micro text-ink-faint">skala {r.skala}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-xl border px-2.5 py-[2px] text-xs font-medium ${pillTone[r.riktning]}`}
        >
          {r.omdöme}
        </span>
        <span className="text-xs text-ink-muted">faktiskt: {r.faktisk}</span>
      </div>

      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-[7px] border-t border-line-row pt-2.5 text-xs text-accent marker:content-none [&::-webkit-details-marker]:hidden">
          Vad är SALSA?
        </summary>
        <p className="mt-2 animate-[reveal_150ms_ease-out] text-xs leading-[1.5] text-ink-muted">
          {r.förklaring}
        </p>
      </details>
    </article>
  );
}

/** Read out under the SALSA section — the caveat applies to every card. */
export function SalsaKälla() {
  return (
    <p className="text-xs leading-[1.55] text-ink-faint">
      Källa: Skolverkets SALSA-modell, läsår 2024/25. Avvikelsen är skolans faktiska
      resultat minus vad elevsammansättningen statistiskt förutsäger — inte en jämförelse
      mot kommunen eller riket.
    </p>
  );
}
