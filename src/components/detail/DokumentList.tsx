import { Label } from "@/components/ui/primitives";
import type { DokumentgruppVy, DokumentVy } from "@/lib/dokument-view";

/**
 * Skolinspektionens documents, grouped by skolform.
 *
 * A four-column table was the wrong shape for this: three of the columns were
 * fixed strings and the fourth was a title long enough to be truncated to
 * uselessness. These are links, and a list of links wants to show the whole
 * title.
 */

export function DokumentList({ grupper }: { grupper: DokumentgruppVy[] }) {
  return (
    <div className="flex flex-col gap-4">
      {grupper.map((grupp) => (
        <section key={grupp.skolform} className="flex flex-col gap-2">
          <Label>{grupp.skolform}</Label>
          <ul className="overflow-hidden rounded-lg border border-line-soft bg-surface">
            {grupp.dokument.map((d) => (
              <DokumentRad key={d.key} d={d} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DokumentRad({ d }: { d: DokumentVy }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line-row px-3.5 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span
          className={`flex-none rounded-xl border px-2.5 py-[2px] text-micro font-medium ${
            d.ton === "ok"
              ? "border-ok-line bg-ok-bg text-ok"
              : "border-warn-line bg-warn-bg text-warn"
          }`}
        >
          {d.typ}
        </span>
        <a
          href={d.url}
          target="_blank"
          rel="noreferrer"
          className="text-base font-medium text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
        >
          {d.titel}
        </a>
      </div>
      <div className="flex flex-none items-center gap-3.5 font-mono text-micro text-ink-faint">
        {d.period && <span>{d.period}</span>}
        <span>PDF · {d.storlek}</span>
      </div>
    </li>
  );
}
