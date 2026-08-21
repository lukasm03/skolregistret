/**
 * One function per resource, reading `data/allt.json` via `client.ts` and
 * producing this module's stable output types (`types.ts`, second half) —
 * never `allt.json`'s own shapes past this file. `api-normalize.ts` and every
 * `*-compare.ts` builder consume only what's produced here.
 *
 * Anything that aggregates *across* these results (kommun averages,
 * riksgenomsnitt, enkätsnitt) belongs in `statistics.ts`, not here.
 */

import { readAlltFile, registerFilePath } from "./client";
import {
  nyastaMatvärde,
  nyastaTal,
  parseAndelString,
  skolformLabel,
  talAv,
} from "./normalize";
import { primärStatistikskolform } from "./skolform";
import type {
  AlltFile,
  Elevenkät,
  Enkätfråga,
  HuvudmanRad,
  Matvarde,
  Nyckeltal,
  NyckeltalVärde,
  SkolaDetalj,
  SkolaProgram,
  Skolenkät,
  Skolform,
  Skolinfo,
  SkolinfoUppslag,
  SkolinspektionDokument,
  SkolinspektionDokumentgrupp,
  SkolorRad,
  Vårdnadshavarenkät,
} from "./types";

async function alltFile(): Promise<AlltFile> {
  return readAlltFile(registerFilePath());
}

let skolinfoIndexCache: Promise<Map<string, Skolinfo>> | null = null;

/**
 * `skolinfo` (fristående) and `offentliga` (kommunala m.fl.) merged into one
 * map keyed by skolenhetskod — the two are disjoint per the source's own
 * documentation, so a collision would mean that invariant broke; asserted
 * rather than silently overwritten. `"finns-inte"`/`"fel"` entries are
 * dropped: a unit the register itself doesn't have, or one we failed to ask
 * about, has nothing to show either way — see `getSkola` for how that
 * distinction still reaches callers that look a single unit up directly.
 */
function skolinfoIndex(): Promise<Map<string, Skolinfo>> {
  if (!skolinfoIndexCache) {
    skolinfoIndexCache = alltFile().then((file) => {
      const index = new Map<string, Skolinfo>();
      for (const source of [file.skolinfo, file.offentliga]) {
        for (const [kod, uppslag] of Object.entries(source)) {
          if (uppslag.typ !== "hittad") continue;
          if (index.has(kod)) {
            throw new Error(
              `skolenhetskod ${kod} förekommer i både skolinfo och offentliga — ` +
                `de förutsätts vara disjunkta mängder.`,
            );
          }
          index.set(kod, uppslag.info);
        }
      }
      return index;
    });
  }
  return skolinfoIndexCache;
}

/** Look up a unit's raw uppslag (not just the merged "hittad" index) — used by `getSkola` to distinguish "finns-inte" from "fel". */
async function uppslag(kod: string): Promise<SkolinfoUppslag | null> {
  const file = await alltFile();
  return file.skolinfo[kod] ?? file.offentliga[kod] ?? null;
}

const NYCKELTAL_MATT: Record<
  keyof Nyckeltal,
  { skolform: "gr" | "primär"; matt: string }
> = {
  meritvärdeÅrskurs9: { skolform: "gr", matt: "averageGradesMeritRating9thGrade" },
  andelGodkändaÅrskurs9: {
    skolform: "gr",
    matt: "ratioOfPupilsIn9thGradeWithAllSubjectsPassed",
  },
  andelBehörigaLärare: { skolform: "primär", matt: "certifiedTeachersQuota" },
  eleverPerLärare: { skolform: "primär", matt: "studentsPerTeacherQuota" },
};

const FÖRKLARING_PER_TYP: Record<string, string> = {
  MISSING: "Uppgiften är inte inrapporterad till Skolverket.",
  OMITTED_DUE_TO_BASED_ON_FEW_PUPILS:
    "Uppgiften är utelämnad eftersom för få elever ligger bakom talet.",
  ROUNDED_OFF_DUE_TO_FEW_PUPILS_NOT_ELIGIBLE:
    "Avrundat kraftigt eftersom för få elever är berörda eller behöriga.",
  TEACHERS_EXCLUDED_DUE_TO_NO_REQUIRED_LEGITIMATION:
    "Lärare utan föreskriven legitimation är exkluderade ur talet.",
};

function nyckeltalVärdeAv(m: Matvarde | null): NyckeltalVärde {
  if (talAv(m) != null) {
    return {
      status: "finns",
      text: m!.varde ?? String(m!.tal),
      tal: m!.tal!,
      läsår: m!.period,
    };
  }
  return {
    status: "saknas",
    förklaring: (m && FÖRKLARING_PER_TYP[m.typ]) || "Uppgiften saknas i registret.",
    läsår: m?.period ?? null,
  };
}

function primärSkolform(info: Skolinfo): Skolform | null {
  return primärStatistikskolform(info.skolformer.map(skolformLabel));
}

function byggNyckeltal(info: Skolinfo): Nyckeltal {
  const primär = primärSkolform(info);
  const värde = (key: keyof Nyckeltal): NyckeltalVärde => {
    const def = NYCKELTAL_MATT[key];
    const skolform = def.skolform === "gr" ? "gr" : primär;
    if (!skolform) {
      return {
        status: "saknas",
        förklaring: "Enheten redovisar ingen skolform statistiken kan läsas mot.",
        läsår: null,
      };
    }
    const stat = info.statistik[skolform];
    return nyckeltalVärdeAv(stat ? nyastaMatvärde(stat.matt[def.matt]) : null);
  };
  return {
    meritvärdeÅrskurs9: värde("meritvärdeÅrskurs9"),
    andelGodkändaÅrskurs9: värde("andelGodkändaÅrskurs9"),
    andelBehörigaLärare: värde("andelBehörigaLärare"),
    eleverPerLärare: värde("eleverPerLärare"),
  };
}

const PROGRAM_NYCKELTAL_MATT: Record<keyof SkolaProgram["nyckeltal"], string> = {
  lägstaAntagningspoäng: "admissionPointsMin",
  genomsnittligAntagningspoäng: "admissionPointsAverage",
  andelMedExamenInom3År: "ratioOfPupilsWithExamWithin3Years",
  betygspoängMedExamen: "gradesPointsForStudentsWithExam",
  andelMedHögskolebehörighet: "ratioOfStudentsEligibleForUndergraduateEducation",
};

/**
 * Programme names: joined from `utbildningar[].studievagskod` (an exact
 * Skolverket-sourced name) where the code matches. Introduktionsprogram
 * variants (IMV/IMY/IMS/IMA) rarely have an exact match — `utbildningar`
 * lists their specific tracks, not the bare code — so those fall back to the
 * bare programkod rather than a guessed name.
 */
function byggProgram(info: Skolinfo): SkolaProgram[] {
  const namnAv = new Map(
    info.utbildningar.map((u) => [u.studievagskod, u.studievagsnamn]),
  );
  const gy = info.statistik.gy;
  if (!gy) return [];
  return gy.program.map((p) => {
    const värde = (key: keyof SkolaProgram["nyckeltal"]): NyckeltalVärde =>
      nyckeltalVärdeAv(nyastaMatvärde(p.matt[PROGRAM_NYCKELTAL_MATT[key]]));
    return {
      kod: p.programkod,
      namn: namnAv.get(p.programkod) ?? p.programkod,
      antalElever: nyckeltalVärdeAv(nyastaMatvärde(p.matt.totalNumberOfPupils)),
      nyckeltal: {
        lägstaAntagningspoäng: värde("lägstaAntagningspoäng"),
        genomsnittligAntagningspoäng: värde("genomsnittligAntagningspoäng"),
        andelMedExamenInom3År: värde("andelMedExamenInom3År"),
        betygspoängMedExamen: värde("betygspoängMedExamen"),
        andelMedHögskolebehörighet: värde("andelMedHögskolebehörighet"),
      },
    };
  });
}

/**
 * Duplicates `sumProgramElever` from `lib/program-compare.ts` rather than
 * importing it — that module imports from the `@/lib/skolregister` barrel,
 * so importing it back from here would be a cycle. Small and stable enough
 * to keep in sync by inspection.
 */
function sumProgramElever(program: SkolaProgram[]): number | null {
  const tal = program
    .map((p) => (p.antalElever.status === "finns" ? p.antalElever.tal : null))
    .filter((v): v is number => v != null);
  return tal.length ? tal.reduce((sum, v) => sum + v, 0) : null;
}

/**
 * Newest `totalNumberOfPupils` across whichever skolform reports one — units
 * running several forms sum nothing here, they just take the first that has
 * a figure, matching the register's own "one elevantal per unit" framing.
 * `statistik.gy.matt` never carries this (gymnasiets elevantal lives entirely
 * per program, see the source's own doc), so gymnasieskolor fall back to the
 * sum of their programmes' own elevantal — the same fallback `/skolor/[kod]`
 * already applied on its own, now folded in here so every consumer of
 * `SkolorRad`/`HuvudmanRad` (list views, huvudman aggregation) sees it too,
 * not just the one page that used to compute it locally.
 */
function byggAntalElever(
  info: Skolinfo,
  program: SkolaProgram[],
): Pick<SkolorRad, "antalElever" | "antalEleverKälla"> {
  for (const kod of info.skolformer) {
    const tal = nyastaTal(info.statistik[kod]?.matt.totalNumberOfPupils);
    if (tal != null) return { antalElever: tal, antalEleverKälla: "rapporterat" };
  }
  const summerat = sumProgramElever(program);
  return {
    antalElever: summerat,
    antalEleverKälla: summerat != null ? "summerat" : null,
  };
}

function byggSkolorRad(info: Skolinfo): SkolorRad {
  const årskurserPerSkolform = info.grund.skolformer
    .filter((f) => f.arskurser.length > 0)
    .map((f) => ({ kod: f.kod, skolform: skolformLabel(f.kod), årskurser: f.arskurser }));
  const årskurser = [...new Set(årskurserPerSkolform.flatMap((f) => f.årskurser))].sort(
    (a, b) => Number(a) - Number(b),
  );
  const program = byggProgram(info);

  return {
    skolenhetskod: info.skolenhetskod,
    namn: info.grund.namn,
    // The source has no per-unit driftstatus field — every unit it carries is
    // implicitly active (confirmed: `enskilda.traffar[].status` is "AKTIV"
    // for all 1307 fristående entries, and the source only ever describes
    // currently-registered units).
    status: "Aktiv",
    huvudman: info.grund.huvudmanNamn ?? "",
    huvudmannaOrgnr: info.grund.organisationsnummer,
    huvudmannatyp: info.grund.huvudmannatyp || "Okänd",
    kommun: null, // resolved by the caller via `kommunName` — see `listSkolor`.
    kommunkod: info.grund.omradeskod,
    skolformer: info.grund.skolformer.map((f) => skolformLabel(f.kod)),
    gymnasieprogram: program.map((p) => p.namn),
    ...byggAntalElever(info, program),
    årskurser,
    årskurserPerSkolform,
  };
}

/** `listSkolor`'s rows resolve `kommun` themselves so `resources.ts` doesn't need to import UI-adjacent lookup tables — done here instead, right next to where `kommunkod` is set, to keep the two in sync. */
import { kommunName } from "@/data/kommuner";

let skolorCache: Promise<SkolorRad[]> | null = null;

/**
 * Building a `SkolorRad` involves scanning every skolform's `matt` time
 * series (`byggAntalElever`, `byggProgram` for gymnasieprogram names), so
 * this is cached rather than rebuilt from scratch on every call —
 * `getKommunNyckeltalStats` alone calls `listSkolor()` once per skolenhet
 * page (~6500 times), and without this cache each of those redid the full
 * 6500-unit build from zero.
 */
export function listSkolor(): Promise<SkolorRad[]> {
  if (!skolorCache) {
    skolorCache = skolinfoIndex().then((index) =>
      [...index.values()].map((info) => {
        const rad = byggSkolorRad(info);
        return { ...rad, kommun: kommunName(rad.kommunkod) };
      }),
    );
  }
  return skolorCache;
}

export async function listHuvudman(): Promise<HuvudmanRad[]> {
  const { buildHuvudmanRows } = await import("./huvudman");
  return buildHuvudmanRows();
}

/** `AlltFile.kord` — when this run of the collector started. Replaces the old export's `byggd`. */
export async function getRegisterByggd(): Promise<string | null> {
  const file = await alltFile();
  return file.kord;
}

const skolaCache = new Map<string, Promise<SkolaDetalj | null>>();

/**
 * Cached per skolenhetskod — `getKommunNyckeltalStats` and
 * `getBeräknatRiksGenomsnitt` both call this for every unit in a kommun (or
 * the whole register), repeatedly across pages. Rebuilding `nyckeltal`/
 * `program` from the `matt` time series on every one of those calls is what
 * turned a couple-minute build into an eighteen-minute one; caching by kod
 * makes every call after the first a map lookup.
 */
export function getSkola(kod: string): Promise<SkolaDetalj | null> {
  const cached = skolaCache.get(kod);
  if (cached) return cached;
  const result = byggSkola(kod);
  skolaCache.set(kod, result);
  return result;
}

async function byggSkola(kod: string): Promise<SkolaDetalj | null> {
  const enligtUppslag = await uppslag(kod);
  if (!enligtUppslag || enligtUppslag.typ === "finns-inte") return null;
  // "fel" (we failed to ask, data might exist) collapses to null here too:
  // `generateStaticParams` only ever iterates `listSkolor()`, which already
  // excludes non-"hittad" entries, so a "fel" unit is unreachable through the
  // static build and only matters for a direct/dynamic visit — a dash-filled
  // detail page would say nothing more useful than not-found does.
  if (enligtUppslag.typ === "fel") return null;

  const info = enligtUppslag.info;
  const rad = byggSkolorRad(info);
  const adress = info.grund.adresser[0];

  return {
    ...rad,
    kommun: kommunName(rad.kommunkod),
    rektor: null, // not present in this source
    startdatum: info.grund.startdatum,
    besöksadress: adress
      ? [adress.gata, [adress.postnummer, adress.ort].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", ")
      : null,
    telefon: info.grund.telefon,
    webbplats: info.grund.webb,
    epost: info.grund.epost,
    koordinater:
      info.grund.lat != null && info.grund.long != null
        ? { latitud: info.grund.lat, longitud: info.grund.long }
        : null,
    program: byggProgram(info),
    nyckeltal: byggNyckeltal(info),
    salsa: info.salsa,
  };
}

const FRÅGEOMRÅDE_TILL_APP_NYCKEL = {
  satisfaction: "nöjdhet",
  security: "trygghet",
  workingEnvironment: "studiero",
  support: "stöd",
  inspiration: "stimulans",
  recommend: "rekommendation",
} as const;

const ENKÄT_SKOLFORM_NAMN: Record<string, string> = {
  pupilsgr: "Grundskolan",
  pupilsgy: "Gymnasieskolan",
};

function byggEnkätfråga(
  m:
    | {
        fraga: string | null;
        amne: string | null;
        medel: number | null;
        andelar: Record<string, string | null>;
      }
    | undefined,
): Enkätfråga | null {
  if (!m) return null;
  const svarsfördelning: Record<string, number> = {};
  for (const [option, andel] of Object.entries(m.andelar)) {
    const tal = parseAndelString(andel);
    if (tal != null) svarsfördelning[option] = tal;
  }
  return { fråga: m.fraga ?? "", ämne: m.amne, genomsnitt: m.medel, svarsfördelning };
}

export async function getSkolenkät(kod: string): Promise<Skolenkät> {
  const index = await skolinfoIndex();
  const info = index.get(kod);
  const tom: Skolenkät = { skolenhetskod: kod, vårdnadshavare: [], elever: [] };
  if (!info) return tom;

  const vårdnadshavare: Vårdnadshavarenkät[] = []; // never collected in this source
  const elever: Elevenkät[] = [];

  for (const [enkatKey, enkat] of Object.entries(info.enkater)) {
    const skolform = ENKÄT_SKOLFORM_NAMN[enkatKey] ?? enkatKey;
    for (const å of enkat.arskurser) {
      const frågor = Object.fromEntries(
        Object.entries(FRÅGEOMRÅDE_TILL_APP_NYCKEL).map(([källa, mål]) => [
          mål,
          byggEnkätfråga(å.matningar[källa as keyof typeof å.matningar]),
        ]),
      ) as Record<
        (typeof FRÅGEOMRÅDE_TILL_APP_NYCKEL)[keyof typeof FRÅGEOMRÅDE_TILL_APP_NYCKEL],
        Enkätfråga | null
      >;

      elever.push({
        skolform,
        läsår: å.termin,
        antalSvar: å.antalSvar,
        årskurs: å.arskurs,
        antalIGruppen: å.antalIGrupp,
        svarsfrekvens: parseAndelString(å.svarsfrekvens),
        ...frågor,
      });
    }
  }

  return { skolenhetskod: kod, vårdnadshavare, elever };
}

export async function getSkolinspektionDokument(
  kod: string,
): Promise<SkolinspektionDokumentgrupp[]> {
  const index = await skolinfoIndex();
  const info = index.get(kod);
  if (!info) return [];

  const grupper = new Map<string, SkolinspektionDokument[]>();
  for (const d of info.dokument) {
    const label = skolformLabel(d.skolform);
    const dok: SkolinspektionDokument = {
      typ: d.typ,
      typId: d.typId,
      titel: d.titel,
      filnamn: d.filnamn,
      mimetyp: d.mimeType,
      storlekBytes: d.storlek,
      url: d.url,
    };
    const grupp = grupper.get(label);
    if (grupp) grupp.push(dok);
    else grupper.set(label, [dok]);
  }
  return [...grupper.entries()].map(([skolform, dokument]) => ({ skolform, dokument }));
}
