import type { ReactNode } from "react";
import { Disclosure } from "@/components/detail/Disclosure";
import { FactList, Note } from "@/components/ui/primitives";
import { site } from "@/config/site";
import { DASH, isoDate } from "@/lib/format";
import type { HuvudmanKällhänvisning, SkolaKällhänvisning } from "@/lib/skolregister";

/**
 * The detail pages' "Källor" sections — the *only* place either page talks
 * about where its figures came from.
 *
 * Every table used to carry its own källa line: one under the nyckeltal, one
 * under SALSA, one under the dokumentlistan, one under the årsredovisningarna,
 * plus a loose "Data hämtat …" under the tab strip. A reader who opened three
 * tabs met "Källa: Skolverket…" three times and still had to guess which of
 * them the number in front of them came from. The prose is collected here
 * instead, one row per source, each row naming the authority and linking to
 * the address that authority actually served this page's figures from — the
 * tabs are left to the figures.
 *
 * Those addresses are the collector's own: `data/allt.json` records, per unit
 * and per bolag, every URL it read, and `SkolaKällhänvisning` carries them up
 * here. Nothing in this file builds one. The names, and the front door a row
 * falls back to, come from `site.källor`.
 */

type Källnyckel = keyof typeof site.källor;

/**
 * Whether a collected address is one a reader can open.
 *
 * Bolagsverkets `gw.api` wants a Bearer token — the same wall
 * `Bolagsuppslag.dokument[].url` is behind — so citing it as a link would
 * hand the reader an error page. Those rows keep the authority's front door
 * instead, and the address stays in the data as provenance. Every other
 * source the collector reads answers a plain GET.
 */
function öppen(url: string | null): string | undefined {
  if (!url) return undefined;
  return url.startsWith("https://gw.api.bolagsverket.se/") ? undefined : url;
}

/**
 * A source's own name, linked to what that authority published about *this*
 * page's subject — the unit's own statistics resource rather than the API's
 * front door — and to the source as a whole where the data cites no openable
 * address.
 *
 * The visible text stays the source's name, because that is what the row is
 * naming. `subjekt` puts the school or the huvudman into the link's
 * accessible name instead, so a reader tabbing a column of source links hears
 * which record each one opens rather than six variations on "Skolverket". The
 * visible text stays a prefix of that name, which is what lets a voice
 * command match it.
 */
function KällLänk({
  källa,
  href,
  subjekt,
  suffix,
}: {
  källa: Källnyckel;
  href?: string;
  subjekt?: string;
  suffix?: string;
}) {
  const { namn, url } = site.källor[källa];
  return (
    <>
      <a
        href={href ?? url}
        aria-label={href && subjekt ? `${namn} — ${subjekt}` : undefined}
        className="text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
      >
        {namn}
      </a>
      {suffix}
    </>
  );
}

export function SkolaKällor({
  namn,
  källor,
  statistikLäsår,
  enkätLäsår,
  salsaLäsår,
  harBeräknatRiks,
  harProgramsnitt,
  harSalsa,
  harEnkät,
  harDokument,
  byggd,
}: {
  /** Names the unit in the links' accessible names. */
  namn: string;
  /** The collector's own address per block — see `SkolaKällhänvisning`. */
  källor: SkolaKällhänvisning;
  statistikLäsår: string;
  enkätLäsår: string;
  salsaLäsår: string;
  harBeräknatRiks: boolean;
  /** Whether the unit's own lärartal are averaged from its gymnasieprogram. */
  harProgramsnitt: boolean;
  harSalsa: boolean;
  harEnkät: boolean;
  harDokument: boolean;
  /** ISO timestamp of the collector run this page's data came out of. */
  byggd: string | null;
}) {
  const posten = `posten för ${namn}`;

  const rader: [ReactNode, ReactNode][] = [
    [
      "Registeruppgifter",
      <KällLänk
        key="reg"
        källa="skolenhetsregistret"
        href={öppen(källor.registeruppgifter)}
        subjekt={posten}
      />,
    ],
    [
      "Nyckeltal",
      <KällLänk
        key="stat"
        källa="skolverketStatistik"
        href={öppen(källor.nyckeltal)}
        subjekt={posten}
        suffix={statistikLäsår === DASH ? undefined : `, läsår ${statistikLäsår}`}
      />,
    ],
    // SALSA runs a läsår behind the rest of the statistics. The year comes
    // off the unit's own salsa block, which carries one period rather than the
    // time series `statistik.matt` holds — see `salsaLäsår` in
    // `lib/skola-detalj.ts`. The address is the all-schools file every unit's
    // SALSA is read out of, so the row cites the file, not a record in it.
    ...(harSalsa
      ? ([
          [
            "SALSA",
            <KällLänk
              key="salsa"
              källa="salsa"
              href={öppen(källor.salsa)}
              suffix={salsaLäsår === DASH ? undefined : `, läsår ${salsaLäsår}`}
            />,
          ],
        ] as [ReactNode, ReactNode][])
      : []),
    ...(harEnkät
      ? ([
          [
            "Enkätsvar",
            <KällLänk
              key="enkat"
              källa="skolenkäten"
              href={öppen(källor.enkät)}
              subjekt={posten}
              suffix={`, läsår ${enkätLäsår}`}
            />,
          ],
        ] as [ReactNode, ReactNode][])
      : []),
    ...(harDokument
      ? ([
          [
            "Dokument",
            <KällLänk
              key="dok"
              källa="skolinspektionenDokument"
              href={öppen(källor.dokument)}
              subjekt={posten}
            />,
          ],
        ] as [ReactNode, ReactNode][])
      : []),
    ...(byggd
      ? ([
          [
            "Data hämtat",
            <span key="byggd" className="font-mono text-sm">
              {isoDate(byggd)}
            </span>,
          ],
        ] as [ReactNode, ReactNode][])
      : []),
  ];

  return (
    <Disclosure title="Källor" count={rader.length}>
      <div className="flex flex-col gap-3">
        <FactList twoColumn items={rader} />
        <div className="flex flex-col gap-1">
          <Note>
            Kommunsnitt och placering är räknade av oss över kommunens egna enheter.
            {harBeräknatRiks &&
              " Riksgenomsnitt märkta beräknat saknas hos Skolverket och är räknade av" +
                " oss ur varje enhets egna redovisade tal."}
          </Note>
          {/* Skolverket redovisar gymnasiets lärartal per program, aldrig för
              enheten som helhet — se `programsnitt` i lib/skolregister. */}
          {harProgramsnitt && (
            <Note>
              Rader märkta snitt av programmen har inget tal för enheten hos Skolverket —
              uppgiften redovisas bara per gymnasieprogram. Snittet är räknat av oss över
              programmen, vägt efter deras elevantal när alla redovisar ett.
            </Note>
          )}
          {harSalsa && (
            <Note>
              SALSA-avvikelsen är skolans faktiska resultat minus vad elevsammansättningen
              statistiskt förutsäger — inte en jämförelse mot kommunen eller riket.
            </Note>
          )}
          <Note>
            Länkarna går till den API-resurs uppgifterna hämtades ur, inte till
            myndighetens startsida.
          </Note>
        </div>
      </div>
    </Disclosure>
  );
}

export function HuvudmanKällor({
  källor,
  harÅrsredovisningar,
}: {
  källor: HuvudmanKällhänvisning;
  harÅrsredovisningar: boolean;
}) {
  // Both Bolagsverket rows resolve to the myndigheten rather than to the
  // record: `öppen` turns their `gw.api` addresses down, so what the data
  // gives us here is whether the source was consulted at all — a dash where
  // it was not, rather than a link to a register that holds nothing for this
  // huvudman.
  const harBolagsverket = källor.bolagsuppgifter != null || harÅrsredovisningar;

  const rader: [ReactNode, ReactNode][] = [
    // The register is read as two whole lists — `v2/school-units` and
    // `v2/organizers` — so there is no per-huvudman address to cite, and the
    // aggregate on this page is our own grouping of the first of them.
    ["Enheter och elever", <KällLänk key="reg" källa="skolenhetsregistret" />],
    // One koncern has one tree, and the address is the company whose lookup
    // produced it — which may be a sibling of the huvudman being shown. The
    // link says what it opens rather than naming this huvudman for that
    // reason; see `HuvudmanKoncern.källa`.
    ...(källor.koncern
      ? ([
          [
            "Ägarstruktur",
            <KällLänk
              key="koncern"
              källa="hitta"
              href={öppen(källor.koncern)}
              subjekt="uppslaget koncernträdet byggdes ur"
            />,
          ],
        ] as [ReactNode, ReactNode][])
      : []),
    [
      "Bolagsuppgifter",
      källor.bolagsuppgifter ? (
        <KällLänk key="bolag" källa="bolagsverket" href={öppen(källor.bolagsuppgifter)} />
      ) : (
        DASH
      ),
    ],
    [
      "Årsredovisningar",
      harÅrsredovisningar ? (
        <KällLänk key="bv" källa="bolagsverket" href={öppen(källor.årsredovisningar)} />
      ) : (
        DASH
      ),
    ],
  ];

  return (
    <Disclosure title="Källor" count={rader.length}>
      <div className="flex flex-col gap-3">
        <FactList twoColumn items={rader} />
        <Note>Elevtalen är avrundade per enhet, så summor drar iväg några tiotal.</Note>
        {harÅrsredovisningar && (
          <Note>
            Årsredovisningarna visas som de lämnades in till Bolagsverket. Kommunala
            huvudmän lämnar ingen egen årsredovisning för skolverksamheten — den ingår i
            kommunens.
          </Note>
        )}
        {harBolagsverket && (
          <Note>
            Bolagsverkets eget gränssnitt kräver inloggning, så de raderna länkar till
            myndigheten och inte till uppgiften.
          </Note>
        )}
      </div>
    </Disclosure>
  );
}
