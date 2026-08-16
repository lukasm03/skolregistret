import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { site } from "@/config/site";
import { AppShell } from "@/components/layout/AppShell";
import { DataTable } from "@/components/ui/DataTable";
import {
  BackLink,
  ButtonLink,
  Dot,
  FactList,
  RailSection,
  SectionTitle,
  Stat,
  StatGrid,
  StatusPill,
} from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/Tabs";
import { dokumentColumns, type DokumentRow } from "@/components/tables/dokumentColumns";
import {
  enkätColumns,
  enkätGenomsnittRow,
  enkätRow,
  type EnkätRow,
} from "@/components/tables/enkatColumns";
import {
  nyckeltalColumns,
  nyckeltalDisplayRows,
  nyckeltalRows,
} from "@/components/tables/nyckeltalColumns";
import {
  programColumns,
  programGenomsnittRow,
  programRow,
  sumProgramElever,
  type ProgramRow,
} from "@/components/tables/programColumns";
import { DASH, bytes, kommunLong, num, plural, slugify } from "@/lib/format";
import { formatYears } from "@/lib/skolverket/parse";
import {
  enkätGruppKey,
  getBeräknatRiksGenomsnitt,
  getKommunEnkätGenomsnitt,
  getKommunNyckeltalStats,
  getNationelltGenomsnitt,
  getNationelltProgramGenomsnitt,
  getRegisterByggd,
  getRiksEnkätGenomsnitt,
  getSkola,
  getSkolenkät,
  getSkolinspektionDokument,
  listSkolor,
  primärStatistikskolform,
  type EnkätGrupp,
  type NationelltProgramGenomsnitt,
  type Nyckeltal,
  type NyckeltalVärde,
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
  // of leaving a dash.
  const primärSkolform = primärStatistikskolform(school.skolformer);
  const [grRiks, primärRiks, beräknatRiks, byggd] = await Promise.all([
    getNationelltGenomsnitt("gr"),
    primärSkolform && primärSkolform !== "gr" && primärSkolform !== "gy"
      ? getNationelltGenomsnitt(primärSkolform)
      : Promise.resolve(null),
    getBeräknatRiksGenomsnitt(),
    getRegisterByggd(),
  ]);
  const övrigaRiks = primärSkolform === "gr" ? grRiks : primärRiks;
  const beräknatGr = beräknatRiks.perSkolform.get("gr");
  const beräknatÖvriga = primärSkolform
    ? beräknatRiks.perSkolform.get(primärSkolform)
    : undefined;
  const riksTal = (
    officiell: NyckeltalVärde | undefined,
    beräknat: number | undefined,
  ): number | undefined => (officiell?.status === "finns" ? officiell.tal : beräknat);
  const riksNyckeltal: Partial<Record<keyof Nyckeltal, number>> = {
    meritvärdeÅrskurs9: riksTal(
      grRiks?.nyckeltal.meritvärdeÅrskurs9,
      beräknatGr?.meritvärdeÅrskurs9,
    ),
    andelGodkändaÅrskurs9: riksTal(
      grRiks?.nyckeltal.andelGodkändaÅrskurs9,
      beräknatGr?.andelGodkändaÅrskurs9,
    ),
    andelBehörigaLärare: riksTal(
      övrigaRiks?.nyckeltal.andelBehörigaLärare,
      beräknatÖvriga?.andelBehörigaLärare,
    ),
    eleverPerLärare: riksTal(
      övrigaRiks?.nyckeltal.eleverPerLärare,
      beräknatÖvriga?.eleverPerLärare,
    ),
  };

  const programRiks = await Promise.all(
    school.program.map((p) => getNationelltProgramGenomsnitt(p.kod)),
  );
  const riksByProgramKod = new Map(
    school.program
      .map((p, i) => [p.kod, programRiks[i]] as const)
      .filter(
        (entry): entry is [string, NationelltProgramGenomsnitt] => entry[1] != null,
      ),
  );

  const hasProgramStats = school.program.length > 0;
  const programRows: ProgramRow[] = school.program
    .flatMap((p) => [
      programRow(p),
      programGenomsnittRow(p, riksByProgramKod, beräknatRiks.perProgram),
    ])
    .filter((r): r is ProgramRow => r != null);

  const [skolenkät, dokumentgrupper, kommunEnkätGrupper, riksEnkätGrupper] =
    await Promise.all([
      getSkolenkät(school.skolenhetskod),
      getSkolinspektionDokument(school.skolenhetskod),
      school.kommunkod
        ? getKommunEnkätGenomsnitt(school.kommunkod)
        : Promise.resolve(new Map<string, EnkätGrupp>()),
      getRiksEnkätGenomsnitt(),
    ]);
  const enkätRows = [
    ...skolenkät.vårdnadshavare.flatMap((e, i) => {
      const gruppKey = enkätGruppKey(e.skolform);
      return [
        enkätRow(`v-${i}`, `Vårdnadshavare · ${e.skolform}`, e),
        enkätGenomsnittRow(
          `v-${i}-kommun`,
          "Kommunsnitt",
          kommunEnkätGrupper.get(gruppKey),
        ),
        enkätGenomsnittRow(
          `v-${i}-riks`,
          "Riksgenomsnitt",
          riksEnkätGrupper.get(gruppKey),
        ),
      ];
    }),
    ...skolenkät.elever.flatMap((e, i) => {
      const gruppKey = enkätGruppKey(e.skolform, e.årskurs);
      return [
        enkätRow(
          `e-${i}`,
          `Elev · ${e.skolform}${e.årskurs ? ` åk ${e.årskurs}` : ""}`,
          e,
        ),
        enkätGenomsnittRow(
          `e-${i}-kommun`,
          "Kommunsnitt",
          kommunEnkätGrupper.get(gruppKey),
        ),
        enkätGenomsnittRow(
          `e-${i}-riks`,
          "Riksgenomsnitt",
          riksEnkätGrupper.get(gruppKey),
        ),
      ];
    }),
  ].filter((r): r is EnkätRow => r != null);
  const hasEnkätData = skolenkät.vårdnadshavare.length + skolenkät.elever.length > 0;

  const dokumentRows: DokumentRow[] = dokumentgrupper.flatMap((grupp) =>
    grupp.dokument.map((d, i) => ({
      key: `${grupp.skolform}-${d.typId}-${i}`,
      skolform: grupp.skolform,
      typ: d.typ,
      titel: d.titel,
      storlek: bytes(d.storlekBytes),
      url: d.url,
    })),
  );
  const hasDokument = dokumentRows.length > 0;

  // The register never distinguishes "no årskurs 9" from "not reported" —
  // both come back as a missing value with no läsår. That's the same signal
  // either way says the same thing here: nothing to show for åk 9.
  const merit = school.nyckeltal.meritvärdeÅrskurs9;
  const noGrade9 = merit.status !== "finns" && merit.läsår == null;
  const hideGrade9Rows = hasProgramStats || noGrade9;
  const GRADE9_KEYS: (keyof Nyckeltal)[] = [
    "meritvärdeÅrskurs9",
    "andelGodkändaÅrskurs9",
  ];

  const allRows = nyckeltalRows(school.nyckeltal, kommunStats, riksNyckeltal);
  const rows = hideGrade9Rows
    ? allRows.filter((r) => !GRADE9_KEYS.includes(r.key))
    : allRows;
  const headline = allRows
    .filter((r) =>
      hideGrade9Rows ? !GRADE9_KEYS.includes(r.key) : r.key !== "meritvärdeÅrskurs9",
    )
    .slice(0, 2);

  return (
    <AppShell
      section="/skolor"
      searchAction="/skolor"
      searchPlaceholder={site.search.skolor}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-start gap-5 border-b border-line-soft px-6 pt-5 pb-[18px]">
          <div className="flex min-w-0 flex-col gap-2">
            <BackLink href={backHref}>Alla skolenheter</BackLink>
            <h1 className="text-title leading-[1.15] font-semibold tracking-[-0.015em]">
              {school.namn}
            </h1>
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusPill>{school.status}</StatusPill>
              <span className="text-base text-ink-muted">Huvudman</span>
              <Link
                href={`/huvudman/${huvudmanSlug}`}
                className="text-base font-medium text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
              >
                {school.huvudman}
              </Link>
              <Dot />
              <span className="text-base text-ink-muted">
                {school.skolformer.join(" · ") || site.allaSkolformer}
              </span>
              <Dot />
              <span className="font-mono text-xs text-ink-subtle">
                Skolenhetskod {school.skolenhetskod}
              </span>
            </div>
          </div>
          <div className="flex-1" />
        </header>

        <StatGrid columns={4}>
          <Stat
            label="Elever"
            value={
              school.antalElever != null
                ? num(school.antalElever)
                : num(sumProgramElever(school.program))
            }
            note={
              school.antalElever != null
                ? "avrundat av Skolverket"
                : "summerat från programmens elevantal"
            }
          />
          {headline.map((r) => (
            <Stat
              key={r.key}
              label={r.label}
              value={r.value}
              note={r.läsår !== DASH ? `läsår ${r.läsår}` : (r.note ?? undefined)}
            />
          ))}
          <Stat
            label="Huvudmannatyp"
            value={school.huvudmannatyp}
            note={school.huvudman}
          />
        </StatGrid>

        <div className="flex items-stretch">
          <div className="flex min-w-0 flex-1 flex-col gap-6 px-6 pt-5 pb-6">
            {(() => {
              const tabs = [
                ...(hasProgramStats
                  ? [
                      {
                        id: "program",
                        label: "Program",
                        content: (
                          <section className="flex flex-col gap-2.5">
                            <SectionTitle>Program</SectionTitle>
                            <DataTable
                              columns={programColumns}
                              rows={programRows}
                              rowKey={(r) => r.key}
                            />
                          </section>
                        ),
                      },
                    ]
                  : []),
                {
                  id: "nyckeltal",
                  label: "Nyckeltal",
                  content: (
                    <DataTable
                      columns={nyckeltalColumns}
                      rows={nyckeltalDisplayRows(rows)}
                      rowKey={(r) => r.key}
                    />
                  ),
                },
                ...(hasEnkätData
                  ? [
                      {
                        id: "enkat",
                        label: "Enkät",
                        content: (
                          <DataTable
                            columns={enkätColumns}
                            rows={enkätRows}
                            rowKey={(r) => r.key}
                          />
                        ),
                      },
                    ]
                  : []),
                ...(hasDokument
                  ? [
                      {
                        id: "dokument",
                        label: "Dokument",
                        content: (
                          <DataTable
                            columns={dokumentColumns}
                            rows={dokumentRows}
                            rowKey={(r) => r.key}
                          />
                        ),
                      },
                    ]
                  : []),
              ];
              return tabs.length > 1 ? (
                <Tabs defaultTab={tabs[0]!.id} tabs={tabs} />
              ) : (
                <section className="flex flex-col gap-2.5">
                  <SectionTitle>Nyckeltal</SectionTitle>
                  {tabs[0]!.content}
                </section>
              );
            })()}
          </div>

          <aside className="flex w-[300px] flex-none flex-col gap-[22px] border-l border-line-soft bg-surface-panel p-5">
            <RailSection title="Registeruppgifter" divided={false}>
              <FactList
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
                  ["Skolformer", school.skolformer.join(", ") || DASH],
                  // An empty list means Skolverket reports no årskurser for
                  // this unit's skolformer — a dash, never "0 årskurser".
                  ["Årskurser", formatYears(school.årskurser) || DASH],
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
