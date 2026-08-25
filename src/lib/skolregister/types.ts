/**
 * Two families of type live here.
 *
 * The first mirrors `data/allt.json` field-for-field, Swedish names kept
 * exactly as the source spells them — nothing outside `resources.ts` and
 * `statistics.ts` should assume this shape.
 *
 * The second is this module's own stable output contract: `SkolorRad`,
 * `SkolaDetalj`, `HuvudmanRad`, `Nyckeltal`/`NyckeltalVärde`, `SkolaProgram`,
 * `Skolenkät`, `SkolinspektionDokument(grupp)`, `KommunNyckeltalStat`,
 * `BeräknatRiksGenomsnitt` and `EnkätGrupp`. Everything above `resources.ts`
 * — `api-normalize.ts`, the `*-compare.ts` builders, `dokument-view.ts` —
 * consumes only these, never the raw `allt.json` shapes directly, so the data
 * source can change again without touching that layer.
 */

// ---------------------------------------------------------------------------
// Raw shapes from data/allt.json
// ---------------------------------------------------------------------------

/** Top level of `data/allt.json`. */
export interface AlltFile {
  /** ISO, when this run of the collector started. Same value as `karta.kord`. */
  kord: string;
  /**
   * Every address the collector read, as templates with named placeholders —
   * `…/school-units/{skolenhetskod}/statistics/{skolform}`. The register-wide
   * answer to "where is this from"; the per-subject one is `Skolinfo.kallor`
   * and `Bolagsuppslag.kallor`, which carry the same addresses filled in.
   *
   * `src/config/site.ts` mirrors the ones a Källor row names — keep the two
   * in step when the collector changes an API version.
   */
  kallor: string[];
  karta: Karta | null;
  /** 1307-ish fristående skolenheter. */
  skolinfo: Record<string, SkolinfoUppslag>;
  /** 5200-ish kommunala/kommunalförbund/region/specialskola/sameskola enheter. Disjoint keyset from `skolinfo`. */
  offentliga: Record<string, OffentligUppslag>;
  enskilda: EnskildaResultat;
  bolag: Record<string, Bolagsuppslag>;
  validering: Record<string, Valideringsrapport>;
  /** Empty in every export seen so far; the collector's own consistency checks. */
  invarianter: unknown[];
  statistik: Record<string, number>;
}

export interface Karta {
  kord: string;
  koncerndataFran: { aldsta: string; nyaste: string };
  /** Störst först. */
  koncerner: Koncerngrupp[];
  /** Huvudmän med inga koncern enligt Dun & Bradstreet. */
  fristaende: HuvudmanMedSkolor[];
  /** Huvudmän vars koncernuppslag misslyckades — vet ingenting om koncern, INTE detsamma som `fristaende`. */
  ejUppslagna: Array<HuvudmanMedSkolor & { fel: string }>;
  statistik: {
    skolor: number;
    huvudman: number;
    koncerner: number;
    huvudmanIKoncern: number;
    skolorIKoncern: number;
    huvudmanIDeladKoncern: number;
  };
}

export interface Koncerngrupp {
  koncernmoder: { orgnr: string; namn: string | null };
  /** Dun & Bradstreets eget datum, t.ex. "2025-06" — kan vara år gammalt. */
  asof: string | null;
  /** Hela koncernen enligt D&B, inte bara de skoldrivande. */
  bolagIKoncernen: number | null;
  /** Bara de huvudmän som faktiskt driver skolenheter. */
  huvudman: HuvudmanMedSkolor[];
  antalSkolor: number;
  trad: {
    kalla: string;
    count: number | null;
    asof: string | null;
    moderbolag: string | null;
    /** Platt, dokumentordning — se `buildTrädFrånNoder` i `koncern.ts` för hur trädet återskapas ur `djup`. */
    noder: TradNod[];
  };
}

export interface TradNod {
  orgnr: string;
  namn: string | null;
  land: string | null;
  anstallda: number | null;
  /** 0 är koncernmodern; varje efterföljande nod hänger under närmast föregående nod med lägre `djup`. */
  djup: number;
}

export interface HuvudmanMedSkolor {
  organizationNumber: string;
  namn: string;
  skolor: EnskildTraff[];
}

export interface EnskildTraff {
  kalla: string;
  schoolUnitCode: string;
  skola: string;
  status: string;
  kommunkod: string | null;
  /** VERSALER här, t.ex. ["FSK","GR"] — till skillnad från `skolinfo` som är gemener. */
  skolformer: string[];
  organizationNumber: string;
  huvudmanNamn: string;
  /**
   * A second Skolverket-uppslag för samma enhet, `skolenhetsregistret/v2` —
   * engelska fältnamn rakt av, ingen översättning gjord här till skillnad
   * från `Grunduppgifter`. Det här är fristående enheters enda väg dit: en
   * kommunal enhet har ingen `EnskildTraff` alls, men når samma `Registerdetalj`
   * ändå, top-level på sitt eget `offentliga`-uppslag — se `OffentligUppslag`.
   * `resources.ts` slår ihop de två vägarna till ett index och läser namn,
   * adress, kontaktuppgifter och rektor härifrån snarare än ur
   * `Grunduppgifter`, som den här källan numera är den bättre av de två för.
   */
  registerdetalj: Registerdetalj;
}

export interface Registerdetalj {
  kalla: string;
  schoolUnitCode: string;
  displayName: string;
  schoolName: string;
  status: string;
  municipalityCode: string | null;
  schoolTypes: string[];
  huvudman: {
    kalla: string;
    organizationNumber: string;
    displayName: string;
    organizerType: string;
  };
  attributes: RegisterdetaljAttribut;
}

export interface RegisterdetaljAttribut {
  displayName: string;
  status: string;
  url: string | null;
  email: string;
  phoneNumber: string;
  /** Rektorns namn — enda platsen i källan som har den. Saknas för en enda enhet av 6 518 i dagens export. */
  headMaster?: string;
  addresses: Array<{
    /** T.ex. "BESOKSADRESS", "POSTADRESS", "LEVERANSADRESS" — eller "UTLANDSADRESS" för en utlandsskola, som saknar besöksadress helt. */
    type: string;
    streetAddress: string | null;
    postalCode: string | null;
    locality: string | null;
    /** Bara på en del adresser, mestadels BESOKSADRESS. */
    geoCoordinates?: {
      coordinateSweRefN: string;
      coordinateSweRefE: string;
      latitude: string;
      longitude: string;
    };
  }>;
  orientationType: string;
  schoolUnitType: string;
  schoolName: string;
  municipalityCode: string | null;
  schoolTypes: string[];
  /**
   * Gemener skolformsnyckel → dess egna properties; formen skiljer sig per
   * skolform (`grades` för grundskoleliknande, `programmes`/`csnCode` för
   * "gy", `schoolTypeParts` för "vux").
   */
  schoolTypeProperties: Record<
    string,
    {
      grades?: string[];
      programmes?: string[];
      csnCode?: string;
      schoolTypeParts?: string[];
    }
  >;
  specialSupportSchool: boolean;
  hospitalSchool: boolean;
  startdate: string | null;
}

export interface EnskildaResultat {
  /** 1307, samtliga status "AKTIV". */
  traffar: EnskildTraff[];
  perHuvudman: Record<string, EnskildTraff[]>;
  offentliga: number;
  utanHuvudman: string[];
  fel: Array<{ schoolUnitCode: string; fel: string }>;
}

export type SkolinfoUppslag =
  | { typ: "hittad"; info: Skolinfo }
  /** Registret har ingen sådan enhet. */
  | { typ: "finns-inte" }
  /** Vi lyckades inte fråga — uppgiften kan finnas. */
  | { typ: "fel"; fel: string };

/**
 * Samma tre former som `SkolinfoUppslag`, men en "hittad" `offentliga`-post
 * bär också sitt eget `registerdetalj` top-level — `skolinfo` (fristående)
 * har inget sådant fält; dess `registerdetalj` nås bara via
 * `enskilda.traffar[]`. `resources.ts` slår ihop de två vägarna till ett
 * index i stället för att grena på vilken av de två mängderna en kod kom
 * ifrån.
 */
export type OffentligUppslag =
  | { typ: "hittad"; info: Skolinfo; registerdetalj: Registerdetalj }
  | { typ: "finns-inte" }
  | { typ: "fel"; fel: string };

/** Delarna av en `Skolinfo` som kan saknas eller ha gått fel att hämta. */
export type Del = "statistik" | "enkater" | "dokument" | "salsa" | "utbildningar";

export interface Skolinfo {
  skolenhetskod: string;
  /** ISO, när VI hämtade. */
  hamtad: string;
  grund: Grunduppgifter;
  /** Gemener, t.ex. ["fsk","gr"]. */
  skolformer: string[];
  /** Bara gymnasiala. */
  utbildningar: Utbildning[];
  statistik: Record<string, Statistik>;
  enkater: Record<string, Enkat>;
  dokument: RåDokument[];
  salsa: Salsa | null;
  saknas: Del[];
  fel: Array<{ del: Del; fel: string }>;
  /**
   * Where each block of this unit came from, keyed as the collector fetched
   * it: `grund`, `dokument`, `lankar`, `salsa`, `utbildningar`, and one
   * `statistik/<skolformsnyckel>` and `enkat/<enkätnyckel>` per block it
   * found. Every block that carries data has an entry — all 6 519 units in
   * today's export, checked — so a missing key means the block is missing,
   * not that its address is unknown.
   *
   * These are the URLs the Källor sections link to. `resources.ts` resolves
   * them into `SkolaDetalj.källor`, which is the only form the app above
   * `skolregister/` sees; nothing up there should be splitting these keys.
   */
  kallor: Record<string, string>;
}

export interface Grunduppgifter {
  kod: string;
  namn: string;
  startdatum: string | null;
  resursskola: boolean;
  utlandsskola: boolean;
  epost: string | null;
  webb: string | null;
  telefon: string | null;
  adresser: Array<{
    typ: string;
    gata: string | null;
    postnummer: string | null;
    ort: string | null;
  }>;
  /** Kommunkod, fyra tecken, t.ex. "0126" — behåll som sträng. */
  omradeskod: string | null;
  lat: number | null;
  long: number | null;
  /** Huvudmannens org.nr — join-nyckeln, 10 siffror utan bindestreck. */
  organisationsnummer: string | null;
  huvudmanNamn: string | null;
  huvudmannatyp: string;
  /** INTE en bolagsform — en exakt kopia av `huvudmannatyp`. Den riktiga formen finns i `bolag[orgnr].organisation.juridiskForm`. */
  bolagsform: string | null;
  inriktning: string;
  skolformer: SkolformGrund[];
}

export interface SkolformGrund {
  /** Gemener, Skolverkets skolformsnyckel, t.ex. "gr". */
  kod: string;
  /** Registrets svenska namn, t.ex. "Grundskolan" — matcha ALDRIG mot detta, bara mot `kod`. */
  namn: string;
  /** Årskurser för den här skolformen. Tom array betyder "inte redovisat", inte "inga årskurser". */
  arskurser: string[];
}

export interface Utbildning {
  id: string;
  skolform: string;
  studievagskod: string;
  studievagsnamn: string;
  kategori: string;
  inriktning: string;
  start: string | null;
  slut: string | null;
  antagningspoangMin: number | null;
  antagningspoangMedel: number | null;
  antagningsar: string | null;
}

export type Vardetyp =
  | "EXISTS"
  | "MISSING"
  | "OMITTED_DUE_TO_BASED_ON_FEW_PUPILS"
  | "ROUNDED_OFF_DUE_TO_FEW_PUPILS_NOT_ELIGIBLE"
  | "TEACHERS_EXCLUDED_DUE_TO_NO_REQUIRED_LEGITIMATION"
  | (string & {});

/** Ett värde ur en tidsserie. `tal` är det enda talet att läsa — `varde` kan vara avrundat ("cirka 10") utan att det syns i `tal`. */
export interface Matvarde {
  varde: string | null;
  typ: Vardetyp;
  period: string | null;
  /** Satt ENDAST när `typ === "EXISTS"`. */
  tal: number | null;
}

export interface Statistik {
  skolform: string;
  /** Tidsserie per mått, nyaste först — men läs alltid `period`, lita aldrig på positionen. */
  matt: Record<string, Matvarde[]>;
  text: Record<string, string | null>;
  /** Bara "gy" har innehåll här — `statistik.gy.matt` är alltid tom, allt ligger per program. */
  program: Array<{
    programkod: string;
    matt: Record<string, Matvarde[]>;
    text: Record<string, string | null>;
  }>;
}

export type Fragomrade =
  | "satisfaction"
  | "security"
  | "workingEnvironment"
  | "support"
  | "inspiration"
  | "recommend";

export interface Matning {
  fraga: string | null;
  amne: string | null;
  medel: number | null;
  /** Sträng-värden: en riktig andel ("57%"), "-" (maskerad), eller nyckeln saknas (frågan ställdes inte). */
  andelar: Record<string, string | null>;
}

export interface EnkatArskurs {
  termin: string;
  arskurs: string;
  antalSvar: number | null;
  antalIGrupp: number | null;
  /** Sträng, t.ex. "67%". */
  svarsfrekvens: string | null;
  matningar: Partial<Record<Fragomrade, Matning>>;
}

/** Bara `pupilsgr`/`pupilsgy` förekommer i praktiken — vårdnadshavarenkäterna ligger alltid i `saknas`. */
export interface Enkat {
  enkat: string;
  arskurser: EnkatArskurs[];
}

/** `Skolinfo.dokument[]` — namnet "Rå" skiljer den från den här modulens stabila `SkolinspektionDokument`. */
export interface RåDokument {
  skolform: string;
  typId: string;
  typ: string;
  titel: string;
  url: string;
  filnamn: string;
  mimeType: string;
  storlek: number | null;
}

/**
 * Ett enda läsår, inte en tidsserie: `period` bär det (2024/25 i varje av de
 * 1 467 enheter som har ett salsa-block i dagens export), och `matt` bär ett
 * enskilt `Matvarde` per nyckel — till skillnad från `Statistik.matt`, där
 * varje mått är en serie och varje värde bär sin egen period. Läs `period`
 * i stället för att skriva årtalet i vyn. Kända nycklar:
 * `salsaAverageGradesIn9thGrade{Actual,Deviation}`,
 * `salsaRequirementsReached{Actual,Deviation,Calculated}`,
 * `salsaNewlyImmigratedQuota`, `salsaBoysQuota`, `salsaParentsEducation`,
 * `salsaAverageCalculated`.
 */
export interface Salsa {
  period: string | null;
  matt: Record<string, Matvarde>;
}

export interface Bolagsuppslag {
  orgnr: string;
  /**
   * Bolagsverkets own endpoints, and the reason they are provenance rather
   * than links: both sit on `gw.api.bolagsverket.se`, which needs a Bearer
   * token — the same wall `dokument[].url` below is behind.
   */
  kallor: { organisation?: string; dokumentlista?: string };
  status: "aktiv" | "avregistrerad" | "okand" | "fel";
  organisation: Organisation | null;
  dokument: Array<{
    dokumentId: string;
    filformat: string | null;
    rapporteringsperiodTom: string | null;
    registreringstidpunkt: string | null;
    /** Kräver Bearer-token — INTE direktlänkningsbar, till skillnad från Skolverkets dokument-URL:er. */
    url: string;
  }>;
  dokumentHamtade: boolean;
  fel: string | null;
}

export interface Organisation {
  orgnr: string;
  namn: string | null;
  status: string;
  avregistrerad: {
    datum: string | null;
    orsak: string | null;
    kod: string | null;
  } | null;
  verksam: "JA" | "NEJ" | null;
  registrerad: string | null;
  /** Den riktiga bolagsformen — till skillnad från `Grunduppgifter.bolagsform`. */
  juridiskForm: string | null;
  sni: string[];
  postort: string | null;
}

export interface Valideringsrapport {
  /** Dun & Bradstreets eget datum — det rapporten mäter mot. */
  asof: string | null;
  totalt: number;
  aktiva: number;
  noder: ValideradNod[];
  avregistrerade: ValideradNod[];
  okanda: ValideradNod[];
  fel: ValideradNod[];
  medArsredovisning: ValideradNod[];
  /** Minst ett bolag avregistrerat sedan `asof` — koncernbilden har hunnit bli fel. */
  inaktuellt: boolean;
}

export interface ValideradNod {
  orgnr: string;
  namn: string | null;
  bolag: Bolagsuppslag | null;
}

// ---------------------------------------------------------------------------
// The app's own stable output contract — produced by resources.ts/statistics.ts
// ---------------------------------------------------------------------------

/** One skolenhet, as `resources.ts` produces it regardless of source. */
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
   * Whether `antalElever` is Skolverket's own unit-wide figure or a sum of
   * every programme's own elevantal — gymnasiets `matt` never carries a
   * unit-wide figure, only per-programme ones. `null` alongside a `null`
   * `antalElever` means neither exists.
   */
  antalEleverKälla: "rapporterat" | "summerat" | null;
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

export interface SkolformsÅrskurser {
  /** Skolverkets skolformsnyckel, gemener, t.ex. "fsk"/"gr"/"gran". */
  kod: string;
  /** The register's display name, e.g. "Anpassad grundskola". */
  skolform: string;
  årskurser: string[];
}

export type Nyckeltal = {
  meritvärdeÅrskurs9: NyckeltalVärde;
  andelGodkändaÅrskurs9: NyckeltalVärde;
  andelBehörigaLärare: NyckeltalVärde;
  eleverPerLärare: NyckeltalVärde;
};

export type NyckeltalVärde =
  | {
      status: "finns";
      text: string;
      tal: number;
      läsår: string | null;
      /** Only set on a figure we derived ourselves — see `NyckeltalHärledning`. */
      härlett?: NyckeltalHärledning;
    }
  | { status: "saknas"; förklaring: string; läsår: string | null };

/**
 * Set on a figure the register does not report for the unit itself but which
 * we averaged out of its gymnasieprogram: gymnasieskolans lärartal, which
 * Skolverket publishes per program only (`statistik.gy.matt` is always
 * empty). See `programsnitt` in `normalize.ts` for how, and `byggNyckeltal`
 * in `resources.ts` for when.
 *
 * Absent on every figure read straight out of the register, so its presence
 * *is* the provenance: a page that colours such a figure has to be able to
 * say it is ours and not Skolverkets, the same reason `RiksNyckeltal`
 * carries `beräknat`.
 */
export interface NyckeltalHärledning {
  från: "gymnasieprogram";
  /** How many programmes carried a figure of their own. */
  antalProgram: number;
  /** Whether the average is weighted by the programmes' elevantal. */
  elevviktat: boolean;
}

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

/**
 * Where a skolenhet page's figures were actually fetched from — one address
 * per block, resolved out of `Skolinfo.kallor` (and, for `registeruppgifter`,
 * `Registerdetalj.kalla`) by `resources.ts` so nothing above this module has
 * to know how the collector keys them.
 *
 * `null` where the unit has no such block. A URL here is the exact resource
 * the figures on the page were read out of, not the API's front door, which
 * is what lets the Källor section answer "where did this number come from"
 * about *this* school rather than about the register.
 */
export interface SkolaKällhänvisning {
  /** The unit's own record — namn, adress, kontaktuppgifter and rektor from `Registerdetalj`, huvudman and skolformer still from `Grunduppgifter`. */
  registeruppgifter: string | null;
  /**
   * The statistics resource for the unit's primary skolform. Two of the four
   * nyckeltal are read from `gr` whatever the unit is (see `byggNyckeltal`),
   * so a gymnasieskola's meritvärde row is not covered by this address — it
   * has no figure to cover.
   */
  nyckeltal: string | null;
  /** Skolverkets all-schools SALSA file, which is where every unit's is. */
  salsa: string | null;
  /** The nestedsurveys resource for the enkät the page shows. */
  enkät: string | null;
  dokument: string | null;
}

/**
 * The same for a huvudman. Only `koncern` is a page a reader can open:
 * Bolagsverkets two endpoints are behind a token, and are carried because
 * they are the provenance, not because anything links them — `Kallor.tsx`
 * holds the one rule that decides which of these becomes a link.
 */
export interface HuvudmanKällhänvisning {
  /** hitta.se's företagsinformation page — where the koncern tree was read. */
  koncern: string | null;
  bolagsuppgifter: string | null;
  årsredovisningar: string | null;
}

export interface SkolaDetalj extends SkolorRad {
  /** `null` only for the rare unit whose `registerdetalj.attributes` carries no `headMaster` (one of 6 518 in today's export). */
  rektor: string | null;
  startdatum: string | null;
  besöksadress: string | null;
  telefon: string | null;
  webbplats: string | null;
  epost: string | null;
  koordinater: { latitud: number; longitud: number } | null;
  /** One entry per nationellt program the unit runs; empty for non-gymnasieskolor. */
  program: SkolaProgram[];
  /**
   * Raw gymnasieprogram codes off `registerdetalj.attributes.schoolTypeProperties.gy.programmes`
   * — the register's own list of what a "gy" unit offers, independent of
   * whether `program` above has statistics for it. Left as codes: this list
   * is what the page prints in the "Program" row and stat tile, where the
   * codes are what fits, and `program` above already carries the resolved
   * names for the programmes that have figures. `resources.ts`'s
   * `dedupeGyProgramkoder` already collapses each pre-/post-reform pair
   * (`EK`/`EK25`) onto one code, so this list has at most one entry per real
   * programme. Empty for every non-gy unit and the rare unit missing a
   * `registerdetalj`.
   */
  programkoder: string[];
  nyckeltal: Nyckeltal;
  /** `null` for every unit without SALSA-data (roughly 4/5 of the register). */
  salsa: Salsa | null;
  källor: SkolaKällhänvisning;
}

/** One row of the app's own huvudman aggregate. */
export interface HuvudmanRad {
  organisationsnummer: string;
  namn: string;
  typ: string;
  bolagsform: string | null;
  koncern: HuvudmanKoncern | null;
  kommuner: string[];
  skolformer: string[];
  antalEnheter: number;
  antalElever: number;
  källor: HuvudmanKällhänvisning;
}

export interface HuvudmanKoncern {
  koncernOrgNr: string;
  koncernNamn: string;
  antalFöretag: number | null;
  /** Dun & Bradstreets eget datum — kan vara år gammalt. */
  asof: string | null;
  /** Minst ett bolag i koncernen avregistrerat sedan `asof`. */
  inaktuellt: boolean;
  /** Den rebyggda (inte platta) trädet — se `buildTrädFrånNoder` i `koncern.ts`. */
  träd: TrädNod[];
  /**
   * Where the tree was read: hitta.se's page for whichever huvudman's lookup
   * produced it. One koncern has one tree, so on a huvudman page this may
   * name a *sibling* company rather than the one being shown — say "koncernen"
   * when linking it, never "den här huvudmannen".
   */
  källa: string | null;
}

/** `TradNod` rebuilt into a real nested tree via `djup`, joined against `bolag[orgnr].status`. */
export interface TrädNod {
  orgnr: string;
  namn: string | null;
  land: string | null;
  anstallda: number | null;
  bolagsstatus: Bolagsuppslag["status"] | null;
  barn: TrädNod[];
}

/** One page of a paged list endpoint — kept for `Sida`-shaped fixtures/tests only; no longer produced by any live path. */
export interface Sida<T> {
  rader: T[];
  totalt: number;
  sida: number;
  sidstorlek: number;
}

/** Statistiknyckeln for an individual skolform, as used by the dokument endpoint. */
export type Skolform = NationelltGenomsnittSkolform | "gy";

/** The register's own `Statistiknyckel`s that have a national average endpoint — `gy` doesn't, only its programs do. */
export type NationelltGenomsnittSkolform = "fsk" | "gr" | "gran" | "gyan";

/**
 * The per-skolform riksgenomsnitt, which `allt.json` does not carry — kept
 * because its absence is the thing worth recording. Skolverket publishes a
 * bulk riksgenomsnitt only for five gymnasieprogram measures, which is why
 * `NationelltProgramGenomsnitt` below has readers and this has none, and why
 * nearly every nyckeltal card says "(beräknat)": `getBeräknatRiksGenomsnitt`
 * averages the units' own reported figures instead. Delete this and the next
 * person to look for the official figures has nothing telling them there are
 * none. Same reasoning as `Sida<T>` above.
 */
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

/** Self-computed fallback riksgenomsnitt, used wherever no official figure exists for a (skolform, nyckeltal) or (programkod, nyckeltal) combination — which, in this source, is nearly always outside the five gy-program measures that carry an official `_riket` figure. */
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

/** Vårdnadshavarenkäten for one skolform (förskoleklass, grundskola or anpassad grundskola). Always empty in this source — vårdnadshavarenkäter are never collected. */
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
  /** One entry per skolform that has a vårdnadshavarenkät. Always empty in this source. */
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
