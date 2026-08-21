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
import { getSkolaDetaljVy } from "@/lib/skola-detalj";
import { DASH, kommunLong, num, plural } from "@/lib/format";
import { formatYears } from "@/lib/skolverket/parse";
import { getRegisterByggd, getSkola, listSkolor } from "@/lib/skolregister";

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

export default async function SkolaPage({
  params,
}: {
  params: Promise<{ kod: string }>;
}) {
  const { kod } = await params;
  const school = await getSkola(kod);
  if (!school) notFound();

  // Every comparison on the page — which riksgenomsnitt pairs with which
  // nyckeltal, the "(beräknat)" caveat, the åk 9 hiding rule, the läsår
  // lines, the koncern chain — is decided in `lib/skola-detalj.ts`. What is
  // left here is lookup and layout.
  const [vy, byggd] = await Promise.all([getSkolaDetaljVy(school), getRegisterByggd()]);
  const {
    nyckeltal: nyckeltalRader,
    harBeräknatRiks,
    program: programComparisons,
    harProgram: hasProgramStats,
    enkät: enkätGrupper,
    harEnkät: hasEnkätData,
    dokument: dokumentVyer,
    antalDokumentTotalt,
    salsa: salsaRader,
    harSalsa: hasSalsaData,
    statistikLäsår,
    enkätLäsår,
    eleverPerLärare,
    huvudmanSlug,
    koncern,
    kedja,
    koncernSlug,
  } = vy;

  const elevantal = school.antalElever;

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
                  <h2 className="mt-2 text-base leading-[1.3] font-medium">
                    SALSA — mot förväntat resultat
                  </h2>
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
            <h1 className="text-title leading-[1.1] font-semibold tracking-[-0.015em] text-balance">
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
