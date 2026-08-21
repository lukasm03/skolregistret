import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { site } from "@/config/site";
import { AppShell } from "@/components/layout/AppShell";
import { DataTable } from "@/components/ui/DataTable";
import { BackLink, Dot, FactList, StatusPill } from "@/components/ui/primitives";
import { Disclosure } from "@/components/detail/Disclosure";
import { Tabs, type TabDef } from "@/components/ui/Tabs";
import { BandLegend } from "@/components/detail/ComparisonBand";
import { DokumentKälla, DokumentList } from "@/components/detail/DokumentList";
import { EnkatCards } from "@/components/detail/EnkatCards";
import { NyckeltalCards, NyckeltalKälla } from "@/components/detail/NyckeltalCards";
import { SalsaCards, SalsaKälla } from "@/components/detail/SalsaCards";
import { enkätColumns } from "@/components/tables/enkatColumns";
import { nyckeltalColumns } from "@/components/tables/nyckeltalColumns";
import { ProgramTable } from "@/components/tables/ProgramTable";
import { buildProgramComparisons } from "@/lib/program-compare";
import { buildEnkätComparisons } from "@/lib/enkat-compare";
import { buildNyckeltalComparisons, type RiksNyckeltal } from "@/lib/nyckeltal-compare";
import { buildSalsaComparisons } from "@/lib/salsa-compare";
import { antalDokument, buildDokumentVyer } from "@/lib/dokument-view";
import { DASH, kommunLong, num, plural, slugify } from "@/lib/format";
import { formatYears } from "@/lib/skolverket/parse";
import {
  ancestorPath,
  getBeräknatRiksGenomsnitt,
  getKommunEnkätGenomsnitt,
  getKommunNyckeltalStats,
  getRegisterByggd,
  getRiksEnkätGenomsnitt,
  getSkola,
  getSkolenkät,
  getSkolinspektionDokument,
  koncernForHuvudmanIndex,
  listSkolor,
  primärStatistikskolform,
  STATISTIKNYCKEL_NAMN,
  type EnkätGrupp,
  type NationelltProgramGenomsnitt,
  type Nyckeltal,
  type Skolform,
} from "@/lib/skolregister";

/**
 * Statically generated for every skolenhetskod the register currently has,
 * so `next build` prerenders the whole detail section instead of rendering
 * each unit on demand. `dynamicParams` stays at its default (`true`), so a
 * unit added to the register after the build still resolves — it's just
 * rendered (and then cached) the first time someone visits it.
 */
export async function generateStaticParams() {
  const skolor = await listSkolor();
  return skolor.map((s) => ({ kod: s.skolenhetskod }));
}

/**
 * The register export is parsed once per process, so looking the unit up a
 * second time here costs a map lookup rather than a second read.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ kod: string }>;
}): Promise<Metadata> {
  const { kod } = await params;
  const school = await getSkola(kod);
  if (!school) return { title: "Skolenheten finns inte" };

  const var_ = school.kommun ? ` i ${kommunLong(school.kommun)}` : "";
  const formOrd = school.skolformer.join(", ").toLowerCase() || "skolenhet";
  const elever =
    school.antalElever != null ? ` ${plural(school.antalElever, "elev", "elever")},` : "";

  return {
    title: school.kommun ? `${school.namn} · ${school.kommun}` : school.namn,
    description:
      `${school.namn} —${elever} ${formOrd}${var_} med ${school.huvudman} som huvudman. ` +
      `Nyckeltal, enkätsvar och registeruppgifter ur Skolverkets register.`,
  };
}

const backHref = "/skolor";

/** The most recent läsår among a set of them — they sort as they read. */
function senasteLäsår(läsår: string[]): string {
  return (
    [...läsår]
      .filter((l) => l !== DASH)
      .sort()
      .at(-1) ?? DASH
  );
}

export default async function SkolaPage({
  params,
}: {
  params: Promise<{ kod: string }>;
}) {
  const { kod } = await params;
  const school = await getSkola(kod);
  if (!school) notFound();

  const huvudmanSlug = slugify(school.huvudman);

  const kommunStats = school.kommunkod
    ? await getKommunNyckeltalStats(school.kommunkod, school.skolenhetskod)
    : [];

  // meritvärde/andelGodkända always compare against grundskolans riks-
  // genomsnitt; andelBehöriga/eleverPerLärare compare against whichever
  // skolform the unit's own values are actually sourced from — see
  // primärStatistikskolform. Skolverket has no official endpoint at all for
  // "gy" (only per-program), and no figure ("saknas") for some skolform/
  // nyckeltal combinations it does cover — beräknatRiks fills in an average
  // computed from every unit's own reported nyckeltal for both cases instead
  // of leaving a dash. Which of the two a figure came from is carried through
  // to the page rather than smoothed over: the cards say "(beräknat)".
  // `allt.json` carries no bulk official riksgenomsnitt, so every nyckeltal
  // now compares against `getBeräknatRiksGenomsnitt`'s self-computed average
  // — every card below is "(beräknat)".
  const primärSkolform = primärStatistikskolform(school.skolformer);
  const [beräknatRiks, byggd, koncernIndex] = await Promise.all([
    getBeräknatRiksGenomsnitt(),
    getRegisterByggd(),
    koncernForHuvudmanIndex(),
  ]);
  const beräknatGr = beräknatRiks.perSkolform.get("gr");
  const beräknatÖvriga = primärSkolform
    ? beräknatRiks.perSkolform.get(primärSkolform)
    : undefined;
  const riksFör = (
    beräknat: number | undefined,
    skolform: Skolform | null,
  ): RiksNyckeltal => ({
    tal: beräknat ?? null,
    beräknat: beräknat != null,
    skolform: skolform ? STATISTIKNYCKEL_NAMN[skolform] : null,
  });
  const riksPerKey: Partial<Record<keyof Nyckeltal, RiksNyckeltal>> = {
    meritvärdeÅrskurs9: riksFör(beräknatGr?.meritvärdeÅrskurs9, "gr"),
    andelGodkändaÅrskurs9: riksFör(beräknatGr?.andelGodkändaÅrskurs9, "gr"),
    andelBehörigaLärare: riksFör(beräknatÖvriga?.andelBehörigaLärare, primärSkolform),
    eleverPerLärare: riksFör(beräknatÖvriga?.eleverPerLärare, primärSkolform),
  };

  // `allt.json` carries no bulk official program riksgenomsnitt either — every
  // program comparison falls back to `beräknatRiks.perProgram` below.
  const riksByProgramKod = new Map<string, NationelltProgramGenomsnitt>();

  const hasProgramStats = school.program.length > 0;
  const programComparisons = buildProgramComparisons(
    school.program,
    riksByProgramKod,
    beräknatRiks.perProgram,
  );

  const [skolenkät, dokumentgrupper, kommunEnkätGrupper, riksEnkätGrupper] =
    await Promise.all([
      getSkolenkät(school.skolenhetskod),
      getSkolinspektionDokument(school.skolenhetskod),
      school.kommunkod
        ? getKommunEnkätGenomsnitt(school.kommunkod)
        : Promise.resolve(new Map<string, EnkätGrupp>()),
      getRiksEnkätGenomsnitt(),
    ]);
  const enkätGrupper = buildEnkätComparisons(
    skolenkät,
    kommunEnkätGrupper,
    riksEnkätGrupper,
  );
  const hasEnkätData = enkätGrupper.length > 0;

  const dokumentVyer = buildDokumentVyer(dokumentgrupper);
  const antalDokumentTotalt = antalDokument(dokumentVyer);

  // The register never distinguishes "no årskurs 9" from "not reported" —
  // both come back as a missing value with no läsår. That's the same signal
  // either way says the same thing here: nothing to show for åk 9.
  const merit = school.nyckeltal.meritvärdeÅrskurs9;
  const noGrade9 = merit.status !== "finns" && merit.läsår == null;
  const hideGrade9 = hasProgramStats || noGrade9;
  const GRADE9_KEYS: (keyof Nyckeltal)[] = [
    "meritvärdeÅrskurs9",
    "andelGodkändaÅrskurs9",
  ];

  const nyckeltalRader = buildNyckeltalComparisons(
    school.nyckeltal,
    kommunStats,
    riksPerKey,
  ).filter((r) => !hideGrade9 || !GRADE9_KEYS.includes(r.key));
  const harBeräknatRiks = nyckeltalRader.some((r) => r.beräknatRiks);

  const salsaRader = buildSalsaComparisons(school.salsa);
  const hasSalsaData = salsaRader.length > 0;

  const elevantal = school.antalElever;
  const statistikLäsår = senasteLäsår(nyckeltalRader.map((r) => r.läsår));
  const enkätLäsår = senasteLäsår(enkätGrupper.map((g) => g.läsår));
  const eleverPerLärare =
    nyckeltalRader.find((r) => r.key === "eleverPerLärare")?.value ?? DASH;

  // Just the path from the koncernmoder down to the unit's huvudman — same
  // idea as `/huvudman/[slug]`'s "Ägarstruktur", abbreviated here since the
  // full tree belongs on `/koncern`.
  const koncern = school.huvudmannaOrgnr
    ? koncernIndex.get(school.huvudmannaOrgnr)
    : undefined;
  const kedja =
    koncern && school.huvudmannaOrgnr
      ? (ancestorPath(koncern.träd, school.huvudmannaOrgnr) ?? [])
      : [];
  const koncernSlug = koncern?.koncernNamn ? slugify(koncern.koncernNamn) : null;

  const tabs: TabDef[] = [
    {
      id: "nyckeltal",
      label: "Nyckeltal",
      count: nyckeltalRader.length,
      views: [
        {
          id: "forklarat",
          label: "Förklarat",
          hint: "Varje tal med jämförelse, placering och källa",
          content: (
            <section className="flex flex-col gap-3">
              <BandLegend />
              <NyckeltalCards rader={nyckeltalRader} />
              <NyckeltalKälla beräknat={harBeräknatRiks} />
              {hasSalsaData && (
                <>
                  <h3 className="mt-2 text-base leading-[1.3] font-medium">
                    SALSA — mot förväntat resultat
                  </h3>
                  <SalsaCards rader={salsaRader} />
                  <SalsaKälla />
                </>
              )}
            </section>
          ),
        },
        {
          id: "tabell",
          label: "Tabell",
          hint: "Alla tal i rutnät, utan tolkning",
          content: (
            <section className="flex flex-col gap-2.5">
              <DataTable
                columns={nyckeltalColumns}
                rows={nyckeltalRader}
                rowKey={(r) => r.key}
                label="Nyckeltal"
              />
              <NyckeltalKälla beräknat={harBeräknatRiks} />
            </section>
          ),
        },
      ],
    },
    ...(hasProgramStats
      ? [
          {
            id: "program",
            label: "Program",
            count: programComparisons.length,
            views: [
              {
                id: "forklarat",
                label: "Förklarat",
                hint: "Programmen mot samma program i riket",
                content: <ProgramTable rows={programComparisons} />,
              },
            ],
          },
        ]
      : []),
    ...(hasEnkätData
      ? [
          {
            id: "enkat",
            label: "Enkät",
            count: enkätGrupper.length,
            views: [
              {
                id: "forklarat",
                label: "Förklarat",
                hint: "Varje grupps svar mot kommunen och riket",
                content: (
                  <section className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
                      <p className="text-xs text-ink-subtle">
                        Skolenkäten, skala 1–10 · högre är bättre
                      </p>
                      <BandLegend enheten="gruppens svar" />
                    </div>
                    <EnkatCards grupper={enkätGrupper} />
                  </section>
                ),
              },
              {
                id: "tabell",
                label: "Tabell",
                hint: "Alla svar i rutnät, utan tolkning",
                content: (
                  <section className="flex flex-col gap-2.5">
                    <DataTable
                      columns={enkätColumns}
                      rows={enkätGrupper}
                      rowKey={(r) => r.key}
                      rowHeight={46}
                      label="Enkätsvar"
                    />
                    <p className="text-xs leading-[1.55] text-ink-faint">
                      Talet under varje värde är gruppens avvikelse mot riksgenomsnittet
                      för samma grupp.
                    </p>
                  </section>
                ),
              },
            ],
          },
        ]
      : []),
    ...(antalDokumentTotalt > 0
      ? [
          {
            id: "dokument",
            label: "Dokument",
            count: antalDokumentTotalt,
            views: [
              {
                id: "forklarat",
                label: "Förklarat",
                hint: "Beslut och rapporter från Skolinspektionen",
                content: (
                  <section className="flex flex-col gap-3">
                    <DokumentList grupper={dokumentVyer} />
                    <DokumentKälla />
                  </section>
                ),
              },
            ],
          },
        ]
      : []),
    {
      id: "skoluppgifter",
      label: "Skoluppgifter",
      count: 4,
      views: [
        {
          id: "lista",
          label: "Lista",
          hint: "Registeruppgifter, huvudman, kontakt och källor",
          content: (
            <div className="flex flex-col gap-6">
              <Disclosure title="Skoluppgifter" count={10} defaultOpen>
                <FactList
                  twoColumn
                  items={[
                    [
                      "Skolenhetskod",
                      <span key="k" className="font-mono text-sm">
                        {school.skolenhetskod}
                      </span>,
                    ],
                    ["Kommun", school.kommun ?? DASH],
                    [
                      "Kommunkod",
                      <span key="kk" className="font-mono text-sm">
                        {school.kommunkod ?? DASH}
                      </span>,
                    ],
                    ["Skolform", school.skolformer.join(", ") || site.allaSkolformer],
                    ["Årskurser", formatYears(school.årskurser) || DASH],
                    ["Status i registret", school.status],
                    ["Rektor", school.rektor ?? DASH],
                    [
                      "Startdatum",
                      <span key="s" className="font-mono text-sm">
                        {school.startdatum ?? DASH}
                      </span>,
                    ],
                    ["Elever", elevantal != null ? num(elevantal) : DASH],
                    [
                      "Elever per lärare",
                      <span key="epl" className="font-mono text-sm">
                        {eleverPerLärare}
                      </span>,
                    ],
                  ]}
                />
              </Disclosure>

              <Disclosure title="Huvudman" count={koncern ? kedja.length : 0}>
                <div className="flex flex-col gap-4">
                  <FactList
                    twoColumn
                    items={[
                      [
                        "Huvudman",
                        <Link
                          key="h"
                          href={`/huvudman/${huvudmanSlug}`}
                          className="font-medium text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
                        >
                          {school.huvudman}
                        </Link>,
                      ],
                      ["Huvudmannatyp", school.huvudmannatyp],
                    ]}
                  />
                  {kedja.length ? (
                    <div className="flex flex-wrap items-baseline gap-1.5 text-base">
                      <span className="text-ink-muted">
                        {plural(kedja.length, "led", "led")}
                      </span>
                      {kedja.map((nod, i) => (
                        <span key={nod.orgnr} className="flex items-center gap-1.5">
                          {i > 0 && <span className="text-line-control">→</span>}
                          <span>{nod.namn ?? nod.orgnr}</span>
                        </span>
                      ))}
                      {koncernSlug && (
                        <>
                          <span className="text-line-control">·</span>
                          <Link
                            href={`/koncern/${koncernSlug}`}
                            className="text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
                          >
                            Visa hela kedjan
                          </Link>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-base text-ink-muted">
                      Inget koncernträd registrerat för huvudmannen.
                    </p>
                  )}
                </div>
              </Disclosure>

              <Disclosure title="Kontakt" count={3}>
                <FactList
                  twoColumn
                  items={[
                    [
                      "Besöksadress",
                      school.besöksadress ? (
                        <span key="a" className="block text-right">
                          {school.besöksadress}
                        </span>
                      ) : (
                        DASH
                      ),
                    ],
                    [
                      "Telefon",
                      <span key="t" className="font-mono text-sm">
                        {school.telefon ?? DASH}
                      </span>,
                    ],
                    [
                      "Webbplats",
                      school.webbplats ? (
                        <a
                          key="u"
                          href={school.webbplats}
                          className="text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
                        >
                          Öppna
                        </a>
                      ) : (
                        DASH
                      ),
                    ],
                  ]}
                />
              </Disclosure>

              <Disclosure
                title="Källor"
                count={2 + (hasEnkätData ? 1 : 0) + (antalDokumentTotalt > 0 ? 1 : 0)}
              >
                <FactList
                  twoColumn
                  items={[
                    ["Registeruppgifter", "Skolverkets skolenhetsregister"],
                    [
                      "Nyckeltal",
                      statistikLäsår === DASH
                        ? "Skolverket"
                        : `Skolverket, läsår ${statistikLäsår}`,
                    ],
                    ...(hasEnkätData
                      ? ([
                          [
                            "Enkätsvar",
                            `Skolinspektionens skolenkät, läsår ${enkätLäsår}`,
                          ],
                        ] as [string, string][])
                      : []),
                    ...(antalDokumentTotalt > 0
                      ? ([["Dokument", "Skolinspektionens dokument-API"]] as [
                          string,
                          string,
                        ][])
                      : []),
                  ]}
                />
              </Disclosure>
            </div>
          ),
        },
      ],
    },
  ];

  return (
    <AppShell
      section="/skolor"
      searchAction="/skolor"
      searchPlaceholder={site.search.skolor}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-2.5 border-b border-line-soft px-4 pt-5 pb-[18px] sm:px-6">
          <BackLink href={backHref}>Alla skolenheter</BackLink>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-title leading-[1.1] font-semibold tracking-[-0.015em]">
              {school.namn}
            </h1>
            <StatusPill>{school.status}</StatusPill>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
            <span className="text-base text-ink-muted">{school.kommun ?? DASH}</span>
            <Dot />
            <span className="text-base text-ink-muted">{school.huvudmannatyp}</span>
            <Dot />
            <span className="font-mono text-xs text-ink-subtle">
              Skolenhetskod {school.skolenhetskod}
            </span>
          </div>
        </header>

        <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5 border-b border-line-soft bg-surface-subtle px-4 py-2.5 sm:px-6">
          <span className="text-base text-ink-muted">
            <span className="font-mono text-md font-medium text-ink">
              {elevantal != null ? num(elevantal) : DASH}
            </span>{" "}
            elever
          </span>
          <Dot />
          <span className="text-base text-ink-muted">
            {school.skolformer.join(" · ") || site.allaSkolformer}
          </span>
          <Dot />
          <span className="text-base text-ink-muted">
            Åk{" "}
            <span className="font-mono text-md text-ink">
              {formatYears(school.årskurser) || DASH}
            </span>
          </span>
          <Dot />
          <span className="text-base text-ink-muted">
            {statistikLäsår === DASH ? DASH : `läsår ${statistikLäsår}`}
          </span>
          <div className="flex-1" />
          <Link
            href={`/huvudman/${huvudmanSlug}`}
            className="text-sm text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
          >
            Visa huvudmannen
          </Link>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-6 px-4 pt-5 pb-6 sm:px-6">
          <Tabs tabs={tabs} defaultTab={hasProgramStats ? "program" : "nyckeltal"} />
          {byggd && (
            <p className="font-mono text-micro text-ink-faint">
              {`Data hämtat ${byggd.slice(0, 10)}`}
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
