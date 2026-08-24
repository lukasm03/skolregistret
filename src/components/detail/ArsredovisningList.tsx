import { bytes } from "@/lib/format";
import type { Årsredovisning } from "@/lib/arsredovisning";

/**
 * The huvudmannens filed årsredovisningar, newest year first.
 *
 * Built like `DokumentList`: these are links, and the row's job is to name
 * the räkenskapsår and get out of the way. The end date sits beside the year
 * label because the label assumes a twelve-month year and the date does not
 * — see `räkenskapsårEtikett`.
 */

export function ArsredovisningList({
  orgnr,
  poster,
}: {
  orgnr: string;
  poster: Årsredovisning[];
}) {
  return (
    <ul className="overflow-hidden rounded-lg border border-line-soft bg-surface">
      {poster.map((p) => (
        <li
          key={p.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line-row px-3.5 py-3 last:border-b-0"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="flex-none rounded-xl border border-ok-line bg-ok-bg px-2.5 py-[2px] text-micro font-medium text-ok">
              {p.etikett}
            </span>
            {/*
              The visible label repeats down the list because the year is the
              pill beside it. Read out of that context — in a screen reader's
              list of links — ten rows all called "Årsredovisning" tell you
              nothing, so the announced name takes the year with it.
            */}
            <a
              href={`/arsredovisning/${orgnr}/${p.id}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Årsredovisning ${p.etikett}`}
              className="text-base font-medium text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
            >
              Årsredovisning
            </a>
            {p.revisionsberättelseBytes != null && (
              <a
                href={`/arsredovisning/${orgnr}/${p.id}?del=revision`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Revisionsberättelse ${p.etikett}`}
                className="text-base text-ink-muted underline decoration-line-control underline-offset-2 hover:text-ink hover:decoration-ink-faint"
              >
                Revisionsberättelse
              </a>
            )}
          </div>
          <div className="flex flex-none items-center gap-3.5 font-mono text-micro text-ink-faint">
            <span>t.o.m. {p.räkenskapsårSlut}</span>
            <span>{bytes(p.storlekBytes)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
