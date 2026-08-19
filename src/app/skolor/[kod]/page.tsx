import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { site } from "@/config/site";
import { AppShell } from "@/components/layout/AppShell";
import { DataTable } from "@/components/ui/DataTable";
import {
  BackLink,
  ButtonLink,
  FactList,
  MetaField,
  RailSection,
  Stat,
  StatFacts,
  StatGrid,
  StatusPill,
} from "@/components/ui/primitives";
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
  getBeräknatRiksGenomsnitt,
  getKommunEnkätGenomsnitt,
  getKommunNyckeltalStats,
  getRegisterByggd,
  getRiksEnkätGenomsnitt,
  getSkola,
  getSkolenkät,
  getSkolinspektionDokument,
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
  const [beräknatRiks, byggd] = await Promise.all([
    getBeräknatRiksGenomsnitt(),
    getRegisterByggd(),
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
          {/*
            The fields that identify the unit, each under its own label. They
            used to run together on one line separated by dots, which reads as
            a sentence you have to parse rather than four facts you can find.
          */}
          <div className="flex flex-wrap gap-x-9 gap-y-3 pt-0.5">
            <MetaField label="Huvudman">
              <Link
                href={`/huvudman/${huvudmanSlug}`}
                className="font-medium text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
              >
                {school.huvudman}
              </Link>
            </MetaField>
            <MetaField label="Skolformer">
              {school.skolformer.join(", ") || site.allaSkolformer}
            </MetaField>
            <MetaField label="Årskurser">
              {formatYears(school.årskurser) || DASH}
            </MetaField>
            <MetaField label="Kommun">{school.kommun ?? DASH}</MetaField>
            <MetaField label="Skolenhetskod">
              <span className="font-mono text-sm">{school.skolenhetskod}</span>
            </MetaField>
          </div>
        </header>

        <StatGrid min={220}>
          {/*
            Some gymnasieskolor report no unit-wide elevantal but do report one
            per programme; summing those beats a dash. When neither exists the
            tile says so rather than captioning an empty figure with a note
            about where it came from.
          */}
          <Stat
            label="Elever"
            value={elevantal != null ? num(elevantal) : DASH}
            unit={elevantal != null ? "elever" : undefined}
            note={
              school.antalEleverKälla === "rapporterat"
                ? "Avrundat av Skolverket. Fritidshem räknas inte in."
                : school.antalEleverKälla === "summerat"
                  ? "Summerat från programmens elevantal."
                  : "Skolverket redovisar inget elevantal för enheten."
            }
          />
          <StatFacts
            label="Aktualitet"
            items={[
              ["Statistik", statistikLäsår === DASH ? DASH : `läsår ${statistikLäsår}`],
              ...(hasEnkätData ? ([["Enkät", enkätLäsår]] as [string, string][]) : []),
              ["Hämtat från API", byggd ? byggd.slice(0, 10) : DASH],
            ]}
          />
          <Stat
            label="Huvudmannatyp"
            value={school.huvudmannatyp}
            sans
            note={`Driven av ${school.huvudman}`}
          />
        </StatGrid>

        <div className="flex flex-col lg:flex-row lg:items-stretch">
          <div className="flex min-w-0 flex-1 flex-col gap-6 px-4 pt-5 pb-6 sm:px-6">
            <Tabs tabs={tabs} defaultTab={hasProgramStats ? "program" : "nyckeltal"} />
          </div>

          <aside className="flex w-full flex-col gap-[22px] border-t border-line-soft bg-surface-panel p-5 lg:w-[300px] lg:flex-none lg:border-t-0 lg:border-l">
            <RailSection title="Så läser du sidan" divided={false}>
              <p className="text-base leading-[1.55] text-ink-muted">
                Varje tal är enhetens eget, rapporterat till Skolverket. Färgen visar bara
                hur talet ligger mot riksgenomsnittet — den är inte ett betyg.
              </p>
              <p className="text-base leading-[1.55] text-ink-muted">
                Byt till <strong className="font-semibold">Tabell</strong> för alla tal i
                rutnät utan tolkning.
              </p>
            </RailSection>

            <RailSection title="Registeruppgifter">
              <FactList
                items={[
                  [
                    "Skolenhetskod",
                    <span key="k" className="font-mono text-sm">
                      {school.skolenhetskod}
                    </span>,
                  ],
                  [
                    "Kommunkod",
                    <span key="kk" className="font-mono text-sm">
                      {school.kommunkod ?? DASH}
                    </span>,
                  ],
                  ["Huvudmannatyp", school.huvudmannatyp],
                  ["Status i registret", school.status],
                  ["Rektor", school.rektor ?? DASH],
                  [
                    "Startdatum",
                    <span key="s" className="font-mono text-sm">
                      {school.startdatum ?? DASH}
                    </span>,
                  ],
                ]}
              />
            </RailSection>

            <RailSection title="Kontakt">
              <FactList
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
            </RailSection>

            <div className="mt-auto flex flex-col gap-2">
              <ButtonLink href={`/huvudman/${huvudmanSlug}`}>Visa huvudmannen</ButtonLink>
              {byggd && (
                <p className="text-center font-mono text-micro text-ink-faint">
                  {`Data hämtat ${byggd.slice(0, 10)}`}
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
