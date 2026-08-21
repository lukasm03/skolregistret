import { buildEnkätComparisons, type EnkätJämförelse } from "./enkat-compare";
import { antalDokument, buildDokumentVyer, type DokumentgruppVy } from "./dokument-view";
import { DASH, slugify } from "./format";
import {
  buildNyckeltalComparisons,
  type NyckeltalJämförelse,
  type RiksNyckeltal,
} from "./nyckeltal-compare";
import { buildProgramComparisons, type ProgramComparison } from "./program-compare";
import { buildSalsaComparisons, type SalsaJämförelse } from "./salsa-compare";
import {
  ancestorPath,
  getBeräknatRiksGenomsnitt,
  getKommunEnkätGenomsnitt,
  getKommunNyckeltalStats,
  getRiksEnkätGenomsnitt,
  getSkolenkät,
  getSkolinspektionDokument,
  koncernForHuvudmanIndex,
  primärStatistikskolform,
  STATISTIKNYCKEL_NAMN,
  type BeräknatRiksGenomsnitt,
  type EnkätGrupp,
  type HuvudmanKoncern,
  type KommunNyckeltalStat,
  type Nyckeltal,
  type SkolaDetalj,
  type Skolenkät,
  type Skolform,
  type SkolinspektionDokumentgrupp,
  type TrädNod,
} from "./skolregister";

/**
 * The skolenhet detail page's view model: every comparison the page draws,
 * assembled and filtered before anything renders.
 *
 * This is where the page's comparison policy lives — which riksgenomsnitt
 * pairs with which nyckeltal, when the "(beräknat)" caveat fires, when the
 * åk 9 figures hide — so the policy has an interface tests can reach without
 * rendering the route. `buildSkolaDetaljVy` is pure over already-fetched
 * data; `getSkolaDetaljVy` owns the fetch fan-out around it. The route keeps
 * lookup, layout and nothing else.
 */

/** Everything `/skolor/[kod]` renders below the header. */
export interface SkolaDetaljVy {
  /** One row per nyckeltal shown — already filtered by the åk 9 rule. */
  nyckeltal: NyckeltalJämförelse[];
  /** Whether any row compares against a self-computed riksgenomsnitt. */
  harBeräknatRiks: boolean;
  program: ProgramComparison[];
  harProgram: boolean;
  enkät: EnkätJämförelse[];
  harEnkät: boolean;
  dokument: DokumentgruppVy[];
  antalDokumentTotalt: number;
  salsa: SalsaJämförelse[];
  harSalsa: boolean;
  /** The latest läsår across the shown nyckeltal / enkät groups. */
  statistikLäsår: string;
  enkätLäsår: string;
  /** The eleverPerLärare figure as the register spells it, for the fact list. */
  eleverPerLärare: string;
  huvudmanSlug: string;
  koncern: HuvudmanKoncern | undefined;
  /** Just the path from the koncernmoder down to this unit's huvudman. */
  kedja: TrädNod[];
  koncernSlug: string | null;
}

/** What the builder needs that has to be fetched: everything at once, see `getSkolaDetaljVy`. */
export interface SkolaDetaljIndata {
  kommunStats: KommunNyckeltalStat[];
  beräknatRiks: BeräknatRiksGenomsnitt;
  koncernIndex: Map<string, HuvudmanKoncern>;
  skolenkät: Skolenkät;
  dokumentgrupper: SkolinspektionDokumentgrupp[];
  kommunEnkätGrupper: Map<string, EnkätGrupp>;
  riksEnkätGrupper: Map<string, EnkätGrupp>;
}

/** The most recent läsår among a set of them — they sort as they read. */
function senasteLäsår(läsår: string[]): string {
  return (
    [...läsår]
      .filter((l) => l !== DASH)
      .sort()
      .at(-1) ?? DASH
  );
}

/**
 * meritvärde/andelGodkända always compare against grundskolans riks-
 * genomsnitt; andelBehörigaLärare/eleverPerLärare compare against whichever
 * skolform the unit's own values are actually sourced from — see
 * `primärStatistikskolform`. Skolverket has no official endpoint at all for
 * "gy" (only per-program), and no figure ("saknas") for some skolform/
 * nyckeltal combinations it does cover — beräknatRiks fills in an average
 * computed from every unit's own reported nyckeltal for both cases instead
 * of leaving a dash. Which of the two a figure came from is carried through
 * to the page rather than smoothed over: the cards say "(beräknat)".
 * `allt.json` carries no bulk official riksgenomsnitt, so every nyckeltal
 * now compares against `getBeräknatRiksGenomsnitt`'s self-computed average
 * — every card is "(beräknat)".
 */
function riksFör(beräknat: number | undefined, skolform: Skolform | null): RiksNyckeltal {
  return {
    tal: beräknat ?? null,
    beräknat: beräknat != null,
    skolform: skolform ? STATISTIKNYCKEL_NAMN[skolform] : null,
  };
}

/** The two nyckeltal that describe årskurs 9 specifically. */
const ÅK9_NYCKELTAL: (keyof Nyckeltal)[] = [
  "meritvärdeÅrskurs9",
  "andelGodkändaÅrskurs9",
];

export function buildSkolaDetaljVy(
  school: SkolaDetalj,
  indata: SkolaDetaljIndata,
): SkolaDetaljVy {
  const { kommunStats, beräknatRiks, koncernIndex } = indata;

  const primärSkolform = primärStatistikskolform(school.skolformer);
  const beräknatGr = beräknatRiks.perSkolform.get("gr");
  const beräknatÖvriga = primärSkolform
    ? beräknatRiks.perSkolform.get(primärSkolform)
    : undefined;
  const riksPerKey: Partial<Record<keyof Nyckeltal, RiksNyckeltal>> = {
    meritvärdeÅrskurs9: riksFör(beräknatGr?.meritvärdeÅrskurs9, "gr"),
    andelGodkändaÅrskurs9: riksFör(beräknatGr?.andelGodkändaÅrskurs9, "gr"),
    andelBehörigaLärare: riksFör(beräknatÖvriga?.andelBehörigaLärare, primärSkolform),
    eleverPerLärare: riksFör(beräknatÖvriga?.eleverPerLärare, primärSkolform),
  };

  // `allt.json` carries no bulk official program riksgenomsnitt either —
  // every program comparison falls back to `beräknatRiks.perProgram`.
  const program = buildProgramComparisons(
    school.program,
    new Map(),
    beräknatRiks.perProgram,
  );
  const harProgram = program.length > 0;

  const enkät = buildEnkätComparisons(
    indata.skolenkät,
    indata.kommunEnkätGrupper,
    indata.riksEnkätGrupper,
  );

  const dokument = buildDokumentVyer(indata.dokumentgrupper);

  // The register never distinguishes "no årskurs 9" from "not reported" —
  // both come back as a missing value with no läsår. Either way says the
  // same thing here: nothing to show for åk 9. A unit running gymnasie-
  // program hides the åk 9 rows too — those pupils' meritvärde belongs to
  // their grundskola, not to this unit.
  const merit = school.nyckeltal.meritvärdeÅrskurs9;
  const ingenÅk9 = merit.status !== "finns" && merit.läsår == null;
  const döljÅk9 = harProgram || ingenÅk9;

  const nyckeltal = buildNyckeltalComparisons(
    school.nyckeltal,
    kommunStats,
    riksPerKey,
  ).filter((rad) => !döljÅk9 || !ÅK9_NYCKELTAL.includes(rad.key));

  const salsa = buildSalsaComparisons(school.salsa);

  const koncern = school.huvudmannaOrgnr
    ? koncernIndex.get(school.huvudmannaOrgnr)
    : undefined;
  const kedja =
    koncern && school.huvudmannaOrgnr
      ? (ancestorPath(koncern.träd, school.huvudmannaOrgnr) ?? [])
      : [];

  return {
    nyckeltal,
    harBeräknatRiks: nyckeltal.some((rad) => rad.beräknatRiks),
    program,
    harProgram,
    enkät,
    harEnkät: enkät.length > 0,
    dokument,
    antalDokumentTotalt: antalDokument(dokument),
    salsa,
    harSalsa: salsa.length > 0,
    statistikLäsår: senasteLäsår(nyckeltal.map((rad) => rad.läsår)),
    enkätLäsår: senasteLäsår(enkät.map((grupp) => grupp.läsår)),
    eleverPerLärare:
      nyckeltal.find((rad) => rad.key === "eleverPerLärare")?.value ?? DASH,
    huvudmanSlug: slugify(school.huvudman),
    koncern,
    kedja,
    koncernSlug: koncern?.koncernNamn ? slugify(koncern.koncernNamn) : null,
  };
}

/**
 * Fetches everything the detail page needs in one wave and builds the view
 * model. Every underlying read is cached per process (`getSkola` by kod,
 * the riksgenomsnitt/koncern indexes once), so repeat calls are cheap.
 */
export async function getSkolaDetaljVy(school: SkolaDetalj): Promise<SkolaDetaljVy> {
  const [
    kommunStats,
    beräknatRiks,
    koncernIndex,
    skolenkät,
    dokumentgrupper,
    kommunEnkätGrupper,
    riksEnkätGrupper,
  ] = await Promise.all([
    school.kommunkod
      ? getKommunNyckeltalStats(school.kommunkod, school.skolenhetskod)
      : Promise.resolve([]),
    getBeräknatRiksGenomsnitt(),
    koncernForHuvudmanIndex(),
    getSkolenkät(school.skolenhetskod),
    getSkolinspektionDokument(school.skolenhetskod),
    school.kommunkod
      ? getKommunEnkätGenomsnitt(school.kommunkod)
      : Promise.resolve(new Map<string, EnkätGrupp>()),
    getRiksEnkätGenomsnitt(),
  ]);

  return buildSkolaDetaljVy(school, {
    kommunStats,
    beräknatRiks,
    koncernIndex,
    skolenkät,
    dokumentgrupper,
    kommunEnkätGrupper,
    riksEnkätGrupper,
  });
}
