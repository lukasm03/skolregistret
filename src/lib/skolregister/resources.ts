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
  programsnitt,
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
  Registerdetalj,
  RegisterdetaljAttribut,
  SkolaDetalj,
  SkolaKällhänvisning,
  SkolaProgram,
  Skolenkät,
  Skolform,
  Skolinfo,
  SkolinfoUppslag,
  SkolinspektionDokument,
  SkolinspektionDokumentgrupp,
  SkolorRad,
  Statistik,
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

let registerdetaljIndexCache: Promise<Map<string, Registerdetalj>> | null = null;

/**
 * skolenhetskod → `registerdetalj`, Skolverkets `skolenhetsregistret/v2`
 * uppslag for the unit — built from `offentliga[kod].registerdetalj`
 * directly for kommunala m.fl. enheter and `enskilda.traffar[].registerdetalj`
 * for fristående, since `skolinfo` carries no such field of its own (see
 * `OffentligUppslag`). The two paths together cover every kod `skolinfoIndex`
 * does (6 518 of 6 518 on today's export), so `byggSkola` reads name, address,
 * contact details and rektor from here rather than the
 * `planned-educations`-sourced `Grunduppgifter`, which this source supersedes
 * for those fields.
 */
function registerdetaljIndex(): Promise<Map<string, Registerdetalj>> {
  if (!registerdetaljIndexCache) {
    registerdetaljIndexCache = alltFile().then((file) => {
      const index = new Map<string, Registerdetalj>();
      for (const post of Object.values(file.offentliga)) {
        if (post.typ === "hittad")
          index.set(post.registerdetalj.schoolUnitCode, post.registerdetalj);
      }
      for (const traff of file.enskilda.traffar) {
        index.set(traff.schoolUnitCode, traff.registerdetalj);
      }
      return index;
    });
  }
  return registerdetaljIndexCache;
}

let programNamnIndexCache: Promise<Map<string, string>> | null = null;

/**
 * programkod → studievagsnamn, unioned across every unit's own
 * `utbildningar` rather than read one unit at a time. `byggProgram` used to
 * build this map from just the unit it was naming programmes for, which
 * meant the same programkod displayed as a resolved name ("Samhällsvetenskaps-
 * programmet") on a unit whose own `utbildningar` happened to carry it and as
 * the bare code ("SA25") on a unit that hadn't (yet) been sent that entry —
 * two different filter chips on `/skolor` for what is the same national
 * programme. Every code observed maps to exactly one name across today's
 * export (no unit disagrees with another), so first-write-wins here never
 * has to arbitrate a conflict.
 */
function programNamnIndex(): Promise<Map<string, string>> {
  if (!programNamnIndexCache) {
    programNamnIndexCache = skolinfoIndex().then((index) => {
      const namnAv = new Map<string, string>();
      for (const info of index.values()) {
        for (const u of info.utbildningar) {
          if (!namnAv.has(u.studievagskod)) namnAv.set(u.studievagskod, u.studievagsnamn);
        }
      }
      return namnAv;
    });
  }
  return programNamnIndexCache;
}

function formatAdress(
  gata: string | null,
  postnummer: string | null,
  ort: string | null,
): string {
  return [gata, [postnummer, ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/**
 * `registerdetalj`'s `schoolName` over `displayName`: `displayName` sometimes
 * disambiguates skolenheter that share a huvudman's name (e.g. "Luleå
 * gymnasieskola, skolenhet B"), but for 26 of 6 518 units today it's a
 * data-entry slip that appends the unit's own skolenhetskod instead — e.g.
 * "Anna Whitlocks gymnasium 54040574" — which `schoolName` doesn't carry.
 * `Grunduppgifter.namn`, the fallback for the handful of units with no
 * `registerdetalj`, has the identical typo for those same units, so it still
 * needs the same trailing-kod strip.
 */
function skolNamn(
  kod: string,
  grundNamn: string,
  registerdetalj: Registerdetalj | null,
): string {
  const namn = registerdetalj?.schoolName ?? grundNamn;
  return namn.endsWith(` ${kod}`) ? namn.slice(0, -(kod.length + 1)) : namn;
}

/**
 * Prefers `BESOKSADRESS` and falls back to whichever address the unit does
 * carry — the ~15 utlandsskolor in today's export have only an
 * `UTLANDSADRESS`, with no street, so there is nothing to prefer it over.
 */
function besöksadress(attribut: RegisterdetaljAttribut): string | null {
  const adress =
    attribut.addresses.find((a) => a.type === "BESOKSADRESS") ?? attribut.addresses[0];
  return adress
    ? formatAdress(adress.streetAddress, adress.postalCode, adress.locality)
    : null;
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

/** One decimal, Swedish comma — the shape the register writes its own lärartal in. */
const enDecimal = new Intl.NumberFormat("sv-SE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * A skolform-level nyckeltal averaged out of the unit's gymnasieprogram.
 *
 * Only ever reached for "gy": that skolform's own `matt` is empty in every
 * record the register serves — the figures live per program — so andelen
 * behöriga lärare and elever per lärare were "saknas" on every gymnasieskola
 * in the app, 1 131 of the 1 240 units with a gy-block, while the numbers sat
 * one level down the same response. `programsnitt` does the averaging and
 * documents what it is safe to average; this only dresses the result as the
 * `NyckeltalVärde` the rest of the app reads, marked `härlett` so the page
 * can say the figure is ours.
 *
 * `text` is written here rather than taken from the register, which is the
 * one place in this file that happens: an average has no register string to
 * quote.
 */
function programhärlettVärde(stat: Statistik, matt: string): NyckeltalVärde | null {
  const snitt = programsnitt(stat.program, matt);
  if (!snitt) return null;
  return {
    status: "finns",
    text: enDecimal.format(snitt.tal),
    tal: snitt.tal,
    läsår: snitt.period,
    härlett: {
      från: "gymnasieprogram",
      antalProgram: snitt.antalProgram,
      elevviktat: snitt.elevviktat,
    },
  };
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
    const eget = nyckeltalVärdeAv(stat ? nyastaMatvärde(stat.matt[def.matt]) : null);
    if (eget.status === "finns" || !stat || skolform !== "gy") return eget;
    // Gymnasiet only. A unit whose primary skolform is something else is
    // compared against *that* form's riksgenomsnitt (see `riksFör` in
    // `lib/skola-detalj.ts`), and a gy-derived figure held up against
    // förskoleklassens snitt would be a worse answer than the dash it
    // replaced.
    return programhärlettVärde(stat, def.matt) ?? eget;
  };
  return {
    meritvärdeÅrskurs9: värde("meritvärdeÅrskurs9"),
    andelGodkändaÅrskurs9: värde("andelGodkändaÅrskurs9"),
    andelBehörigaLärare: värde("andelBehörigaLärare"),
    eleverPerLärare: värde("eleverPerLärare"),
  };
}

/**
 * The collector's own address for each block the skolenhet page shows.
 *
 * `info.kallor` is keyed the way the collector fetched — `statistik/gr`,
 * `enkat/pupilsgy` — and this is the only place those keys are taken apart.
 * The statistics and enkät blocks are per skolform, so both resolve through
 * `primärSkolform`, which is the same block `byggNyckeltal` reads its figures
 * from; a unit with two of either would otherwise cite whichever came first
 * in the object.
 */
function byggKällor(
  info: Skolinfo,
  registerdetalj: Registerdetalj | null,
): SkolaKällhänvisning {
  const primär = primärSkolform(info);
  const enkätNyckel = primär === "gy" ? "enkat/pupilsgy" : "enkat/pupilsgr";
  const enkäter = Object.keys(info.kallor).filter((k) => k.startsWith("enkat/"));
  return {
    // `registerdetalj.kalla` is skolenhetsregistret/v2 — the actual source of
    // namn/adress/kontaktuppgifter/rektor below, and what the Källor row's
    // "Skolverkets skolenhetsregister" label already claims to link to.
    // `info.kallor.grund` (planned-educations) is the fallback for the rare
    // unit missing a `registerdetalj`.
    registeruppgifter: registerdetalj?.kalla ?? info.kallor.grund ?? null,
    nyckeltal: primär ? (info.kallor[`statistik/${primär}`] ?? null) : null,
    salsa: info.kallor.salsa ?? null,
    enkät: info.kallor[enkätNyckel] ?? (enkäter[0] ? info.kallor[enkäter[0]]! : null),
    dokument: info.kallor.dokument ?? null,
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
 * `EK` and `EK25` are the same national gymnasieprogram, pre- and post-
 * GY25-reform — `schoolTypeProperties.gy.programmes` lists both while a unit
 * still runs classes under the old curriculum (continuing students)
 * alongside the new one (new intake). Collapse each such pair onto its
 * pre-reform code so the list reads as programmes rather than curriculum
 * vintages. A code that only appears in its "25" form — the programme has
 * already switched over entirely, nobody left on the old one — is left as
 * is: there's no pre-reform code here to collapse it onto.
 */
function dedupeGyProgramkoder(koder: string[]): string[] {
  const utanReform = new Set(koder.filter((k) => !k.endsWith("25")));
  return koder.filter((k) => !(k.endsWith("25") && utanReform.has(k.slice(0, -2))));
}

/**
 * The rest of a programkod's name comes from the register itself
 * (`programNamnIndex`) — this table exists only for codes that never occur
 * in any unit's `utbildningar` there, so they'd otherwise show as a bare
 * code forever. Confirmed by hand against Skolverket's own pages rather than
 * guessed: the four introduktionsprogram-inriktningar aren't individually
 * named anywhere in `utbildningar`, which lists their specific tracks
 * instead, and `HV25` (Hantverksprogrammet) simply isn't reported by name
 * for any unit in today's export. Extend this only for a code you've
 * likewise verified against skolverket.se — an unverified guess here is
 * worse than the bare code it would replace.
 */
const KÄNDA_PROGRAMNAMN: Record<string, string> = {
  HV25: "Hantverksprogrammet",
  IMA: "Introduktionsprogram, individuellt alternativ",
  IMS: "Introduktionsprogram, språkintroduktion",
  IMV: "Introduktionsprogram, programinriktat val",
  IMY: "Introduktionsprogram, yrkesintroduktion",
};

/**
 * Programme names: `namnAv` is the register-wide `programNamnIndex`, not
 * just this unit's own `utbildningar` — see that function for why a
 * per-unit map produced two filter chips for the same programme.
 * `KÄNDA_PROGRAMNAMN` catches the handful of codes the register never names
 * anywhere; anything past that falls back to the bare programkod rather
 * than a guessed name.
 *
 * `gy.program` gets the same `dedupeGyProgramkoder` pass as `programkoder`
 * below: no unit in today's export reports statistics under both a
 * pre-reform code and its GY25 pair, but this list also feeds
 * `SkolorRad.gymnasieprogram` — and through it the skolor page's programme
 * filter — so a school that does start reporting both should still offer
 * one filter chip per programme, not two.
 */
function byggProgram(info: Skolinfo, namnAv: Map<string, string>): SkolaProgram[] {
  const gy = info.statistik.gy;
  if (!gy) return [];
  const koder = new Set(dedupeGyProgramkoder(gy.program.map((p) => p.programkod)));
  return gy.program
    .filter((p) => koder.has(p.programkod))
    .map((p) => {
      const värde = (key: keyof SkolaProgram["nyckeltal"]): NyckeltalVärde =>
        nyckeltalVärdeAv(nyastaMatvärde(p.matt[PROGRAM_NYCKELTAL_MATT[key]]));
      return {
        kod: p.programkod,
        namn: namnAv.get(p.programkod) ?? KÄNDA_PROGRAMNAMN[p.programkod] ?? p.programkod,
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

function byggSkolorRad(
  info: Skolinfo,
  registerdetalj: Registerdetalj | null,
  programNamnAv: Map<string, string>,
): SkolorRad {
  const årskurserPerSkolform = info.grund.skolformer
    .filter((f) => f.arskurser.length > 0)
    .map((f) => ({ kod: f.kod, skolform: skolformLabel(f.kod), årskurser: f.arskurser }));
  const årskurser = [...new Set(årskurserPerSkolform.flatMap((f) => f.årskurser))].sort(
    (a, b) => Number(a) - Number(b),
  );
  const program = byggProgram(info, programNamnAv);

  return {
    skolenhetskod: info.skolenhetskod,
    namn: skolNamn(info.skolenhetskod, info.grund.namn, registerdetalj),
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
    skolorCache = Promise.all([
      skolinfoIndex(),
      registerdetaljIndex(),
      programNamnIndex(),
    ]).then(([index, registerdetaljer, programNamnAv]) =>
      [...index.values()].map((info) => {
        const rad = byggSkolorRad(
          info,
          registerdetaljer.get(info.skolenhetskod) ?? null,
          programNamnAv,
        );
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
  const [registerdetaljer, programNamnAv] = await Promise.all([
    registerdetaljIndex(),
    programNamnIndex(),
  ]);
  const registerdetalj = registerdetaljer.get(kod) ?? null;
  const rad = byggSkolorRad(info, registerdetalj, programNamnAv);
  const attribut = registerdetalj?.attributes ?? null;
  const grundAdress = info.grund.adresser[0];

  return {
    ...rad,
    kommun: kommunName(rad.kommunkod),
    rektor: attribut?.headMaster ?? null,
    startdatum: attribut?.startdate ?? info.grund.startdatum,
    besöksadress: attribut
      ? besöksadress(attribut)
      : grundAdress
        ? formatAdress(grundAdress.gata, grundAdress.postnummer, grundAdress.ort)
        : null,
    telefon: attribut?.phoneNumber ?? info.grund.telefon,
    webbplats: attribut?.url ?? info.grund.webb,
    epost: attribut?.email ?? info.grund.epost,
    koordinater:
      info.grund.lat != null && info.grund.long != null
        ? { latitud: info.grund.lat, longitud: info.grund.long }
        : null,
    program: byggProgram(info, programNamnAv),
    programkoder: dedupeGyProgramkoder(
      attribut?.schoolTypeProperties.gy?.programmes ?? [],
    ),
    nyckeltal: byggNyckeltal(info),
    salsa: info.salsa,
    källor: byggKällor(info, registerdetalj),
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
