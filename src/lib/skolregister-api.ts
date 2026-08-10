/**
 * Client for the live skolregister API (`NEXT_PUBLIC_APP_URL`, default
 * `http://localhost:3000`). `/skolor` and `/skolor/[kod]` read through this
 * instead of `@/lib/loaders/*` / `@/lib/data-source`, which stay bound to the
 * seed data / Skolverket-shaped `SCHOOL_API_URL` source.
 *
 * The API's own field names (Swedish, "rader"/"totalt" paging) are kept as-is
 * here — nothing outside this file should assume the shape.
 *
 * `listSkolor`/`listHuvudman` can instead be served from a local export file
 * (the register's "exportera register"/"mitt register" download) when
 * `SKOLREGISTER_DATA_FILE` is set — see `readRegisterFile` below.
 */

import { readFile } from "node:fs/promises";

const apiBaseUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** One row of `GET /skolor` — also the fields every detail record starts with. */
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

interface SkolaDetalj extends SkolorRad {
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

interface Sida<T> {
  rader: T[];
  totalt: number;
  sida: number;
  sidstorlek: number;
}

const PAGE_SIZE = 500;

async function fetchAllPages<T>(path: string): Promise<T[]> {
  const first = await fetchJson<Sida<T>>(`${path}?sida=1&sidstorlek=${PAGE_SIZE}`);
  const rows = [...first.rader];
  const pages = Math.ceil(first.totalt / first.sidstorlek);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
      fetchJson<Sida<T>>(`${path}?sida=${i + 2}&sidstorlek=${PAGE_SIZE}`),
    ),
  );
  for (const page of rest) rows.push(...page.rader);
  return rows;
}

/**
 * `next build` fires thousands of these concurrently across
 * `generateStaticParams` for every skolenhet, huvudman and koncern — enough
 * that the local dev API drops connections under the burst (`ECONNREFUSED`,
 * `SocketError: other side closed`) even though it's healthy moments later.
 * Retrying with backoff absorbs that instead of failing the whole build.
 */
async function fetchWithRetry(
  url: URL,
  init: RequestInit,
  attempts = 6,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (attempt >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** (attempt - 1)));
    }
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const url = new URL(path, apiBaseUrl());
  const res = await fetchWithRetry(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`${url.pathname} svarade ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** Skolenkät and Skolinspektionens documents for one skolenhet, as the export bundles them. */
interface SkolenkätOchDokument {
  skolenhetskod: string;
  enkät: Skolenkät;
  dokument: SkolinspektionDokumentgrupp[];
}

/** Shape of a register export file, e.g. Skolregistret's "exportera register" download. */
interface RegisterFile {
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

let registerFileCache: Promise<RegisterFile> | null = null;

/** Reads and parses `SKOLREGISTER_DATA_FILE` once per process, caching the result. */
function readRegisterFile(path: string): Promise<RegisterFile> {
  if (!registerFileCache) {
    registerFileCache = readFile(path, "utf8").then(
      (text) => JSON.parse(text) as RegisterFile,
    );
  }
  return registerFileCache;
}

export async function listSkolor(): Promise<SkolorRad[]> {
  const path = process.env.SKOLREGISTER_DATA_FILE;
  if (path) return (await readRegisterFile(path)).skolor;
  return fetchAllPages<SkolorRad>("/api/skolor");
}

export async function listHuvudman(): Promise<HuvudmanRad[]> {
  const path = process.env.SKOLREGISTER_DATA_FILE;
  if (path) return (await readRegisterFile(path)).huvudmän;
  return fetchAllPages<HuvudmanRad>("/api/huvudman");
}

/**
 * The register export's own build date (`RegisterFile.byggd`) — `null` in
 * live-API mode (no `SKOLREGISTER_DATA_FILE`), which has no such field.
 */
export async function getRegisterByggd(): Promise<string | null> {
  const path = process.env.SKOLREGISTER_DATA_FILE;
  if (!path) return null;
  return (await readRegisterFile(path)).byggd;
}

/** Direction that counts as "better" for each nyckeltal, used for ranking. */
const NYCKELTAL_BÄTTRE_RIKTNING: Record<keyof Nyckeltal, "hög" | "låg"> = {
  meritvärdeÅrskurs9: "hög",
  andelGodkändaÅrskurs9: "hög",
  andelBehörigaLärare: "hög",
  eleverPerLärare: "låg",
};

export interface KommunNyckeltalStat {
  key: keyof Nyckeltal;
  /** `null` when no unit in the kommun reports this nyckeltal. */
  genomsnitt: number | null;
  antalMedVärde: number;
  /** 1-indexed placing among `antalRankade`, best first; `null` if this unit lacks a value. */
  rank: number | null;
  antalRankade: number;
}

/**
 * Kommun average and this unit's ranking for each nyckeltal, computed across
 * every other unit in the same kommun. The register has no bulk nyckeltal
 * endpoint, so this fetches every kommun-mate's detail record — each one
 * cached by `getSkola`'s revalidate window, so repeat calls for the same
 * kommun (e.g. across its units' detail pages) stay cheap.
 */
export async function getKommunNyckeltalStats(
  kommunkod: string,
  skolenhetskod: string,
): Promise<KommunNyckeltalStat[]> {
  const skolor = await listSkolor();
  const kommunSkolor = skolor.filter((s) => s.kommunkod === kommunkod);
  const detaljer = await Promise.all(kommunSkolor.map((s) => getSkola(s.skolenhetskod)));

  const keys = Object.keys(NYCKELTAL_BÄTTRE_RIKTNING) as (keyof Nyckeltal)[];
  return keys.map((key) => {
    const värden = detaljer
      .filter((d): d is SkolaDetalj => d != null)
      .map((d) => ({ kod: d.skolenhetskod, v: d.nyckeltal[key] }))
      .filter(
        (x): x is { kod: string; v: Extract<NyckeltalVärde, { status: "finns" }> } =>
          x.v.status === "finns",
      );

    const genomsnitt = värden.length
      ? värden.reduce((sum, x) => sum + x.v.tal, 0) / värden.length
      : null;

    const riktning = NYCKELTAL_BÄTTRE_RIKTNING[key];
    const rankade = [...värden].sort((a, b) =>
      riktning === "låg" ? a.v.tal - b.v.tal : b.v.tal - a.v.tal,
    );
    const index = rankade.findIndex((x) => x.kod === skolenhetskod);

    return {
      key,
      genomsnitt,
      antalMedVärde: värden.length,
      rank: index === -1 ? null : index + 1,
      antalRankade: rankade.length,
    };
  });
}

/**
 * meritvärde/andelGodkända always come from grundskolans egen statistik
 * (`byggSkoldetalj` reads them off `statistik.get("gr")` specifically, never
 * off whichever skolform happens to be first) — so their riksgenomsnitt is
 * always the "gr" endpoint/bucket, regardless of what else the unit runs.
 */
export const GRUNDSKOLA_NYCKELTAL: (keyof Nyckeltal)[] = [
  "meritvärdeÅrskurs9",
  "andelGodkändaÅrskurs9",
];

/**
 * andelBehöriga/eleverPerLärare, on the other hand, come off whichever
 * skolform's statistik the register found first for the unit — so the
 * comparable riksgenomsnitt is that same skolform's. Gymnasieskola ("gy")
 * has no skolform-level riksgenomsnitt endpoint at Skolverket (only a
 * per-program one), so a unit whose first skolform is "gy" never gets an
 * *official* figure for these two — but `getBeräknatRiksGenomsnitt` below
 * still buckets it under "gy" and computes one from every gymnasieskola's
 * own reported values.
 */
export const SKOLFORM_TILL_STATISTIKNYCKEL: Record<string, Skolform> = {
  Förskoleklass: "fsk",
  Grundskola: "gr",
  "Anpassad grundskola": "gran",
  Gymnasieskola: "gy",
  "Anpassad gymnasieskola": "gyan",
};

export function primärStatistikskolform(skolformer: string[]): Skolform | null {
  for (const namn of skolformer) {
    const nyckel = SKOLFORM_TILL_STATISTIKNYCKEL[namn];
    if (nyckel) return nyckel;
  }
  return null;
}

/** The five program-level nyckeltal Skolverket publishes a riksgenomsnitt for, plus `antalElever`. */
export type ProgramNyckeltalKey = "antalElever" | keyof SkolaProgram["nyckeltal"];

/** Self-computed fallback riksgenomsnitt, used wherever Skolverket's own national-average endpoint reports "saknas" (or, for "gy", has no endpoint at all) for a (skolform, nyckeltal) or (programkod, nyckeltal) combination. */
export interface BeräknatRiksGenomsnitt {
  perSkolform: Map<Skolform, Partial<Record<keyof Nyckeltal, number>>>;
  perProgram: Map<string, Partial<Record<ProgramNyckeltalKey, number>>>;
}

let beräknatRiksGenomsnittCache: Promise<BeräknatRiksGenomsnitt> | null = null;

/**
 * Averages every unit's own reported nyckeltal into a nationwide figure, for
 * use wherever `getNationelltGenomsnitt`/`getNationelltProgramGenomsnitt`
 * comes back "saknas" for that particular metric — Skolverket's own
 * national-average endpoint doesn't always cover every metric it publishes
 * per unit. Computed once per process across every unit in the register
 * (thousands of skoldetalj fetches, cached individually by `getSkola`) since
 * redoing that scan on every skoldetalj page would make them all slow —
 * the same tradeoff `getRiksEnkätGenomsnitt` makes for the skolenkät.
 */
export async function getBeräknatRiksGenomsnitt(): Promise<BeräknatRiksGenomsnitt> {
  if (!beräknatRiksGenomsnittCache) {
    beräknatRiksGenomsnittCache = (async () => {
      const skolor = await listSkolor();
      const detaljer = await Promise.all(skolor.map((s) => getSkola(s.skolenhetskod)));

      const nyckeltalSummor = new Map<
        Skolform,
        {
          sum: Partial<Record<keyof Nyckeltal, number>>;
          n: Partial<Record<keyof Nyckeltal, number>>;
        }
      >();
      const addNyckeltal = (skolform: Skolform, key: keyof Nyckeltal, tal: number) => {
        let bucket = nyckeltalSummor.get(skolform);
        if (!bucket) {
          bucket = { sum: {}, n: {} };
          nyckeltalSummor.set(skolform, bucket);
        }
        bucket.sum[key] = (bucket.sum[key] ?? 0) + tal;
        bucket.n[key] = (bucket.n[key] ?? 0) + 1;
      };

      const programSummor = new Map<
        string,
        {
          sum: Partial<Record<ProgramNyckeltalKey, number>>;
          n: Partial<Record<ProgramNyckeltalKey, number>>;
        }
      >();
      const addProgram = (kod: string, key: ProgramNyckeltalKey, tal: number) => {
        let bucket = programSummor.get(kod);
        if (!bucket) {
          bucket = { sum: {}, n: {} };
          programSummor.set(kod, bucket);
        }
        bucket.sum[key] = (bucket.sum[key] ?? 0) + tal;
        bucket.n[key] = (bucket.n[key] ?? 0) + 1;
      };

      const ÖVRIGA_NYCKELTAL = ["andelBehörigaLärare", "eleverPerLärare"] as const;
      const PROGRAM_NYCKELTAL_KEYS = [
        "lägstaAntagningspoäng",
        "genomsnittligAntagningspoäng",
        "andelMedExamenInom3År",
        "betygspoängMedExamen",
        "andelMedHögskolebehörighet",
      ] as const;

      for (const d of detaljer) {
        if (!d) continue;

        for (const key of GRUNDSKOLA_NYCKELTAL) {
          const v = d.nyckeltal[key];
          if (v.status === "finns") addNyckeltal("gr", key, v.tal);
        }

        const skolform = primärStatistikskolform(d.skolformer);
        if (skolform) {
          for (const key of ÖVRIGA_NYCKELTAL) {
            const v = d.nyckeltal[key];
            if (v.status === "finns") addNyckeltal(skolform, key, v.tal);
          }
        }

        for (const p of d.program) {
          if (p.antalElever.status === "finns")
            addProgram(p.kod, "antalElever", p.antalElever.tal);
          for (const key of PROGRAM_NYCKELTAL_KEYS) {
            const v = p.nyckeltal[key];
            if (v.status === "finns") addProgram(p.kod, key, v.tal);
          }
        }
      }

      const medelvärde = <K extends string>(
        summor: Map<
          string,
          { sum: Partial<Record<K, number>>; n: Partial<Record<K, number>> }
        >,
      ): Map<string, Partial<Record<K, number>>> => {
        const result = new Map<string, Partial<Record<K, number>>>();
        for (const [nyckel, bucket] of summor) {
          const avg: Partial<Record<K, number>> = {};
          for (const key of Object.keys(bucket.sum) as K[]) {
            avg[key] = bucket.sum[key]! / bucket.n[key]!;
          }
          result.set(nyckel, avg);
        }
        return result;
      };

      return {
        perSkolform: medelvärde(nyckeltalSummor) as Map<
          Skolform,
          Partial<Record<keyof Nyckeltal, number>>
        >,
        perProgram: medelvärde(programSummor),
      };
    })();
  }
  return beräknatRiksGenomsnittCache;
}

/** `null` when the API reports the resource doesn't exist (404). */
async function fetchJsonOr404<T>(path: string): Promise<T | null> {
  const url = new URL(path, apiBaseUrl());
  const res = await fetchWithRetry(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 60 },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`${url.pathname} svarade ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** `saknas`-värde for a nyckeltal the register file simply doesn't carry. */
const INGEN_FILDATA: NyckeltalVärde = {
  status: "saknas",
  förklaring: "Ingen uppgift i registerfilen",
  läsår: null,
};

/**
 * `getSkola` when `SKOLREGISTER_DATA_FILE` is set: newer exports carry a
 * `skoldetaljer` array with the same per-unit detail (rektor, kontakt,
 * program, nyckeltal) `byggSkoldetalj` would return live. Older exports
 * without that field fall back to `SkolorRad`-level data with the detail
 * fields empty/`saknas`, rather than reaching out to the live API — which
 * isn't guaranteed to be running alongside a file-based build.
 */
async function getSkolaFromFile(path: string, kod: string): Promise<SkolaDetalj | null> {
  const { skolor, skoldetaljer } = await readRegisterFile(path);
  const detalj = skoldetaljer?.find((s) => s.skolenhetskod === kod);
  if (detalj) return detalj;

  const rad = skolor.find((s) => s.skolenhetskod === kod);
  if (!rad) return null;
  return {
    ...rad,
    rektor: null,
    startdatum: null,
    besöksadress: null,
    telefon: null,
    webbplats: null,
    epost: null,
    koordinater: null,
    program: [],
    nyckeltal: {
      meritvärdeÅrskurs9: INGEN_FILDATA,
      andelGodkändaÅrskurs9: INGEN_FILDATA,
      andelBehörigaLärare: INGEN_FILDATA,
      eleverPerLärare: INGEN_FILDATA,
    },
  };
}

export function getSkola(kod: string): Promise<SkolaDetalj | null> {
  const path = process.env.SKOLREGISTER_DATA_FILE;
  if (path) return getSkolaFromFile(path, kod);
  return fetchJsonOr404<SkolaDetalj>(`/api/skolor/${encodeURIComponent(kod)}`);
}

/** The register's own `Statistiknyckel`s that have a national average endpoint — `gy` doesn't, only its programs do. */
export type NationelltGenomsnittSkolform = "fsk" | "gr" | "gran" | "gyan";

export interface NationelltGenomsnitt {
  skolform: NationelltGenomsnittSkolform;
  nyckeltal: Nyckeltal;
}

/**
 * `GET /api/nationellt-genomsnitt/:skolform` — `null` if Skolverket has no
 * statistics for it. In file mode this reads the export's `nationelltGenomsnitt`
 * array (absent in older exports, in which case this resolves to `null` too).
 */
export async function getNationelltGenomsnitt(
  skolform: NationelltGenomsnittSkolform,
): Promise<NationelltGenomsnitt | null> {
  const path = process.env.SKOLREGISTER_DATA_FILE;
  if (path) {
    const { nationelltGenomsnitt } = await readRegisterFile(path);
    return nationelltGenomsnitt?.find((g) => g.skolform === skolform) ?? null;
  }
  return fetchJsonOr404<NationelltGenomsnitt>(`/api/nationellt-genomsnitt/${skolform}`);
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

/**
 * `GET /api/nationellt-genomsnitt/gy/:programCode` — `null` if Skolverket
 * has no statistics for that program. In file mode this reads the export's
 * `nationelltProgramGenomsnitt` array (absent in older exports, in which
 * case this resolves to `null` too).
 */
export async function getNationelltProgramGenomsnitt(
  programkod: string,
): Promise<NationelltProgramGenomsnitt | null> {
  const path = process.env.SKOLREGISTER_DATA_FILE;
  if (path) {
    const { nationelltProgramGenomsnitt } = await readRegisterFile(path);
    return nationelltProgramGenomsnitt?.find((g) => g.programkod === programkod) ?? null;
  }
  return fetchJsonOr404<NationelltProgramGenomsnitt>(
    `/api/nationellt-genomsnitt/gy/${encodeURIComponent(programkod)}`,
  );
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
 * `GET /api/skolor/:skolenhetskod/enkat` — Skolinspektionens skolenkät for
 * the unit. Units with no respondents come back with empty `vårdnadshavare`/
 * `elever` arrays rather than a 404.
 */
export async function getSkolenkät(kod: string): Promise<Skolenkät> {
  const path = process.env.SKOLREGISTER_DATA_FILE;
  if (path) {
    const { skolenkäterOchDokument } = await readRegisterFile(path);
    const entry = skolenkäterOchDokument?.find((e) => e.skolenhetskod === kod);
    return entry?.enkät ?? { skolenhetskod: kod, vårdnadshavare: [], elever: [] };
  }
  return fetchJson<Skolenkät>(`/api/skolor/${encodeURIComponent(kod)}/enkat`);
}

const ENKÄT_FRÅGOR = [
  "rekommendation",
  "nöjdhet",
  "trygghet",
  "studiero",
  "stöd",
  "stimulans",
] as const;
type EnkätFrågaKey = (typeof ENKÄT_FRÅGOR)[number];

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

/** The register has no separate elevenkät/vårdnadshavarenkät identity beyond skolform + årskurs. */
export function enkätGruppKey(skolform: string, årskurs?: string | null): string {
  return årskurs != null ? `elev:${skolform}:${årskurs}` : `vårdnadshavare:${skolform}`;
}

/**
 * Averages every `Skolenkät`'s vårdnadshavar- and elevenkät entries into one
 * `EnkätGrupp` per (skolform, årskurs), the same grouping `enkätGruppKey`
 * looks results up by. Missing questions (`genomsnitt: null`) are excluded
 * from that question's average rather than treated as zero.
 */
function averageEnkäter(enkäter: Skolenkät[]): Map<string, EnkätGrupp> {
  const sums = new Map<
    string,
    {
      sum: Record<EnkätFrågaKey, number>;
      n: Record<EnkätFrågaKey, number>;
      antalSvarSum: number;
      antalSvarN: number;
      läsårRäknat: Map<string, number>;
      antalSkolor: number;
    }
  >();
  const zero = () =>
    Object.fromEntries(ENKÄT_FRÅGOR.map((k) => [k, 0])) as Record<EnkätFrågaKey, number>;

  const addEntry = (gruppKey: string, e: Vårdnadshavarenkät | Elevenkät) => {
    let bucket = sums.get(gruppKey);
    if (!bucket) {
      bucket = {
        sum: zero(),
        n: zero(),
        antalSvarSum: 0,
        antalSvarN: 0,
        läsårRäknat: new Map(),
        antalSkolor: 0,
      };
      sums.set(gruppKey, bucket);
    }
    bucket.antalSkolor += 1;
    for (const key of ENKÄT_FRÅGOR) {
      const värde = e[key]?.genomsnitt;
      if (värde != null) {
        bucket.sum[key] += värde;
        bucket.n[key] += 1;
      }
    }
    if (e.antalSvar != null) {
      bucket.antalSvarSum += e.antalSvar;
      bucket.antalSvarN += 1;
    }
    if (e.läsår != null) {
      bucket.läsårRäknat.set(e.läsår, (bucket.läsårRäknat.get(e.läsår) ?? 0) + 1);
    }
  };

  for (const enkät of enkäter) {
    for (const v of enkät.vårdnadshavare) addEntry(enkätGruppKey(v.skolform), v);
    for (const e of enkät.elever) addEntry(enkätGruppKey(e.skolform, e.årskurs), e);
  }

  const result = new Map<string, EnkätGrupp>();
  for (const [gruppKey, bucket] of sums) {
    const genomsnitt = Object.fromEntries(
      ENKÄT_FRÅGOR.map((k) => [k, bucket.n[k] > 0 ? bucket.sum[k] / bucket.n[k] : null]),
    ) as EnkätGenomsnittPerFråga;
    let läsår: string | null = null;
    let bästAntal = 0;
    for (const [år, antal] of bucket.läsårRäknat) {
      if (antal > bästAntal || (antal === bästAntal && (läsår == null || år > läsår))) {
        läsår = år;
        bästAntal = antal;
      }
    }
    result.set(gruppKey, {
      genomsnitt,
      antalSvar: bucket.antalSvarN > 0 ? bucket.antalSvarSum / bucket.antalSvarN : null,
      läsår,
      antalSkolor: bucket.antalSkolor,
    });
  }
  return result;
}

/**
 * Kommunsnitt for the skolenkät, computed across every unit in the kommun
 * (including this one, matching `getKommunNyckeltalStats`) since the
 * register has no bulk enkät endpoint to read a real average from. Grouped
 * by `enkätGruppKey` — a straight average across skolformer or årskurser
 * wouldn't mean anything.
 */
export async function getKommunEnkätGenomsnitt(
  kommunkod: string,
): Promise<Map<string, EnkätGrupp>> {
  const skolor = await listSkolor();
  const kommunSkolor = skolor.filter((s) => s.kommunkod === kommunkod);
  const enkäter = await Promise.all(
    kommunSkolor.map((s) => getSkolenkät(s.skolenhetskod)),
  );
  return averageEnkäter(enkäter);
}

let riksEnkätCache: Promise<Map<string, EnkätGrupp>> | null = null;

/**
 * Riksgenomsnitt for the skolenkät, computed once per process across every
 * unit in the register — there's no Skolverket/Skolinspektionen endpoint for
 * this the way `getNationelltGenomsnitt` has for nyckeltal. In file mode
 * this reads the already in-memory `skolenkäterOchDokument` export; in live
 * mode it fetches every unit's enkät once and keeps the computed averages
 * for the rest of the process, since re-fetching ~5000+ units per request
 * would make every skoldetalj page slow.
 */
export async function getRiksEnkätGenomsnitt(): Promise<Map<string, EnkätGrupp>> {
  if (!riksEnkätCache) {
    riksEnkätCache = (async () => {
      const path = process.env.SKOLREGISTER_DATA_FILE;
      if (path) {
        const { skolenkäterOchDokument } = await readRegisterFile(path);
        return averageEnkäter((skolenkäterOchDokument ?? []).map((e) => e.enkät));
      }
      const skolor = await listSkolor();
      const enkäter = await Promise.all(skolor.map((s) => getSkolenkät(s.skolenhetskod)));
      return averageEnkäter(enkäter);
    })();
  }
  return riksEnkätCache;
}

/** Statistiknyckeln for an individual skolform, as used by the dokument endpoint. */
export type Skolform = NationelltGenomsnittSkolform | "gy";

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

/**
 * `GET /api/skolor/:skolenhetskod/dokument` — Skolinspektionens documents
 * for the unit, grouped by skolform. Pass `skolform` to fetch only that
 * skolform's group (`GET .../dokument?skolform=gr`).
 */
/**
 * `GET /api/skolor/:skolenhetskod/dokument`, optionally filtered by
 * `skolform`. The export bundles the unfiltered (all-skolformer) list per
 * unit, so file mode doesn't support the `skolform` filter — the UI never
 * passes one.
 */
export async function getSkolinspektionDokument(
  kod: string,
  skolform?: Skolform,
): Promise<SkolinspektionDokumentgrupp[]> {
  const path = process.env.SKOLREGISTER_DATA_FILE;
  if (path) {
    const { skolenkäterOchDokument } = await readRegisterFile(path);
    const entry = skolenkäterOchDokument?.find((e) => e.skolenhetskod === kod);
    return entry?.dokument ?? [];
  }
  const query = skolform ? `?skolform=${encodeURIComponent(skolform)}` : "";
  return fetchJson<SkolinspektionDokumentgrupp[]>(
    `/api/skolor/${encodeURIComponent(kod)}/dokument${query}`,
  );
}
