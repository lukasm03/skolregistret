/**
 * The skolregister API's own shapes, kept exactly as the API spells them —
 * Swedish field names, `rader`/`totalt` paging. Nothing outside
 * `src/lib/skolregister/` should assume this shape; `src/lib/api-normalize.ts`
 * is where it gets translated into the view models the components use.
 */

/** One row of `GET /api/skolor` — also the fields every detail record starts with. */
export interface SkolorRad {
  skolenhetskod: string;
  namn: string;
  status: string;
  huvudman: string;
  huvudmannaOrgnr: string | null;
  huvudmannatyp: string;
  kommun: string | null;
  kommunkod: string | null;
  skolformer: string[];
  /** Only populated for gymnasieskola units; an empty array otherwise. */
  gymnasieprogram: string[];
  antalElever: number | null;
  /**
   * Every årskurs the unit covers, as the register spells them: strings, not
   * numbers, where `"0"` is förskoleklass rather than a year zero. Already
   * sorted numerically ascending and deduped, so it can be used as-is.
   *
   * This is the flat union of `årskurserPerSkolform[].årskurser` — filter on
   * this one, and reach for the breakdown only to show which skolform a year
   * belongs to.
   *
   * Always present, but **empty for every skolform Skolverket publishes no
   * years for**: gymnasieskola, anpassad gymnasieskola, förskola, fritidshem
   * and vuxenutbildning. Empty means "not reported", *not* "no årskurser" —
   * never render it as "0 årskurser".
   */
  årskurser: string[];
  /** The same years split by skolform. Empty whenever `årskurser` is. */
  årskurserPerSkolform: SkolformsÅrskurser[];
}

/** Skolverket's own skolformsnyckel, for the three forms that report årskurser. */
export type ÅrskursSkolformKod = "fsk" | "gr" | "gran";

export interface SkolformsÅrskurser {
  kod: ÅrskursSkolformKod;
  /** The register's display name, e.g. "Anpassad grundskola". */
  skolform: string;
  årskurser: string[];
}

export interface HuvudmanRad {
  organisationsnummer: string;
  namn: string;
  typ: string;
  bolagsform: string | null;
  koncern: {
    koncernOrgNr: string;
    koncernNamn: string;
    kedja: string[];
    antalFöretag: number;
  } | null;
  kommuner: string[];
  skolformer: string[];
  antalEnheter: number;
  antalElever: number;
}

export type Nyckeltal = {
  meritvärdeÅrskurs9: NyckeltalVärde;
  andelGodkändaÅrskurs9: NyckeltalVärde;
  andelBehörigaLärare: NyckeltalVärde;
  eleverPerLärare: NyckeltalVärde;
};

export type NyckeltalVärde =
  | { status: "finns"; text: string; tal: number; läsår: string }
  | { status: "saknas"; förklaring: string; läsår: string | null };

/** One nationellt gymnasieprogram at a unit, with the programme's own nyckeltal. */
export interface SkolaProgram {
  /** Programme code as the register spells it, e.g. "NA25". */
  kod: string;
  namn: string;
  antalElever: NyckeltalVärde;
  nyckeltal: {
    lägstaAntagningspoäng: NyckeltalVärde;
    genomsnittligAntagningspoäng: NyckeltalVärde;
    andelMedExamenInom3År: NyckeltalVärde;
    betygspoängMedExamen: NyckeltalVärde;
    andelMedHögskolebehörighet: NyckeltalVärde;
  };
}

export interface SkolaDetalj extends SkolorRad {
  rektor: string | null;
  startdatum: string | null;
  besöksadress: string | null;
  telefon: string | null;
  webbplats: string | null;
  epost: string | null;
  koordinater: { latitud: number; longitud: number } | null;
  /** One entry per nationellt program the unit runs; empty for non-gymnasieskolor. */
  program: SkolaProgram[];
  nyckeltal: Nyckeltal;
}

/** One page of a paged list endpoint. */
export interface Sida<T> {
  rader: T[];
  totalt: number;
  sida: number;
  sidstorlek: number;
}

/** Skolenkät and Skolinspektionens documents for one skolenhet, as the export bundles them. */
export interface SkolenkätOchDokument {
  skolenhetskod: string;
  enkät: Skolenkät;
  dokument: SkolinspektionDokumentgrupp[];
}

/** Shape of a register export file, e.g. Skolregistret's "exportera register" download. */
export interface RegisterFile {
  byggd: string;
  kommuner: Record<string, string>;
  skolor: SkolorRad[];
  huvudmän: HuvudmanRad[];
  /** Only present in newer exports — riksgenomsnitt for fsk/gr/gran/gyan. */
  nationelltGenomsnitt?: NationelltGenomsnitt[];
  /** Only present in newer exports — riksgenomsnitt per gy-program. */
  nationelltProgramGenomsnitt?: NationelltProgramGenomsnitt[];
  /** Only present in newer exports. */
  skolenkäterOchDokument?: SkolenkätOchDokument[];
  /** Only present in newer exports. */
  skoldetaljer?: SkolaDetalj[];
}

/** Statistiknyckeln for an individual skolform, as used by the dokument endpoint. */
export type Skolform = NationelltGenomsnittSkolform | "gy";

/** The register's own `Statistiknyckel`s that have a national average endpoint — `gy` doesn't, only its programs do. */
export type NationelltGenomsnittSkolform = "fsk" | "gr" | "gran" | "gyan";

export interface NationelltGenomsnitt {
  skolform: NationelltGenomsnittSkolform;
  nyckeltal: Nyckeltal;
}

export interface NationelltProgramGenomsnitt {
  skolform: "gy";
  programkod: string;
  nyckeltal: {
    antalElever: NyckeltalVärde;
    lägstaAntagningspoäng: NyckeltalVärde;
    genomsnittligAntagningspoäng: NyckeltalVärde;
    andelMedExamenInom3År: NyckeltalVärde;
    betygspoängMedExamen: NyckeltalVärde;
    andelMedHögskolebehörighet: NyckeltalVärde;
  };
}

/** The five program-level nyckeltal Skolverket publishes a riksgenomsnitt for, plus `antalElever`. */
export type ProgramNyckeltalKey = "antalElever" | keyof SkolaProgram["nyckeltal"];

export interface KommunNyckeltalStat {
  key: keyof Nyckeltal;
  /** `null` when no unit in the kommun reports this nyckeltal. */
  genomsnitt: number | null;
  antalMedVärde: number;
  /** 1-indexed placing among `antalRankade`, best first; `null` if this unit lacks a value. */
  rank: number | null;
  antalRankade: number;
}

/** Self-computed fallback riksgenomsnitt, used wherever Skolverket's own national-average endpoint reports "saknas" (or, for "gy", has no endpoint at all) for a (skolform, nyckeltal) or (programkod, nyckeltal) combination. */
export interface BeräknatRiksGenomsnitt {
  perSkolform: Map<Skolform, Partial<Record<keyof Nyckeltal, number>>>;
  perProgram: Map<string, Partial<Record<ProgramNyckeltalKey, number>>>;
}

/** A single question in Skolinspektionens skolenkät, with its average and answer distribution. */
export interface Enkätfråga {
  fråga: string;
  ämne: string | null;
  genomsnitt: number | null;
  /** Swedish answer option → share in percent. Only options with data are included. */
  svarsfördelning: Record<string, number>;
}

/** Vårdnadshavarenkäten for one skolform (förskoleklass, grundskola or anpassad grundskola). */
export interface Vårdnadshavarenkät {
  skolform: string;
  läsår: string | null;
  antalSvar: number | null;
  rekommendation: Enkätfråga | null;
  nöjdhet: Enkätfråga | null;
  trygghet: Enkätfråga | null;
  studiero: Enkätfråga | null;
  stöd: Enkätfråga | null;
  stimulans: Enkätfråga | null;
}

/** Elevenkäten for one årskurs within a skolform (grundskola or gymnasieskola). */
export interface Elevenkät extends Vårdnadshavarenkät {
  årskurs: string | null;
  antalIGruppen: number | null;
  svarsfrekvens: number | null;
}

export interface Skolenkät {
  skolenhetskod: string;
  /** One entry per skolform that has a vårdnadshavarenkät. */
  vårdnadshavare: Vårdnadshavarenkät[];
  /** One entry per årskurs and skolform that has an elevenkät. */
  elever: Elevenkät[];
}

/**
 * The six enkät questions carried through every average. A value rather than a
 * pure type because the averaging in `statistics.ts` iterates it, and
 * `EnkätFrågaKey` is derived from it so the two can never drift apart.
 */
export const ENKÄT_FRÅGOR = [
  "rekommendation",
  "nöjdhet",
  "trygghet",
  "studiero",
  "stöd",
  "stimulans",
] as const;

export type EnkätFrågaKey = (typeof ENKÄT_FRÅGOR)[number];

export type EnkätGenomsnittPerFråga = Record<EnkätFrågaKey, number | null>;

/** Average across every unit's skolenkät for one grupp (a skolform, or a skolform+årskurs for elever). */
export interface EnkätGrupp {
  /** `genomsnitt` is unweighted by `antalSvar` — every reporting unit counts once. */
  genomsnitt: EnkätGenomsnittPerFråga;
  /** Average `antalSvar` across reporting units; `null` if none reported a count. */
  antalSvar: number | null;
  /** The läsår most reporting units share; `null` if none reported one. */
  läsår: string | null;
  antalSkolor: number;
}

/** A single document, e.g. a skolenkätrapport or a granskningsbeslut. */
export interface SkolinspektionDokument {
  typ: string;
  typId: string;
  titel: string;
  filnamn: string;
  mimetyp: string;
  storlekBytes: number | null;
  url: string;
}

export interface SkolinspektionDokumentgrupp {
  skolform: string;
  dokument: SkolinspektionDokument[];
}
