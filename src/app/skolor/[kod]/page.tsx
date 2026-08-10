import Link from "next/link";
import { notFound } from "next/navigation";
import { site } from "@/config/site";
import { AppShell } from "@/components/layout/AppShell";
import { DataTable, type Column } from "@/components/ui/DataTable";
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
import { DASH, dec, num, slugify } from "@/lib/format";
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
  type Elevenkät,
  type EnkätGrupp,
  type Enkätfråga,
  type KommunNyckeltalStat,
  type NationelltProgramGenomsnitt,
  type Nyckeltal,
  type NyckeltalVärde,
  type ProgramNyckeltalKey,
  type SkolaProgram,
  type Vårdnadshavarenkät,
} from "@/lib/skolregister-api";

interface NyckeltalRow {
  key: keyof Nyckeltal;
  label: string;
  value: string;
  läsår: string;
  note: string | null;
  kommunsnitt: string;
  placering: string;
  riksgenomsnitt: string;
}

const NYCKELTAL_LABELS: Record<keyof Nyckeltal, string> = {
  meritvärdeÅrskurs9: "Meritvärde, årskurs 9",
  andelGodkändaÅrskurs9: "Andel godkända, årskurs 9",
  andelBehörigaLärare: "Andel behöriga lärare",
  eleverPerLärare: "Elever per lärare",
};

function nyckeltalRows(
  nyckeltal: Nyckeltal,
  kommunStats: KommunNyckeltalStat[],
  riksNyckeltal: Partial<Record<keyof Nyckeltal, number>>,
): NyckeltalRow[] {
  const statsByKey = new Map(kommunStats.map((s) => [s.key, s]));
  return (Object.keys(NYCKELTAL_LABELS) as (keyof Nyckeltal)[]).map((key) => {
    const v = nyckeltal[key];
    const stat = statsByKey.get(key);
    const kommunsnitt = stat?.genomsnitt != null ? dec(stat.genomsnitt) : DASH;
    const placering = stat?.rank != null ? `${stat.rank} av ${stat.antalRankade}` : DASH;
    const riks = riksNyckeltal[key];
    const riksgenomsnitt = riks != null ? dec(riks) : DASH;
    return v.status === "finns"
      ? {
          key,
          label: NYCKELTAL_LABELS[key],
          value: v.text,
          läsår: v.läsår,
          note: null,
          kommunsnitt,
          placering,
          riksgenomsnitt,
        }
      : {
          key,
          label: NYCKELTAL_LABELS[key],
          value: DASH,
          läsår: v.läsår ?? DASH,
          note: v.förklaring,
          kommunsnitt,
          placering: DASH,
          riksgenomsnitt,
        };
  });
}

/** `metric`'s counterpart for a live-API `NyckeltalVärde` — always the register's own string. */
function programValue(v: NyckeltalVärde): string {
  return v.status === "finns" ? v.text : DASH;
}

/**
 * Elevantalet, as a plain number rather than Skolverket's rounded "cirka 330"
 * — the register's own text is kept in `programValue` for the other columns,
 * but a headcount reads better bare in a table this dense.
 */
function programElevCount(v: NyckeltalVärde): string {
  return v.status === "finns" && v.tal != null ? num(v.tal) : DASH;
}

/**
 * Some gymnasieskolor report no unit-wide elevantal but do report one per
 * program — summing those gives an approximate total instead of a dash.
 * `null` when no program has a figure to sum.
 */
function sumProgramElever(program: SkolaProgram[]): number | null {
  const values = program
    .map((p) => p.antalElever)
    .filter((v): v is Extract<NyckeltalVärde, { status: "finns" }> => v.status === "finns")
    .map((v) => v.tal);
  return values.length ? values.reduce((sum, v) => sum + v, 0) : null;
}

/**
 * The national average text for a program metric: Skolverket's own rounded
 * string when its endpoint has it, otherwise our own computed average across
 * every unit running the program — formatted to one decimal since it isn't
 * the register's own rounded text.
 */
function programRiksText(
  officiell: NyckeltalVärde | undefined,
  beräknat: number | undefined,
): string | null {
  if (officiell?.status === "finns") return officiell.text;
  return beräknat != null ? dec(beräknat) : null;
}

interface ProgramRow {
  key: string;
  namn: string;
  antalElever: string;
  lägstaAntagningspoäng: string;
  genomsnittligAntagningspoäng: string;
  andelMedExamenInom3År: string;
  betygspoängMedExamen: string;
  andelMedHögskolebehörighet: string;
  /** Riks-genomsnitt row for the program above it, styled as a quieter comparison line. */
  muted?: boolean;
}

function programRow(p: SkolaProgram): ProgramRow {
  return {
    key: p.kod,
    namn: p.namn,
    antalElever: programElevCount(p.antalElever),
    lägstaAntagningspoäng: programValue(p.nyckeltal.lägstaAntagningspoäng),
    genomsnittligAntagningspoäng: programValue(p.nyckeltal.genomsnittligAntagningspoäng),
    andelMedExamenInom3År: programValue(p.nyckeltal.andelMedExamenInom3År),
    betygspoängMedExamen: programValue(p.nyckeltal.betygspoängMedExamen),
    andelMedHögskolebehörighet: programValue(p.nyckeltal.andelMedHögskolebehörighet),
  };
}

/** `null` when the program has no national average for any column, so the caller can drop the row entirely. */
function programGenomsnittRow(
  p: SkolaProgram,
  riksByKod: Map<string, NationelltProgramGenomsnitt>,
  beräknatProgram: Map<string, Partial<Record<ProgramNyckeltalKey, number>>>,
): ProgramRow | null {
  const riksText = (key: ProgramNyckeltalKey) =>
    programRiksText(riksByKod.get(p.kod)?.nyckeltal[key], beräknatProgram.get(p.kod)?.[key]);
  const antalElever = riksText("antalElever");
  const lägstaAntagningspoäng = riksText("lägstaAntagningspoäng");
  const genomsnittligAntagningspoäng = riksText("genomsnittligAntagningspoäng");
  const andelMedExamenInom3År = riksText("andelMedExamenInom3År");
  const betygspoängMedExamen = riksText("betygspoängMedExamen");
  const andelMedHögskolebehörighet = riksText("andelMedHögskolebehörighet");
  if (
    [
      antalElever,
      lägstaAntagningspoäng,
      genomsnittligAntagningspoäng,
      andelMedExamenInom3År,
      betygspoängMedExamen,
      andelMedHögskolebehörighet,
    ].every((v) => v == null)
  )
    return null;
  return {
    key: `${p.kod}-riks`,
    namn: "Riksgenomsnitt",
    antalElever: antalElever ?? DASH,
    lägstaAntagningspoäng: lägstaAntagningspoäng ?? DASH,
    genomsnittligAntagningspoäng: genomsnittligAntagningspoäng ?? DASH,
    andelMedExamenInom3År: andelMedExamenInom3År ?? DASH,
    betygspoängMedExamen: betygspoängMedExamen ?? DASH,
    andelMedHögskolebehörighet: andelMedHögskolebehörighet ?? DASH,
    muted: true,
  };
}

function programCell(value: string, muted: boolean | undefined) {
  return muted ? <span className="text-ink-muted">{value}</span> : value;
}

const programColumns: Column<ProgramRow>[] = [
  {
    key: "namn",
    header: "Program",
    cell: (r) => (
      <span className={r.muted ? "pl-4 text-sm text-ink-muted" : undefined}>{r.namn}</span>
    ),
    truncate: true,
  },
  {
    key: "antalElever",
    header: "Elever",
    width: 76,
    align: "right",
    mono: true,
    cell: (r) => programCell(r.antalElever, r.muted),
  },
  {
    key: "lägstaAntagningspoäng",
    header: "Lägsta poäng",
    width: 108,
    align: "right",
    mono: true,
    cell: (r) => programCell(r.lägstaAntagningspoäng, r.muted),
  },
  {
    key: "genomsnittligAntagningspoäng",
    header: "Medelpoäng",
    width: 108,
    align: "right",
    mono: true,
    cell: (r) => programCell(r.genomsnittligAntagningspoäng, r.muted),
  },
  {
    key: "andelMedExamenInom3År",
    header: "Examen 3 år",
    width: 108,
    align: "right",
    mono: true,
    cell: (r) => programCell(r.andelMedExamenInom3År, r.muted),
  },
  {
    key: "betygspoängMedExamen",
    header: "Betygspoäng",
    width: 108,
    align: "right",
    mono: true,
    cell: (r) => programCell(r.betygspoängMedExamen, r.muted),
  },
  {
    key: "andelMedHögskolebehörighet",
    header: "Högsk.behörighet",
    width: 128,
    align: "right",
    mono: true,
    cell: (r) => programCell(r.andelMedHögskolebehörighet, r.muted),
  },
];

interface EnkätRow {
  key: string;
  grupp: string;
  läsår: string;
  antalSvar: string;
  nöjdhet: string;
  trygghet: string;
  studiero: string;
  stöd: string;
  stimulans: string;
  /** Kommunsnitt/riksgenomsnitt rows, styled as a quieter comparison line rather than a unit's own answers. */
  muted?: boolean;
}

function frågaGenomsnitt(f: Enkätfråga | null): string {
  return f?.genomsnitt != null ? dec(f.genomsnitt) : DASH;
}

function enkätRow(
  key: string,
  grupp: string,
  e: Vårdnadshavarenkät | Elevenkät,
): EnkätRow {
  return {
    key,
    grupp,
    läsår: e.läsår ?? DASH,
    antalSvar: e.antalSvar != null ? num(e.antalSvar) : DASH,
    nöjdhet: frågaGenomsnitt(e.nöjdhet),
    trygghet: frågaGenomsnitt(e.trygghet),
    studiero: frågaGenomsnitt(e.studiero),
    stöd: frågaGenomsnitt(e.stöd),
    stimulans: frågaGenomsnitt(e.stimulans),
  };
}

/** `null` when the grupp has no schools to average, so the caller can drop the row entirely. */
function enkätGenomsnittRow(key: string, grupp: string, g: EnkätGrupp | undefined): EnkätRow | null {
  if (!g || Object.values(g.genomsnitt).every((v) => v == null)) return null;
  const val = (k: keyof EnkätGrupp["genomsnitt"]) =>
    g.genomsnitt[k] != null ? dec(g.genomsnitt[k]!) : DASH;
  return {
    key,
    grupp,
    läsår: g.läsår ?? DASH,
    antalSvar: g.antalSvar != null ? dec(g.antalSvar) : DASH,
    nöjdhet: val("nöjdhet"),
    trygghet: val("trygghet"),
    studiero: val("studiero"),
    stöd: val("stöd"),
    stimulans: val("stimulans"),
    muted: true,
  };
}

function enkätCell(value: string, muted: boolean | undefined) {
  return muted ? <span className="text-ink-muted">{value}</span> : value;
}

const enkätColumns: Column<EnkätRow>[] = [
  {
    key: "grupp",
    header: "Enkät",
    cell: (r) => (
      <span className={r.muted ? "pl-4 text-sm text-ink-muted" : undefined}>{r.grupp}</span>
    ),
    truncate: true,
  },
  { key: "läsår", header: "Läsår", width: 82, mono: true, cell: (r) => enkätCell(r.läsår, r.muted) },
  {
    key: "antalSvar",
    header: "Antal svar",
    width: 96,
    align: "right",
    mono: true,
    cell: (r) => enkätCell(r.antalSvar, r.muted),
  },
  {
    key: "nöjdhet",
    header: "Nöjdhet",
    width: 96,
    align: "right",
    mono: true,
    cell: (r) => enkätCell(r.nöjdhet, r.muted),
  },
  {
    key: "trygghet",
    header: "Trygghet",
    width: 96,
    align: "right",
    mono: true,
    cell: (r) => enkätCell(r.trygghet, r.muted),
  },
  {
    key: "studiero",
    header: "Studiero",
    width: 96,
    align: "right",
    mono: true,
    cell: (r) => enkätCell(r.studiero, r.muted),
  },
  {
    key: "stöd",
    header: "Stöd",
    width: 96,
    align: "right",
    mono: true,
    cell: (r) => enkätCell(r.stöd, r.muted),
  },
  {
    key: "stimulans",
    header: "Stimulans",
    width: 96,
    align: "right",
    mono: true,
    cell: (r) => enkätCell(r.stimulans, r.muted),
  },
];

interface DokumentRow {
  key: string;
  skolform: string;
  typ: string;
  titel: string;
  storlek: string;
  url: string;
}

/** Byte count as the register reports it, rendered as a compact "128 kB" / "2,4 MB". */
function storlek(bytes: number | null): string {
  if (bytes == null) return DASH;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} kB` : `${dec(kb / 1024)} MB`;
}

const dokumentColumns: Column<DokumentRow>[] = [
  { key: "skolform", header: "Skolform", width: 160, muted: true, cell: (r) => r.skolform },
  { key: "typ", header: "Typ", width: 220, cell: (r) => r.typ, truncate: true },
  {
    key: "titel",
    header: "Titel",
    cell: (r) => (
      <a
        href={r.url}
        target="_blank"
        rel="noreferrer"
        className="text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
      >
        {r.titel}
      </a>
    ),
    truncate: true,
  },
  { key: "storlek", header: "Storlek", width: 88, align: "right", mono: true, muted: true, cell: (r) => r.storlek },
];

interface NyckeltalDisplayRow {
  key: string;
  label: string;
  läsår: string;
  value: string;
  placering: string;
  note: string | null;
  /** Riksgenomsnitt/kommunsnitt row for the metric above it, styled as a quieter comparison line. */
  muted?: boolean;
}

/** Expands one metric into its own data row followed by muted riks-/kommunsnitt comparison rows. */
function nyckeltalDisplayRows(rows: NyckeltalRow[]): NyckeltalDisplayRow[] {
  return rows.flatMap((r) => {
    const main: NyckeltalDisplayRow = {
      key: r.key,
      label: r.label,
      läsår: r.läsår,
      value: r.value,
      placering: r.placering,
      note: r.note,
    };
    const riks: NyckeltalDisplayRow | null =
      r.riksgenomsnitt !== DASH
        ? {
            key: `${r.key}-riks`,
            label: "Riksgenomsnitt",
            läsår: DASH,
            value: r.riksgenomsnitt,
            placering: DASH,
            note: null,
            muted: true,
          }
        : null;
    const kommun: NyckeltalDisplayRow | null =
      r.kommunsnitt !== DASH
        ? {
            key: `${r.key}-kommun`,
            label: "Kommunsnitt",
            läsår: DASH,
            value: r.kommunsnitt,
            placering: DASH,
            note: null,
            muted: true,
          }
        : null;
    return [main, riks, kommun].filter((row): row is NyckeltalDisplayRow => row != null);
  });
}

function nyckeltalValueCell(value: string, muted: boolean | undefined) {
  return muted ? <span className="text-ink-muted">{value}</span> : <span className="font-medium">{value}</span>;
}

const nyckeltalColumns: Column<NyckeltalDisplayRow>[] = [
  {
    key: "label",
    header: "Mått",
    cell: (r) => (
      <span
        className={`flex items-baseline gap-2 ${r.muted ? "pl-4 text-sm text-ink-muted" : ""}`}
      >
        {r.label}
        {r.note && <span className="text-xs text-ink-faint">{r.note}</span>}
      </span>
    ),
  },
  { key: "läsår", header: "Läsår", width: 82, mono: true, muted: true, cell: (r) => r.läsår },
  {
    key: "value",
    header: "Värde",
    width: 108,
    align: "right",
    mono: true,
    cell: (r) => nyckeltalValueCell(r.value, r.muted),
  },
  {
    key: "placering",
    header: "Placering i kommunen",
    width: 132,
    align: "right",
    mono: true,
    muted: true,
    cell: (r) => r.placering,
  },
];

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

const backHref = "/skolor";

export default async function SkolaPage({
  params,
}: {
  params: Promise<{ kod: string }>;
}) {
  const { kod } = await params;
  const school = await getSkola(kod);
  if (!school) notFound();

  const kommun = school.kommun ?? site.scope.kommun;
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
  const beräknatÖvriga = primärSkolform ? beräknatRiks.perSkolform.get(primärSkolform) : undefined;
  const riksTal = (
    officiell: NyckeltalVärde | undefined,
    beräknat: number | undefined,
  ): number | undefined => (officiell?.status === "finns" ? officiell.tal : beräknat);
  const riksNyckeltal: Partial<Record<keyof Nyckeltal, number>> = {
    meritvärdeÅrskurs9: riksTal(grRiks?.nyckeltal.meritvärdeÅrskurs9, beräknatGr?.meritvärdeÅrskurs9),
    andelGodkändaÅrskurs9: riksTal(
      grRiks?.nyckeltal.andelGodkändaÅrskurs9,
      beräknatGr?.andelGodkändaÅrskurs9,
    ),
    andelBehörigaLärare: riksTal(
      övrigaRiks?.nyckeltal.andelBehörigaLärare,
      beräknatÖvriga?.andelBehörigaLärare,
    ),
    eleverPerLärare: riksTal(övrigaRiks?.nyckeltal.eleverPerLärare, beräknatÖvriga?.eleverPerLärare),
  };

  const programRiks = await Promise.all(
    school.program.map((p) => getNationelltProgramGenomsnitt(p.kod)),
  );
  const riksByProgramKod = new Map(
    school.program
      .map((p, i) => [p.kod, programRiks[i]] as const)
      .filter((entry): entry is [string, NationelltProgramGenomsnitt] => entry[1] != null),
  );

  const hasProgramStats = school.program.length > 0;
  const programRows: ProgramRow[] = school.program
    .flatMap((p) => [
      programRow(p),
      programGenomsnittRow(p, riksByProgramKod, beräknatRiks.perProgram),
    ])
    .filter((r): r is ProgramRow => r != null);

  const [skolenkät, dokumentgrupper, kommunEnkätGrupper, riksEnkätGrupper] = await Promise.all([
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
        enkätGenomsnittRow(`v-${i}-kommun`, "Kommunsnitt", kommunEnkätGrupper.get(gruppKey)),
        enkätGenomsnittRow(`v-${i}-riks`, "Riksgenomsnitt", riksEnkätGrupper.get(gruppKey)),
      ];
    }),
    ...skolenkät.elever.flatMap((e, i) => {
      const gruppKey = enkätGruppKey(e.skolform, e.årskurs);
      return [
        enkätRow(`e-${i}`, `Elev · ${e.skolform}${e.årskurs ? ` åk ${e.årskurs}` : ""}`, e),
        enkätGenomsnittRow(`e-${i}-kommun`, "Kommunsnitt", kommunEnkätGrupper.get(gruppKey)),
        enkätGenomsnittRow(`e-${i}-riks`, "Riksgenomsnitt", riksEnkätGrupper.get(gruppKey)),
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
      storlek: storlek(d.storlekBytes),
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
    .filter((r) => (hideGrade9Rows ? !GRADE9_KEYS.includes(r.key) : r.key !== "meritvärdeÅrskurs9"))
    .slice(0, 2);

  return (
    <AppShell
      section="/skolor"
      crumbs={[
        { label: kommun, href: backHref },
        { label: school.namn },
      ]}
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
            <Stat key={r.key} label={r.label} value={r.value} note={r.läsår !== DASH ? `läsår ${r.läsår}` : (r.note ?? undefined)} />
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
                          <DataTable columns={enkätColumns} rows={enkätRows} rowKey={(r) => r.key} />
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
                          <DataTable columns={dokumentColumns} rows={dokumentRows} rowKey={(r) => r.key} />
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
                  ["Skolenhetskod", <span key="k" className="font-mono text-sm">{school.skolenhetskod}</span>],
                  ["Kommun", school.kommun ?? DASH],
                  ["Kommunkod", <span key="kk" className="font-mono text-sm">{school.kommunkod ?? DASH}</span>],
                  ["Skolformer", school.skolformer.join(", ") || DASH],
                  ["Huvudmannatyp", school.huvudmannatyp],
                  ["Status i registret", school.status],
                  ["Rektor", school.rektor ?? DASH],
                  ["Startdatum", <span key="s" className="font-mono text-sm">{school.startdatum ?? DASH}</span>],
                ]}
              />
            </RailSection>

            <RailSection title="Kontakt">
              <FactList
                items={[
                  [
                    "Besöksadress",
                    school.besöksadress ? (
                      <span key="a" className="block text-right">{school.besöksadress}</span>
                    ) : (
                      DASH
                    ),
                  ],
                  ["Telefon", <span key="t" className="font-mono text-sm">{school.telefon ?? DASH}</span>],
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
              <ButtonLink href={`/huvudman/${huvudmanSlug}`}>
                Visa huvudmannen
              </ButtonLink>
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
