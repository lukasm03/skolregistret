// Datahämtning från Skolverkets öppna API:er.
//
// Tre funktioner att bygga API-rutter på:
//   • byggSkolregister()        – en rad per aktiv skolenhet
//   • byggSkoldetalj(kod)       – allt vi vet om en enskild skolenhet
//   • byggHuvudmannaregister()  – en rad per huvudman
//
// Allt som visas för användaren är på svenska: statusar, skolformer och
// huvudmannatyper översätts från Skolverkets koder innan de lämnar den här filen.
//
// Ingen mellanlagring sker här. byggSkolregister() gör ~17 000 anrop och tar
// runt 20 sekunder – kör den i ett bygg- eller cron-steg och spara resultatet,
// inte i en request-hanterare. byggSkoldetalj() är däremot 2–3 anrop och går
// bra att anropa direkt per request.

// ════════════════════════════════════════════════════════════════════════
// Inställningar
// ════════════════════════════════════════════════════════════════════════

/** Hur många anrop vi kör samtidigt. Skolverket klarar ~20 utan att strypa. */
const SAMTIDIGA_ANROP = 16;

/** Ge upp ett enskilt anrop efter så här länge. */
const TIDSGRÄNS_MS = 20_000;

/** Så många gånger försöker vi om vid 429/5xx/nätverksfel. */
const ANTAL_OMFÖRSÖK = 4;

const SKOLENHETSREGISTRET = "https://api.skolverket.se/skolenhetsregistret/v2";
const PLANERADE_UTBILDNINGAR = "https://api.skolverket.se/planned-educations/v4";

/**
 * Statistik-API:et svarar 406 på vanlig `application/json` – det kräver sin
 * egen mediatyp. Skolenhetsregistret nöjer sig med JSON.
 */
function accepteradTyp(url: string): string {
  return url.startsWith(PLANERADE_UTBILDNINGAR)
    ? "application/vnd.skolverket.plannededucations.api.v4.hal+json"
    : "application/json";
}

// ════════════════════════════════════════════════════════════════════════
// Svenska etiketter
//
// Skolverket svarar med versala koder ("AKTIV", "ENSKILD", "GYAN"). Ingen
// utanför myndigheten läser dem, så vi översätter en gång – här – i stället
// för att sprida ut översättningarna i gränssnittet.
// ════════════════════════════════════════════════════════════════════════

const STATUS_PÅ_SVENSKA: Record<string, string> = {
  AKTIV: "Aktiv",
  VILANDE: "Vilande",
  UPPHORT: "Upphörd",
  PLANERAD: "Planerad",
};

const HUVUDMANNATYP_PÅ_SVENSKA: Record<string, string> = {
  KOMMUN: "Kommunal",
  ENSKILD: "Fristående",
  REGION: "Regional",
  KOMMFORB: "Kommunalförbund",
  STAT: "Statlig",
  SPECIAL: "Specialskola",
  SAME: "Sameskola",
  HMANUTL: "Utlandsskola",
};

/** Nycklarna som statistik-API:et använder. `fsk` avser förskoleklassen, inte förskolan. */
export type Statistiknyckel = "fsk" | "gr" | "gran" | "gy" | "gyan";

/**
 * Skolformskoder från skolenhetsregistret → svenskt namn och (om den finns)
 * motsvarande nyckel i statistik-API:et. Skolformer utan nyckel saknar statistik.
 */
const SKOLFORMER: Record<string, { namn: string; statistik?: Statistiknyckel }> = {
  FSK: { namn: "Förskola" },
  FKLASS: { namn: "Förskoleklass", statistik: "fsk" },
  GR: { namn: "Grundskola", statistik: "gr" },
  GRAN: { namn: "Anpassad grundskola", statistik: "gran" },
  GY: { namn: "Gymnasieskola", statistik: "gy" },
  GYAN: { namn: "Anpassad gymnasieskola", statistik: "gyan" },
  FTH: { namn: "Fritidshem" },
  OPPFTH: { namn: "Öppen fritidsverksamhet" },
  VUX: { namn: "Vuxenutbildning" },
};

function påSvenska(
  ordlista: Record<string, string>,
  kod: string | undefined | null,
): string | null {
  if (!kod) return null;
  return ordlista[kod] ?? kod;
}

function skolformsnamn(koder: readonly string[] | undefined): string[] {
  return (koder ?? []).map((kod) => SKOLFORMER[kod]?.namn ?? kod);
}

/**
 * Programkoder → svenskt namn, för gymnasieskolans och anpassade gymnasie-
 * skolans nationella program. Skolverket bytte kodserie vid läroplansreformen
 * Gy25. För de flesta program fick koden bara "25" på slutet (BA → BA25) och
 * behöll samma bokstäver, men några nya tvåbokstavskoder krockar med redan
 * upptagna bokstäver från andra (äldre) program, så Skolverket gav dem andra
 * bokstäver än man kan gissa sig till: FB25 = fastighet och byggnation (inte
 * finsnickeri, som har koden FI/FI25), FL25 = Flygteknikutbildningen (inte
 * florist, som har koden FO/FO25), TA25 = Tågteknikutbildningen (inte teknik-
 * programmet, som har koden TE/TE25). De koderna listas därför som egna
 * nycklar nedan i stället för att fångas av "25"-avklippningen i
 * gymnasieprogramnamn(). Verifierat mot Skolverkets syllabus-API
 * (api.skolverket.se/syllabus/v1/programs, hämtat 2026-08-09).
 */
const GYMNASIEPROGRAM_PÅ_SVENSKA: Record<string, string> = {
  BF: "Barn- och fritidsprogrammet",
  BA: "Bygg- och anläggningsprogrammet",
  EK: "Ekonomiprogrammet",
  EE: "El- och energiprogrammet",
  ES: "Estetiska programmet",
  FX: "Flygteknikutbildningen",
  FT: "Fordons- och transportprogrammet",
  FS: "Försäljnings- och serviceprogrammet",
  // Äldre kod från när programmet hette Handelsprogrammet, före namnbytet
  // till Försäljnings- och serviceprogrammet. Syns inte i Skolverkets
  // nuvarande syllabus-API eftersom den är helt utfasad.
  HA: "Försäljnings- och serviceprogrammet",
  FR: "Frisör- och stylistprogrammet",
  DS: "Design och sömnadstekniska utbildningen",
  FI: "Finsnickeriutbildningen",
  FO: "Floristutbildningen",
  GL: "Glashantverksutbildningen",
  GU: "Guldsmedsutbildningen",
  HV: "Hantverksprogrammet",
  HT: "Hotell- och turismprogrammet",
  HU: "Humanistiska programmet",
  IN: "Industritekniska programmet",
  MX: "Marinteknikutbildningen",
  NB: "Naturbruksprogrammet",
  NA: "Naturvetenskapsprogrammet",
  RL: "Restaurang- och livsmedelsprogrammet",
  SA: "Samhällsvetenskapsprogrammet",
  SX: "Sjöfartsutbildningen",
  TE: "Teknikprogrammet",
  TX: "Tågteknikutbildningen",
  UX: "Utbildningen samiska näringar",
  VF: "VVS- och fastighetsprogrammet",
  VO: "Vård- och omsorgsprogrammet",
  YX: "Yrkesdansarutbildningen",
  VI: "Gymnasieingenjör - vidareutbildning i form av ett fjärde tekniskt år",
  // Gy25-koder som bytte bokstäver, se kommentar ovan. Verifierade mot
  // Skolverkets syllabus-API (api.skolverket.se/syllabus/v1/programs).
  FB25: "Programmet för fastighet och byggnation",
  FL25: "Flygteknikutbildningen",
  MA25: "Marinteknikutbildningen",
  SJ25: "Sjöfartsutbildningen",
  TA25: "Tågteknikutbildningen",
  VI25: "Vidareutbildning i form av ett fjärde tekniskt år",
  YR25: "Yrkesdansarutbildningen",
  // Anpassade gymnasieskolans nationella program.
  AH: "Programmet för administration, handel och varuhantering",
  EV: "Programmet för estetiska verksamheter",
  FA: "Programmet för fastighet, anläggning och byggnation",
  FG: "Programmet för fordonsvård och godshantering",
  HP: "Programmet för hantverk och produktion",
  HR: "Programmet för hotell, restaurang och bageri",
  HO: "Programmet för hälsa, vård och omsorg",
  // Gy25 döpte om "administration, handel och varuhantering" (AH) till "handel och service" (HS).
  HS: "Programmet för handel och service",
  SN: "Programmet för samhälle, natur och språk",
  SK: "Programmet för skog, mark och djur",
  // Introduktionsprogram, gymnasieskolan.
  IMA: "Introduktionsprogram: Individuellt alternativ",
  IND: "Introduktionsprogram: Individuellt alternativ",
  IMS: "Introduktionsprogram: Språkintroduktion",
  SPR: "Introduktionsprogram: Språkintroduktion",
  IMY: "Introduktionsprogram: Yrkesintroduktion",
  YRK: "Introduktionsprogram: Yrkesintroduktion",
  IMV: "Introduktionsprogram: Programinriktat val",
  IMR: "Introduktionsprogram: Programinriktat individuellt val",
  PRO: "Introduktionsprogram: Programinriktat individuellt val",
  IMP: "Introduktionsprogram: Preparandutbildning",
  PRE: "Introduktionsprogram: Preparandutbildning",
  // Introduktionsprogram, anpassade gymnasieskolan.
  IAIND: "Introduktionsprogram: Individuellt alternativ",
  // Introduktionsprogram, Gy25-kodernas fullstavade form.
  IMIND: "Introduktionsprogram: Individuellt alternativ",
  IMPRE: "Introduktionsprogram: Preparandutbildning",
  IMPRO: "Introduktionsprogram: Programinriktat individuellt val",
  IMSPR: "Introduktionsprogram: Språkintroduktion",
  IMYRK: "Introduktionsprogram: Yrkesintroduktion",
  // International Baccalaureate.
  IB001: "International Baccalaureate",
};

/**
 * Skolans gymnasieprogram, om den bedriver gymnasieskola eller anpassad
 * gymnasieskola. Skolverket listar programkoderna under `schoolTypeProperties`
 * i stället för i `schoolTypes`, och samma program kan förekomma i både
 * Gy11/Gyan13- och Gy25-kodserien – därför dedupliceras på namn.
 */
/** Namnet för en enskild programkod, t.ex. "NA25" → "Naturvetenskapsprogrammet". */
function programnamn(kod: string): string {
  // Gy25-koderna har "25" på slutet (BA → BA25) men är samma program.
  const utanÅrgång = kod.replace(/25$/, "");
  return GYMNASIEPROGRAM_PÅ_SVENSKA[kod] ?? GYMNASIEPROGRAM_PÅ_SVENSKA[utanÅrgång] ?? kod;
}

function gymnasieprogramnamn(egenskaper: SchoolTypeProperties | undefined): string[] {
  const koder = [
    ...(egenskaper?.gy?.programmes ?? []),
    ...(egenskaper?.gyan?.programmes ?? []),
  ];
  const namn = new Set(koder.map(programnamn));
  return [...namn].sort((a, b) => a.localeCompare(b, "sv"));
}

/**
 * Årskurserna skolan bedriver, per skolform.
 *
 * Byggs av `schoolTypeProperties.grades` (grundskolan och anpassade
 * grundskolan) plus förskoleklassens årskurs 0, som Skolverket inte lägger ut
 * som `grades` utan bara markerar med skolformskoden FKLASS. Gymnasieskolan
 * saknas medvetet: Skolverket redovisar inga årskurser för den.
 *
 * Sorteringen är numerisk så att "0" kommer före "1" och "10" efter "9".
 */
function årskurserPerSkolform(
  koder: readonly string[] | undefined,
  egenskaper: SchoolTypeProperties | undefined,
): SkolformsÅrskurser[] {
  const poster: SkolformsÅrskurser[] = [];
  if ((koder ?? []).includes("FKLASS")) {
    poster.push({ kod: "fsk", skolform: SKOLFORMER.FKLASS!.namn, årskurser: ["0"] });
  }
  for (const [kod, skolformskod] of [
    ["gr", "GR"],
    ["gran", "GRAN"],
  ] as const) {
    const årskurser = sorteraÅrskurser(egenskaper?.[kod]?.grades);
    if (årskurser.length > 0)
      poster.push({ kod, skolform: SKOLFORMER[skolformskod]!.namn, årskurser });
  }
  return poster;
}

function sorteraÅrskurser(årskurser: readonly string[] | undefined): string[] {
  return [...new Set(årskurser ?? [])].sort((a, b) => Number(a) - Number(b));
}

/** Alla årskurser skolan bedriver, oavsett skolform – listvyns filterunderlag. */
function samladeÅrskurser(poster: readonly SkolformsÅrskurser[]): string[] {
  return sorteraÅrskurser(poster.flatMap((post) => post.årskurser));
}

function statistiknycklar(koder: readonly string[] | undefined): Statistiknyckel[] {
  const nycklar = new Set<Statistiknyckel>();
  for (const kod of koder ?? []) {
    const nyckel = SKOLFORMER[kod]?.statistik;
    if (nyckel) nycklar.add(nyckel);
  }
  return [...nycklar];
}

// ════════════════════════════════════════════════════════════════════════
// Nätverkslager
// ════════════════════════════════════════════════════════════════════════

const vänta = (ms: number) => new Promise((klar) => setTimeout(klar, ms));

/**
 * Hämtar JSON med tidsgräns och omförsök.
 *
 * Omförsök sker vid 429 (för många anrop), 5xx och nätverksfel. En 404 är ett
 * giltigt svar från Skolverket – då returneras `null` i stället för ett kast,
 * eftersom flera enheter helt enkelt saknar vissa uppgifter.
 */
async function hämtaJson<T>(url: string): Promise<T | null> {
  let senasteFel: unknown = null;

  for (let försök = 0; försök <= ANTAL_OMFÖRSÖK; försök++) {
    try {
      const svar = await fetch(url, {
        signal: AbortSignal.timeout(TIDSGRÄNS_MS),
        headers: { Accept: accepteradTyp(url) },
      });

      // 404 = enheten finns inte, 400 = koden är inte ett giltigt
      // skolenhetsnummer. Båda betyder "ingen sådan skola" för den som
      // slår upp en kod från en URL – inte att något gått sönder.
      if (svar.status === 404 || svar.status === 400) return null;

      if (svar.status === 429 || svar.status >= 500) {
        const efterHuvud = Number(svar.headers.get("retry-after"));
        const paus =
          Number.isFinite(efterHuvud) && efterHuvud > 0
            ? efterHuvud * 1000
            : 500 * 2 ** försök + Math.random() * 250;
        await vänta(paus);
        continue;
      }

      if (!svar.ok) throw new Error(`${svar.status} ${svar.statusText} för ${url}`);

      return (await svar.json()) as T;
    } catch (fel) {
      senasteFel = fel;
      if (försök < ANTAL_OMFÖRSÖK) await vänta(500 * 2 ** försök + Math.random() * 250);
    }
  }

  throw new Error(`Kunde inte hämta ${url}: ${senasteFel}`);
}

/**
 * Kör `arbete` över alla poster med högst `samtidiga` anrop igång åt gången.
 *
 * Det här är den enskilt största skillnaden mot att loopa med await: ett
 * anrop i taget ger ~19 anrop/sekund, sexton parallella ger ~180.
 */
async function parallellt<Post, Resultat>(
  poster: readonly Post[],
  arbete: (post: Post, index: number) => Promise<Resultat>,
  samtidiga = SAMTIDIGA_ANROP,
): Promise<Resultat[]> {
  const resultat = new Array<Resultat>(poster.length);
  let nästaIndex = 0;

  const arbetare = Array.from(
    { length: Math.min(samtidiga, poster.length) },
    async () => {
      for (let index = nästaIndex++; index < poster.length; index = nästaIndex++) {
        resultat[index] = await arbete(poster[index]!, index);
      }
    },
  );

  await Promise.all(arbetare);
  return resultat;
}

// ════════════════════════════════════════════════════════════════════════
// Skolverkets svarsformat
// ════════════════════════════════════════════════════════════════════════

type Skolenhetslista = {
  meta: { extractDate: string };
  data: {
    type: string;
    attributes: Array<{ schoolUnitCode: string; name: string; status: string }>;
  };
};

/**
 * Skolformsspecifika uppgifter: nationella program för gymnasieskolan och
 * årskurser för grundskolan och anpassade grundskolan. Skolverket lägger bara
 * ut `grades` för `gr` och `gran` – förskoleklassens årskurs 0 finns bara
 * implicit i `schoolTypes` (FKLASS), och gymnasieskolan redovisar inga
 * årskurser alls (även planned-educations skickar en tom `schoolYears` där).
 */
type SchoolTypeProperties = {
  gy?: { programmes: string[] };
  gyan?: { programmes: string[] };
  gr?: { grades?: string[] };
  gran?: { grades?: string[] };
};

type Adress = {
  type: "BESOKSADRESS" | "POSTADRESS" | "LEVERANSADRESS" | string;
  streetAddress: string;
  postalCode: string;
  locality: string;
  geoCoordinates?: { latitude: string; longitude: string };
};

type Skolenhetssvar = {
  meta: { extractDate: string; created: string; modified: string };
  data: {
    schoolUnitCode: string;
    attributes: {
      displayName: string;
      status: string;
      url?: string;
      email?: string;
      phoneNumber?: string;
      headMaster?: string;
      addresses: Adress[];
      schoolUnitType: string;
      schoolName: string;
      municipalityCode: string;
      schoolTypes: string[];
      schoolTypeProperties?: SchoolTypeProperties;
      startdate: string;
    };
  };
  /** Huvudmannen. Saknas för ett fåtal enheter, därför frivillig. */
  included?: {
    organizationNumber: string;
    attributes: { displayName: string; organizerType: string };
  };
};

type Huvudmannalista = {
  data: {
    attributes: Array<{
      organizationNumber: string;
      displayName: string;
      organizerType: string;
    }>;
  };
};

type Huvudmannasvar = {
  data: {
    attributes: {
      displayName: string;
      organizerType: string;
      companyForm?: { code: string; displayName: string };
      municipalities: Array<{ municipalityCode: string; displayName: string }>;
      schoolTypes: string[];
    };
  };
};

/** Ett mätvärde över tid, t.ex. `[{ value: "cirka 330", timePeriod: "2025/26" }]`. */
type Mätserie = Array<{
  value: string | null;
  valueType: string;
  timePeriod: string | null;
}>;

type Statistikkropp = {
  totalNumberOfPupils?: Mätserie;
  certifiedTeachersQuota?: Mätserie;
  studentsPerTeacherQuota?: Mätserie;
  specialEducatorsQuota?: Mätserie;
  averageGradesMeritRating9thGrade?: Mätserie;
  ratioOfPupilsIn9thGradeWithAllSubjectsPassed?: Mätserie;
  programMetrics?: Array<{
    programCode: string;
    totalNumberOfPupils?: Mätserie;
    admissionPointsMin?: Mätserie;
    admissionPointsAverage?: Mätserie;
    ratioOfPupilsWithExamWithin3Years?: Mätserie;
    gradesPointsForStudents?: Mätserie;
    gradesPointsForStudentsWithExam?: Mätserie;
    ratioOfStudentsEligibleForUndergraduateEducation?: Mätserie;
  }>;
};

/** Statistik-API:et svarar alltid 200 – saknas data står det i `status`. */
type Statistiksvar = { status: string; message: string; body: Statistikkropp | "" };

// ════════════════════════════════════════════════════════════════════════
// Källor
// ════════════════════════════════════════════════════════════════════════

/**
 * Alla skolenheter, filtrerade på status av servern.
 *
 * Att skicka med `?status=AKTIV` gör svaret 40 % mindre och sparar oss från
 * att ladda ner 4 500 nedlagda och vilande enheter bara för att kasta dem.
 */
async function hämtaSkolenhetslista(): Promise<Skolenhetslista> {
  const url = `${SKOLENHETSREGISTRET}/school-units`;
  const svar = await hämtaJson<Skolenhetslista>(url);
  if (!svar) throw new Error("Skolenhetsregistret svarade utan innehåll");
  return svar;
}

function hämtaSkolenhet(skolenhetskod: string): Promise<Skolenhetssvar | null> {
  return hämtaJson<Skolenhetssvar>(
    `${SKOLENHETSREGISTRET}/school-units/${skolenhetskod}`,
  );
}

function hämtaHuvudmannalista(): Promise<Huvudmannalista | null> {
  return hämtaJson<Huvudmannalista>(`${SKOLENHETSREGISTRET}/organizers`);
}

function hämtaHuvudman(organisationsnummer: string): Promise<Huvudmannasvar | null> {
  return hämtaJson<Huvudmannasvar>(
    `${SKOLENHETSREGISTRET}/organizers/${organisationsnummer}`,
  );
}

/**
 * Statistik för en skolform.
 *
 * Adressen byggs direkt från skolformen i stället för att först fråga
 * `/statistics` efter länkar. Det sparar ett anrop per skola – ungefär
 * 7 500 anrop totalt – och kostar som mest ett bomanrop för de skolor där
 * en anmäld skolform saknar statistik.
 */
async function hämtaStatistik(
  skolenhetskod: string,
  nyckel: Statistiknyckel,
): Promise<Statistikkropp | null> {
  const url = `${PLANERADE_UTBILDNINGAR}/school-units/${skolenhetskod}/statistics/${nyckel}`;
  const svar = await hämtaJson<Statistiksvar>(url);
  if (!svar || svar.status !== "OK" || !svar.body) return null;
  return svar.body;
}

/**
 * Nationella genomsnittet för en skolform, eller för ett enskilt
 * gymnasieprogram när `nyckel` är `"gy"`.
 *
 * Till skillnad från `hämtaStatistik()` gäller den här inte en enskild
 * skolenhet – det är samma siffra oavsett vilken skola man frågar om.
 * Skolverket kräver en programkod för `gy` (det finns inget toppnivåsnitt
 * för hela gymnasieskolan), men inte för de andra skolformerna.
 */
async function hämtaNationelltGenomsnitt(
  nyckel: Statistiknyckel,
  programkod?: string,
): Promise<Statistikkropp | null> {
  const sökväg = nyckel === "gy" && programkod ? `gy/${programkod}` : nyckel;
  const url = `${PLANERADE_UTBILDNINGAR}/statistics/national-values/${sökväg}`;
  const svar = await hämtaJson<Statistiksvar>(url);
  if (!svar || svar.status !== "OK" || !svar.body) return null;
  return svar.body;
}

// ════════════════════════════════════════════════════════════════════════
// Tolkning av mätvärden
//
// Skolverket skriver inte ut siffror som saknas. I stället står det "." för
// uppgift som saknas, ".." för uppgift som döljs för att skolan har för få
// elever, och "*" för lärare utan legitimation. Skickar man de tecknen rakt
// ut i gränssnittet blir de obegripliga – och räknar man dem som noll blir
// statistiken direkt felaktig. Därför tolkas de här, en gång.
// ════════════════════════════════════════════════════════════════════════

/** Ett tolkat mätvärde, färdigt att visa eller räkna på. */
export type Mätvärde =
  | { status: "finns"; text: string; tal: number | null; läsår: string | null }
  | { status: "saknas"; förklaring: string; läsår: string | null };

const FÖRKLARINGAR: Record<string, string> = {
  MISSING: "Uppgiften saknas",
  OMITTED_DUE_TO_BASED_ON_FEW_PUPILS: "Visas inte – för få elever",
  TEACHERS_EXCLUDED_DUE_TO_NO_REQUIRED_LEGITIMATION:
    "Visas inte – lärare utan legitimation",
};

/**
 * Tolkar det senaste värdet i en mätserie.
 *
 * Serierna är sorterade med nyaste läsåret först, så vi tar första posten som
 * faktiskt innehåller en siffra – annars förklarar vi varför den fattas.
 */
function tolkaMätvärde(serie: Mätserie | undefined): Mätvärde {
  const senaste = serie?.[0];
  if (!senaste) return { status: "saknas", förklaring: "Uppgiften saknas", läsår: null };

  if (senaste.valueType !== "EXISTS" && !/\d/.test(senaste.value ?? "")) {
    return {
      status: "saknas",
      förklaring: FÖRKLARINGAR[senaste.valueType] ?? "Uppgiften saknas",
      läsår: senaste.timePeriod,
    };
  }

  // "cirka 330" och "~100" är Skolverkets avrundade elevtal, "11,6" är
  // svenskt decimaltal. Alla tre ska bli ett tal man kan räkna med.
  const text = senaste.value ?? "";
  const siffror = text.replace(",", ".").replace(/[^\d.]/g, "");
  const tal = siffror ? Number(siffror) : null;
  return {
    status: "finns",
    text,
    tal: Number.isFinite(tal) ? tal : null,
    läsår: senaste.timePeriod,
  };
}

/** Mätvärdet som text, med förklaring i stället för tomrum när siffran fattas. */
export function visaMätvärde(mätvärde: Mätvärde): string {
  return mätvärde.status === "finns" ? mätvärde.text : mätvärde.förklaring;
}

/**
 * Summerar elever över alla skolformer en enhet bedriver.
 *
 * För gymnasiet finns både en toppnivåsumma och en per program. Vi använder
 * toppnivån: den är Skolverkets egen summering och slipper avrundningsfelen
 * som uppstår när man adderar flera "cirka"-värden.
 *
 * Returnerar `null` när ingen skolform redovisar elevantal. Det är skillnad
 * på "skolan har noll elever" och "Skolverket redovisar inte antalet".
 */
function summeraElever(
  statistik: ReadonlyMap<Statistiknyckel, Statistikkropp>,
): number | null {
  let summa: number | null = null;
  for (const kropp of statistik.values()) {
    const elever = tolkaMätvärde(kropp.totalNumberOfPupils);
    if (elever.status === "finns" && elever.tal !== null)
      summa = (summa ?? 0) + elever.tal;
  }
  return summa;
}

// ════════════════════════════════════════════════════════════════════════
// Register
// ════════════════════════════════════════════════════════════════════════

/** Årskurserna en skola bedriver inom en enskild skolform. */
export type SkolformsÅrskurser = {
  /** Skolverkets skolformsnyckel: "fsk", "gr" eller "gran". */
  kod: "fsk" | "gr" | "gran";
  /** Skolformen på svenska, t.ex. "Anpassad grundskola". */
  skolform: string;
  /** Årskurserna som text, stigande. Förskoleklassen är "0". */
  årskurser: string[];
};

export type Skolrad = {
  skolenhetskod: string;
  namn: string;
  status: string | null;
  huvudman: string | null;
  /** Organisationsnumret kopplar skolan till huvudmannaregistret. Namn kan skrivas olika. */
  huvudmannaOrgnr: string | null;
  huvudmannatyp: string | null;
  kommun: string | null;
  kommunkod: string | null;
  skolformer: string[];
  /** Nationella gymnasieprogram skolan erbjuder. Tom lista om skolan inte bedriver gymnasieskola. */
  gymnasieprogram: string[];
  /**
   * Alla årskurser skolan bedriver, stigande ("0" = förskoleklass). Tom lista
   * när skolan inte har några årskurser att redovisa – t.ex. gymnasieskolor,
   * förskolor och vuxenutbildning.
   */
  årskurser: string[];
  /** Samma årskurser uppdelade per skolform, för den som behöver veta vilken form en årskurs hör till. */
  årskurserPerSkolform: SkolformsÅrskurser[];
  /** `null` betyder att Skolverket inte redovisar antalet – inte att skolan saknar elever. */
  antalElever: number | null;
};

/** Ett nationellt gymnasieprogram vid en enhet, med programmets egna nyckeltal. */
export type SkolaProgram = {
  /** Programkod som Skolverket skriver den, t.ex. "NA25". */
  kod: string;
  namn: string;
  antalElever: Mätvärde;
  nyckeltal: {
    lägstaAntagningspoäng: Mätvärde;
    genomsnittligAntagningspoäng: Mätvärde;
    andelMedExamenInom3År: Mätvärde;
    betygspoängMedExamen: Mätvärde;
    andelMedHögskolebehörighet: Mätvärde;
  };
};

/** Nationella genomsnittet för en skolform, eller för ett gymnasieprogram. */
export type NationelltGenomsnitt =
  | {
      skolform: "fsk" | "gr" | "gran" | "gyan";
      nyckeltal: {
        meritvärdeÅrskurs9: Mätvärde;
        andelGodkändaÅrskurs9: Mätvärde;
        andelBehörigaLärare: Mätvärde;
        eleverPerLärare: Mätvärde;
      };
    }
  | {
      skolform: "gy";
      programkod: string;
      nyckeltal: {
        antalElever: Mätvärde;
        lägstaAntagningspoäng: Mätvärde;
        genomsnittligAntagningspoäng: Mätvärde;
        andelMedExamenInom3År: Mätvärde;
        betygspoängMedExamen: Mätvärde;
        andelMedHögskolebehörighet: Mätvärde;
      };
    };

export type Skoldetalj = Skolrad & {
  rektor: string | null;
  startdatum: string | null;
  besöksadress: string | null;
  telefon: string | null;
  webbplats: string | null;
  epost: string | null;
  koordinater: { latitud: number; longitud: number } | null;
  /** Ett per nationellt program skolan bedriver; tom lista annars. */
  program: SkolaProgram[];
  nyckeltal: {
    meritvärdeÅrskurs9: Mätvärde;
    andelGodkändaÅrskurs9: Mätvärde;
    andelBehörigaLärare: Mätvärde;
    eleverPerLärare: Mätvärde;
  };
};

export type Huvudmannarad = {
  organisationsnummer: string;
  namn: string;
  typ: string | null;
  /**
   * Juridisk form – "Aktiebolag", "Ideella föreningar", "Kommuner".
   *
   * Hette tidigare `koncernform`, vilket var missvisande: Skolverkets
   * `companyForm` säger ingenting om koncerntillhörighet. Den frågan
   * besvaras av fältet `koncern` nedan.
   */
  bolagsform: string | null;
  /**
   * Koncerntillhörighet från data/koncern-lookup.json, byggd av
   * `bun run bygg-koncern`. `null` betyder att uppgift saknas – inte att
   * huvudmannen står utanför en koncern.
   */
  koncern: Koncerntillhörighet | null;
  kommuner: string[];
  skolformer: string[];
  antalEnheter: number;
  antalElever: number;
};

export type Koncerntillhörighet = {
  /** Koncernens översta bolag. */
  koncernOrgNr: string;
  koncernNamn: string | null;
  /** Ägarkedjan uppifrån och ned, med huvudmannen sist. */
  kedja: string[];
  /** Antal företag i koncernen. Är det 1 är huvudmannen ensam och alltså inte i en koncern. */
  antalFöretag: number;
};

/**
 * Uppslagstabellen som `bun run koncern bygg` skriver. Bara de delar
 * huvudmannaregistret behöver – hela formatet finns i koncern.ts.
 */
export type Koncernlookupdata = {
  koncerner: Record<string, { namn: string | null; medlemmar: number }>;
  lookup: Record<
    string,
    { koncernOrgNr: string; koncernNamn: string | null; path: string[] }
  >;
};

/** Kommunkod → kommunnamn. */
export type Kommunregister = ReadonlyMap<string, string>;

/**
 * Bygger uppslagstabellen kommunkod → kommunnamn från de 290 kommunala
 * huvudmännen. Skolverket har ingen egen kommunlista, så den måste härledas.
 *
 * Kostar ~290 anrop och ändras i praktiken aldrig. Bygg den en gång och skicka
 * in den till byggSkolregister()/byggSkoldetalj() – annars byggs den om vid
 * varje anrop, vilket gör en detaljsida tio gånger långsammare än den behöver.
 */
export async function byggKommunregister(): Promise<Kommunregister> {
  const lista = await hämtaHuvudmannalista();
  const kommunala = (lista?.data.attributes ?? []).filter(
    (h) => h.organizerType === "KOMMUN",
  );
  const svar = await parallellt(kommunala, (h) => hämtaHuvudman(h.organizationNumber));

  const register = new Map<string, string>();
  for (const post of svar) {
    for (const kommun of post?.data.attributes.municipalities ?? []) {
      register.set(kommun.municipalityCode, kommun.displayName);
    }
  }
  return register;
}

/**
 * Hämtar en skolenhet med all statistik den har.
 *
 * Ett anrop för enheten, sedan ett per skolform parallellt. Skolan i sig
 * kräver alltså 2–3 anrop, inte 4–5 som när länkarna hämtades separat.
 */
async function hämtaSkolaMedStatistik(skolenhetskod: string) {
  const enhet = await hämtaSkolenhet(skolenhetskod);
  if (!enhet) return null;

  const nycklar = statistiknycklar(enhet.data.attributes.schoolTypes);
  const kroppar = await parallellt(
    nycklar,
    (nyckel) => hämtaStatistik(skolenhetskod, nyckel),
    nycklar.length || 1,
  );

  const statistik = new Map<Statistiknyckel, Statistikkropp>();
  nycklar.forEach((nyckel, index) => {
    const kropp = kroppar[index];
    if (kropp) statistik.set(nyckel, kropp);
  });

  return { enhet, statistik };
}

function tillSkolrad(
  enhet: Skolenhetssvar,
  statistik: ReadonlyMap<Statistiknyckel, Statistikkropp>,
  kommuner: ReadonlyMap<string, string>,
): Skolrad {
  const a = enhet.data.attributes;
  const årskurser = årskurserPerSkolform(a.schoolTypes, a.schoolTypeProperties);
  return {
    skolenhetskod: enhet.data.schoolUnitCode,
    namn: a.schoolName ?? a.displayName,
    status: påSvenska(STATUS_PÅ_SVENSKA, a.status),
    huvudman: enhet.included?.attributes.displayName ?? null,
    huvudmannaOrgnr: enhet.included?.organizationNumber ?? null,
    huvudmannatyp: påSvenska(
      HUVUDMANNATYP_PÅ_SVENSKA,
      enhet.included?.attributes.organizerType,
    ),
    // municipalityCode ger rätt kommun. addresses[].locality är postorten,
    // som ofta är en annan ort än kommunen skolan tillhör.
    kommun: kommuner.get(a.municipalityCode) ?? null,
    kommunkod: a.municipalityCode ?? null,
    skolformer: skolformsnamn(a.schoolTypes),
    gymnasieprogram: gymnasieprogramnamn(a.schoolTypeProperties),
    årskurser: samladeÅrskurser(årskurser),
    årskurserPerSkolform: årskurser,
    antalElever: summeraElever(statistik),
  };
}

/**
 * Alla aktiva skolenheter med elevantal – listvyns datakälla.
 *
 * Gör ~17 000 anrop och tar runt 20 sekunder. Kör den i ett bygg- eller
 * cron-steg och spara resultatet; anropa den inte per request.
 *
 * @param rapportera Frivillig återkoppling för loggning under körningen.
 * @param kommuner   Frivilligt förbyggt kommunregister, se byggKommunregister().
 */
export async function byggSkolregister(
  rapportera: (klara: number, totalt: number) => void = () => {},
  kommuner?: Kommunregister,
): Promise<Skolrad[]> {
  const [lista, kommunregister] = await Promise.all([
    hämtaSkolenhetslista(),
    kommuner ? Promise.resolve(kommuner) : byggKommunregister(),
  ]);

  const koder = lista.data.attributes.map((enhet) => enhet.schoolUnitCode);
  let klara = 0;

  const rader = await parallellt(koder, async (kod) => {
    try {
      const hämtat = await hämtaSkolaMedStatistik(kod);
      return hämtat ? tillSkolrad(hämtat.enhet, hämtat.statistik, kommunregister) : null;
    } catch {
      // En enskild skola som inte svarar får inte fälla hela körningen.
      return null;
    } finally {
      rapportera(++klara, koder.length);
    }
  });

  return rader.filter((rad): rad is Skolrad => rad !== null);
}

/**
 * Allt om en enskild skolenhet – underlaget för detaljsidan.
 *
 * Skicka med ett förbyggt kommunregister om du anropar den här per request.
 * Utan det kostar varje anrop ~290 extra anrop bara för att slå upp kommunnamnet.
 */
export async function byggSkoldetalj(
  skolenhetskod: string,
  kommuner?: Kommunregister,
): Promise<Skoldetalj | null> {
  const [hämtat, kommunregister] = await Promise.all([
    hämtaSkolaMedStatistik(skolenhetskod),
    kommuner ? Promise.resolve(kommuner) : byggKommunregister(),
  ]);
  if (!hämtat) return null;

  const { enhet, statistik } = hämtat;
  const a = enhet.data.attributes;
  const besök =
    a.addresses.find((adress) => adress.type === "BESOKSADRESS") ?? a.addresses[0];
  const grundskola = statistik.get("gr");
  const någon = statistik.values().next().value as Statistikkropp | undefined;

  // Programmen ligger under gy (Gy25/Gy11) och gyan (anpassad gymnasieskola)
  // – en enhet bedriver aldrig båda, men koden är skriven för att inte anta det.
  const program: SkolaProgram[] = [
    ...(statistik.get("gy")?.programMetrics ?? []),
    ...(statistik.get("gyan")?.programMetrics ?? []),
  ].map((p) => ({
    kod: p.programCode,
    namn: programnamn(p.programCode),
    antalElever: tolkaMätvärde(p.totalNumberOfPupils),
    nyckeltal: {
      lägstaAntagningspoäng: tolkaMätvärde(p.admissionPointsMin),
      genomsnittligAntagningspoäng: tolkaMätvärde(p.admissionPointsAverage),
      andelMedExamenInom3År: tolkaMätvärde(p.ratioOfPupilsWithExamWithin3Years),
      betygspoängMedExamen: tolkaMätvärde(p.gradesPointsForStudentsWithExam),
      andelMedHögskolebehörighet: tolkaMätvärde(
        p.ratioOfStudentsEligibleForUndergraduateEducation,
      ),
    },
  }));

  return {
    ...tillSkolrad(enhet, statistik, kommunregister),
    rektor: a.headMaster ?? null,
    startdatum: a.startdate ?? null,
    besöksadress: besök
      ? `${besök.streetAddress}, ${besök.postalCode} ${besök.locality}`
      : null,
    telefon: a.phoneNumber ?? null,
    webbplats: a.url ?? null,
    epost: a.email ?? null,
    koordinater: besök?.geoCoordinates
      ? {
          latitud: Number(besök.geoCoordinates.latitude),
          longitud: Number(besök.geoCoordinates.longitude),
        }
      : null,
    program,
    nyckeltal: {
      meritvärdeÅrskurs9: tolkaMätvärde(grundskola?.averageGradesMeritRating9thGrade),
      andelGodkändaÅrskurs9: tolkaMätvärde(
        grundskola?.ratioOfPupilsIn9thGradeWithAllSubjectsPassed,
      ),
      andelBehörigaLärare: tolkaMätvärde(någon?.certifiedTeachersQuota),
      eleverPerLärare: tolkaMätvärde(någon?.studentsPerTeacherQuota),
    },
  };
}

/**
 * Nationella genomsnittet för en skolform – samma nyckeltal som `Skoldetalj`,
 * men för hela riket i stället för en enskild skolenhet.
 *
 * `gy` kräver en programkod (`programkod`), t.ex. `"NA25"`; Skolverket har
 * inget riksgenomsnitt för gymnasieskolan som helhet, bara per program. De
 * andra skolformerna tar ingen programkod och ignorerar den om den skickas.
 */
export async function byggNationelltGenomsnitt(
  skolform: "fsk" | "gr" | "gran" | "gyan",
): Promise<NationelltGenomsnitt | null>;
export async function byggNationelltGenomsnitt(
  skolform: "gy",
  programkod: string,
): Promise<NationelltGenomsnitt | null>;
export async function byggNationelltGenomsnitt(
  skolform: Statistiknyckel,
  programkod?: string,
): Promise<NationelltGenomsnitt | null> {
  const kropp = await hämtaNationelltGenomsnitt(skolform, programkod);
  if (!kropp) return null;

  if (skolform === "gy") {
    if (!programkod)
      throw new Error('byggNationelltGenomsnitt("gy", …) kräver en programkod');
    // Skolverket kan antingen lägga programmets nyckeltal direkt i svaret
    // eller under programMetrics – samma form som per-skola-statistiken.
    type Programnyckeltal = NonNullable<Statistikkropp["programMetrics"]>[number];
    const p: Programnyckeltal =
      kropp.programMetrics?.find((p) => p.programCode === programkod) ??
      kropp.programMetrics?.[0] ??
      (kropp as Programnyckeltal);
    return {
      skolform,
      programkod,
      nyckeltal: {
        antalElever: tolkaMätvärde(p.totalNumberOfPupils),
        lägstaAntagningspoäng: tolkaMätvärde(p.admissionPointsMin),
        genomsnittligAntagningspoäng: tolkaMätvärde(p.admissionPointsAverage),
        andelMedExamenInom3År: tolkaMätvärde(p.ratioOfPupilsWithExamWithin3Years),
        betygspoängMedExamen: tolkaMätvärde(p.gradesPointsForStudentsWithExam),
        andelMedHögskolebehörighet: tolkaMätvärde(
          p.ratioOfStudentsEligibleForUndergraduateEducation,
        ),
      },
    };
  }

  return {
    skolform,
    nyckeltal: {
      meritvärdeÅrskurs9: tolkaMätvärde(kropp.averageGradesMeritRating9thGrade),
      andelGodkändaÅrskurs9: tolkaMätvärde(
        kropp.ratioOfPupilsIn9thGradeWithAllSubjectsPassed,
      ),
      andelBehörigaLärare: tolkaMätvärde(kropp.certifiedTeachersQuota),
      eleverPerLärare: tolkaMätvärde(kropp.studentsPerTeacherQuota),
    },
  };
}

/**
 * Slår upp en huvudmans koncerntillhörighet i den byggda tabellen.
 *
 * Returnerar null både när tabellen saknas och när huvudmannen inte finns i
 * den. Ett företag som är sin egen rot får ett svar med `antalFöretag: 1` –
 * det är skillnad på "ingår inte i en koncern" och "vi vet inte".
 */
function slåUppKoncern(
  organisationsnummer: string,
  koncerner: Koncernlookupdata | null | undefined,
): Koncerntillhörighet | null {
  const post = koncerner?.lookup[organisationsnummer];
  if (!post) return null;

  return {
    koncernOrgNr: post.koncernOrgNr,
    koncernNamn: post.koncernNamn,
    kedja: post.path,
    antalFöretag: koncerner!.koncerner[post.koncernOrgNr]?.medlemmar ?? 1,
  };
}

// ════════════════════════════════════════════════════════════════════════
// Skolinspektionens skolenkät
//
// Ligger i planerade-utbildningar-API:et, inte hos Skolinspektionen direkt.
// `nestedsurveys` listar vilka delenkäter (vårdnadshavare/elever, per
// skolform) som finns för enheten – en enhet utan svarande saknar helt och
// hållet motsvarande länk, i stället för att returnera en tom enkät.
// ════════════════════════════════════════════════════════════════════════

/** Enkätnyckel → vilken skolform den avser, för att kunna återanvända SKOLFORMER. */
const ENKÄTNYCKEL_TILL_STATISTIKNYCKEL: Record<string, Statistiknyckel> = {
  custodiansfsk: "fsk",
  custodiansgr: "gr",
  custodiansgran: "gran",
  pupilsgr: "gr",
  pupilsgy: "gy",
};

function skolformsnamnFörStatistiknyckel(statistiknyckel: string): string {
  const post = Object.values(SKOLFORMER).find((s) => s.statistik === statistiknyckel);
  return post?.namn ?? statistiknyckel;
}

function skolformsnamnFörEnkätnyckel(nyckel: string): string {
  return skolformsnamnFörStatistiknyckel(
    ENKÄTNYCKEL_TILL_STATISTIKNYCKEL[nyckel] ?? nyckel,
  );
}

const SVARSALTERNATIV_PÅ_SVENSKA: Record<string, string> = {
  ratioCorrespondsFully: "Stämmer helt och hållet",
  ratioCorrespondsWell: "Stämmer ganska bra",
  ratioCorrespondsPoorly: "Stämmer ganska dåligt",
  ratioCorrespondsNotAtAll: "Stämmer inte alls",
  ratioAlways: "Alltid",
  ratioOften: "Oftast",
  ratioSometimes: "Ibland",
  ratioSeldom: "Sällan",
  ratioNever: "Aldrig",
  ratioDoNotKnow: "Vet inte",
  ratioNoAnswer: "Inget svar",
};

/**
 * Enkätsvarens tal kommer som svensk decimaltext ("8,2"), procenttext
 * ("100%") eller `"-"` för "ingen som svarat på just den här varianten av
 * frågan". Alla tre ska bli antingen ett tal eller `null`.
 */
function tolkaEnkättal(text: string | null | undefined): number | null {
  if (!text || text === "-") return null;
  const tal = Number(text.replace(",", ".").replace("%", ""));
  return Number.isFinite(tal) ? tal : null;
}

type RåEnkätfråga = {
  average: string | null;
  ratioCorrespondsFully?: string | null;
  ratioCorrespondsWell?: string | null;
  ratioCorrespondsPoorly?: string | null;
  ratioCorrespondsNotAtAll?: string | null;
  ratioAlways?: string | null;
  ratioOften?: string | null;
  ratioSometimes?: string | null;
  ratioSeldom?: string | null;
  ratioNever?: string | null;
  ratioDoNotKnow?: string | null;
  ratioNoAnswer?: string | null;
  questionDescription: string | null;
  questionSubject: string | null;
};

/** En enskild fråga i enkäten, med genomsnitt och svarsfördelning i procent. */
export type Enkätfråga = {
  fråga: string;
  ämne: string | null;
  genomsnitt: number | null;
  /** Svenskt svarsalternativ → andel i procent. Bara alternativ med data tas med. */
  svarsfördelning: Record<string, number>;
};

/**
 * Tolkar en frågeblock. `recommendMetrics` saknar `questionDescription` när
 * frågan inte ställdes i den enkätomgången – det räknas som att frågan
 * saknas, inte som en fråga utan svar.
 */
function tillEnkätfråga(fråga: RåEnkätfråga | undefined): Enkätfråga | null {
  if (!fråga || fråga.questionDescription == null) return null;

  const svarsfördelning: Record<string, number> = {};
  for (const [nyckel, etikett] of Object.entries(SVARSALTERNATIV_PÅ_SVENSKA)) {
    const värde = tolkaEnkättal(
      fråga[nyckel as keyof RåEnkätfråga] as string | null | undefined,
    );
    if (värde !== null) svarsfördelning[etikett] = värde;
  }

  return {
    fråga: fråga.questionDescription,
    ämne: fråga.questionSubject,
    genomsnitt: tolkaEnkättal(fråga.average),
    svarsfördelning,
  };
}

type RåVårdnadshavarenkät = {
  semester: string | null;
  noOfAnswers: string | null;
  recommendMetrics?: RåEnkätfråga;
  satisfactionMetrics?: RåEnkätfråga;
  securityMetrics?: RåEnkätfråga;
  workingEnvironmentMetrics?: RåEnkätfråga;
  supportMetrics?: RåEnkätfråga;
  inspirationMetrics?: RåEnkätfråga;
};

type RåElevenkät = RåVårdnadshavarenkät & {
  schoolYear: string | null;
  noInGroup: string | null;
  answeringFrequency: string | null;
};

/** Vårdnadshavarenkäten för en skolform (förskoleklass, grundskola eller anpassad grundskola). */
export type Vårdnadshavarenkät = {
  skolform: string;
  läsår: string | null;
  antalSvar: number | null;
  rekommendation: Enkätfråga | null;
  nöjdhet: Enkätfråga | null;
  trygghet: Enkätfråga | null;
  studiero: Enkätfråga | null;
  stöd: Enkätfråga | null;
  stimulans: Enkätfråga | null;
};

/** Elevenkäten för en årskurs inom en skolform (grundskola eller gymnasieskola). */
export type Elevenkät = {
  skolform: string;
  läsår: string | null;
  årskurs: string | null;
  antalIGruppen: number | null;
  svarsfrekvens: number | null;
  antalSvar: number | null;
  rekommendation: Enkätfråga | null;
  nöjdhet: Enkätfråga | null;
  trygghet: Enkätfråga | null;
  studiero: Enkätfråga | null;
  stöd: Enkätfråga | null;
  stimulans: Enkätfråga | null;
};

export type Skolenkät = {
  skolenhetskod: string;
  /** En post per skolform som har en vårdnadshavarenkät. */
  vårdnadshavare: Vårdnadshavarenkät[];
  /** En post per årskurs och skolform som har en elevenkät. */
  elever: Elevenkät[];
};

function tillVårdnadshavarenkät(
  nyckel: string,
  rå: RåVårdnadshavarenkät,
): Vårdnadshavarenkät {
  return {
    skolform: skolformsnamnFörEnkätnyckel(nyckel),
    läsår: rå.semester,
    antalSvar: tolkaEnkättal(rå.noOfAnswers),
    rekommendation: tillEnkätfråga(rå.recommendMetrics),
    nöjdhet: tillEnkätfråga(rå.satisfactionMetrics),
    trygghet: tillEnkätfråga(rå.securityMetrics),
    studiero: tillEnkätfråga(rå.workingEnvironmentMetrics),
    stöd: tillEnkätfråga(rå.supportMetrics),
    stimulans: tillEnkätfråga(rå.inspirationMetrics),
  };
}

function tillElevenkät(nyckel: string, rå: RåElevenkät): Elevenkät {
  return {
    ...tillVårdnadshavarenkät(nyckel, rå),
    årskurs: rå.schoolYear,
    antalIGruppen: tolkaEnkättal(rå.noInGroup),
    svarsfrekvens: tolkaEnkättal(rå.answeringFrequency),
  };
}

type Enkätsvar<T> = { status: string; message: string; body: T };

async function hämtaEnkätlänkar(skolenhetskod: string): Promise<string[]> {
  const url = `${PLANERADE_UTBILDNINGAR}/school-units/${skolenhetskod}/nestedsurveys`;
  const svar =
    await hämtaJson<Enkätsvar<{ _links?: Record<string, { href: string }> }>>(url);
  if (!svar || svar.status !== "OK") return [];
  return Object.keys(svar.body._links ?? {}).filter((nyckel) => nyckel !== "self");
}

async function hämtaVårdnadshavarenkät(
  skolenhetskod: string,
  nyckel: string,
): Promise<RåVårdnadshavarenkät | null> {
  const url = `${PLANERADE_UTBILDNINGAR}/school-units/${skolenhetskod}/nestedsurveys/${nyckel}`;
  const svar = await hämtaJson<Enkätsvar<RåVårdnadshavarenkät | "">>(url);
  if (!svar || svar.status !== "OK" || !svar.body) return null;
  return svar.body;
}

async function hämtaElevenkät(
  skolenhetskod: string,
  nyckel: string,
): Promise<RåElevenkät[]> {
  const url = `${PLANERADE_UTBILDNINGAR}/school-units/${skolenhetskod}/nestedsurveys/${nyckel}`;
  const svar =
    await hämtaJson<Enkätsvar<{ schoolYearMetrics?: RåElevenkät[] } | "">>(url);
  if (!svar || svar.status !== "OK" || !svar.body) return [];
  return svar.body.schoolYearMetrics ?? [];
}

/**
 * Skolinspektionens skolenkät för en enskild skolenhet: en vårdnadshavarenkät
 * per skolform enheten bedriver och en elevenkät per årskurs och skolform.
 *
 * Enheter utan svarande saknar länken helt i `nestedsurveys` – de ger tomma
 * listor här, inte en enkät med bara nollor.
 */
export async function byggSkolenkät(skolenhetskod: string): Promise<Skolenkät> {
  const nycklar = await hämtaEnkätlänkar(skolenhetskod);
  const vårdnadshavarnycklar = nycklar.filter((n) => n.startsWith("custodians"));
  const elevnycklar = nycklar.filter((n) => n.startsWith("pupils"));

  const [vårdnadshavarsvar, elevsvar] = await Promise.all([
    parallellt(
      vårdnadshavarnycklar,
      (nyckel) => hämtaVårdnadshavarenkät(skolenhetskod, nyckel),
      vårdnadshavarnycklar.length || 1,
    ),
    parallellt(
      elevnycklar,
      (nyckel) => hämtaElevenkät(skolenhetskod, nyckel),
      elevnycklar.length || 1,
    ),
  ]);

  const vårdnadshavare = vårdnadshavarnycklar
    .map((nyckel, index) => {
      const rå = vårdnadshavarsvar[index];
      return rå ? tillVårdnadshavarenkät(nyckel, rå) : null;
    })
    .filter((rad): rad is Vårdnadshavarenkät => rad !== null);

  const elever = elevnycklar.flatMap((nyckel, index) =>
    (elevsvar[index] ?? []).map((rå) => tillElevenkät(nyckel, rå)),
  );

  return { skolenhetskod, vårdnadshavare, elever };
}

// ════════════════════════════════════════════════════════════════════════
// Skolinspektionens dokument
//
// Beslut, rapporter och skolenkätrapporter i pdf, per skolform. Filerna
// själva ligger hos Siris – det här API:et ger bara länkarna och metadatan.
// ════════════════════════════════════════════════════════════════════════

type RåDokument = {
  type: string;
  typeId: string;
  title: string;
  fileName: string;
  mimeType: string;
  size: string;
  url: string;
};

type RåDokumentgrupp = {
  typeOfSchoolingCode: string;
  documents: RåDokument[];
};

/** Ett enskilt dokument, t.ex. en skolenkätrapport eller ett granskningsbeslut. */
export type SkolinspektionDokument = {
  typ: string;
  typId: string;
  titel: string;
  filnamn: string;
  mimetyp: string;
  storlekBytes: number | null;
  url: string;
};

export type SkolinspektionDokumentgrupp = {
  skolform: string;
  dokument: SkolinspektionDokument[];
};

function tillDokument(rå: RåDokument): SkolinspektionDokument {
  const storlek = Number(rå.size);
  return {
    typ: rå.type,
    typId: rå.typeId,
    titel: rå.title,
    filnamn: rå.fileName,
    mimetyp: rå.mimeType,
    storlekBytes: Number.isFinite(storlek) ? storlek : null,
    url: rå.url,
  };
}

function tillDokumentgrupp(rå: RåDokumentgrupp): SkolinspektionDokumentgrupp {
  return {
    skolform: skolformsnamnFörStatistiknyckel(rå.typeOfSchoolingCode),
    dokument: rå.documents.map(tillDokument),
  };
}

async function hämtaDokument(skolenhetskod: string): Promise<RåDokumentgrupp[]> {
  const url = `${PLANERADE_UTBILDNINGAR}/school-units/${skolenhetskod}/documents`;
  const svar = await hämtaJson<Enkätsvar<RåDokumentgrupp[] | "">>(url);
  if (!svar || svar.status !== "OK" || !svar.body) return [];
  return svar.body;
}

async function hämtaDokumentFörSkolform(
  skolenhetskod: string,
  skolform: string,
): Promise<RåDokumentgrupp | null> {
  const url = `${PLANERADE_UTBILDNINGAR}/school-units/${skolenhetskod}/documents/${skolform}`;
  const svar = await hämtaJson<Enkätsvar<RåDokumentgrupp | "">>(url);
  if (!svar || svar.status !== "OK" || !svar.body) return null;
  return svar.body;
}

/**
 * Skolinspektionens dokument för en skolenhet – skolenkätrapporter,
 * granskningsbeslut och liknande, grupperade per skolform.
 *
 * @param skolform Statistiknyckeln för en enskild skolform (`"fsk"`, `"gr"`,
 *                 `"gran"`, `"gy"` eller `"gyan"`). Utan den hämtas alla
 *                 skolformer enheten har dokument för i ett anrop.
 */
export async function byggSkolinspektionDokument(
  skolenhetskod: string,
  skolform?: Statistiknyckel,
): Promise<SkolinspektionDokumentgrupp[]> {
  if (skolform) {
    const grupp = await hämtaDokumentFörSkolform(skolenhetskod, skolform);
    return grupp ? [tillDokumentgrupp(grupp)] : [];
  }

  const grupper = await hämtaDokument(skolenhetskod);
  return grupper.map(tillDokumentgrupp);
}

/** Skolenkät och Skolinspektionens dokument för en enskild skolenhet. */
export type SkolenkätOchDokument = {
  skolenhetskod: string;
  enkät: Skolenkät;
  dokument: SkolinspektionDokumentgrupp[];
};

/**
 * Skoldetalj för varje skolenhet i en lista.
 *
 * Gör 2–3 anrop per skolenhet – kör den i ett bygg- eller cron-steg och
 * spara resultatet, precis som byggSkolregister(). Skicka med ett förbyggt
 * kommunregister, se doc-kommentaren på byggSkoldetalj().
 *
 * En enhet som kastar (t.ex. nätverksfel) hoppas över i stället för att
 * fälla hela körningen.
 *
 * @param rapportera Frivillig återkoppling för loggning under körningen.
 */
export async function byggSkoldetaljer(
  skolenhetskoder: readonly string[],
  kommuner: Kommunregister,
  rapportera: (klara: number, totalt: number) => void = () => {},
): Promise<Skoldetalj[]> {
  let klara = 0;

  const detaljer = await parallellt(skolenhetskoder, async (skolenhetskod) => {
    try {
      return await byggSkoldetalj(skolenhetskod, kommuner);
    } catch {
      return null;
    } finally {
      rapportera(++klara, skolenhetskoder.length);
    }
  });

  return detaljer.filter((detalj): detalj is Skoldetalj => detalj !== null);
}

/**
 * Skolenkät och Skolinspektionens dokument för varje skolenhet i en lista.
 *
 * Gör två anrop per skolenhet – kör den i ett bygg- eller cron-steg och
 * spara resultatet, precis som byggSkolregister().
 *
 * @param rapportera Frivillig återkoppling för loggning under körningen.
 */
export async function byggSkolenkäterOchDokument(
  skolenhetskoder: readonly string[],
  rapportera: (klara: number, totalt: number) => void = () => {},
): Promise<SkolenkätOchDokument[]> {
  let klara = 0;

  return parallellt(skolenhetskoder, async (skolenhetskod) => {
    try {
      const [enkät, dokument] = await Promise.all([
        byggSkolenkät(skolenhetskod),
        byggSkolinspektionDokument(skolenhetskod),
      ]);
      return { skolenhetskod, enkät, dokument };
    } finally {
      rapportera(++klara, skolenhetskoder.length);
    }
  });
}

/**
 * En rad per huvudman, med enheter och elever hopräknade från skolregistret.
 *
 * @param koncerner Uppslagstabellen från `bun run bygg-koncern`, om den finns.
 *                  Utan den blir fältet `koncern` null på alla rader.
 */
export async function byggHuvudmannaregister(
  skolor: readonly Skolrad[],
  koncerner?: Koncernlookupdata | null,
): Promise<Huvudmannarad[]> {
  const lista = await hämtaHuvudmannalista();
  const huvudmän = lista?.data.attributes ?? [];

  const detaljer = await parallellt(huvudmän, (h) => hämtaHuvudman(h.organizationNumber));

  // Räkna på organisationsnummer, inte namn: samma huvudman förekommer med
  // olika stavning och versalisering i registret.
  const perOrgnr = new Map<string, { enheter: number; elever: number }>();
  for (const skola of skolor) {
    if (!skola.huvudmannaOrgnr) continue;
    const post = perOrgnr.get(skola.huvudmannaOrgnr) ?? { enheter: 0, elever: 0 };
    post.enheter += 1;
    post.elever += skola.antalElever ?? 0;
    perOrgnr.set(skola.huvudmannaOrgnr, post);
  }

  return huvudmän.map((huvudman, index) => {
    const attribut = detaljer[index]?.data.attributes;
    const räknat = perOrgnr.get(huvudman.organizationNumber) ?? { enheter: 0, elever: 0 };
    return {
      organisationsnummer: huvudman.organizationNumber,
      namn: huvudman.displayName,
      typ: påSvenska(HUVUDMANNATYP_PÅ_SVENSKA, huvudman.organizerType),
      bolagsform: attribut?.companyForm?.displayName ?? null,
      koncern: slåUppKoncern(huvudman.organizationNumber, koncerner),
      kommuner: (attribut?.municipalities ?? []).map((kommun) => kommun.displayName),
      skolformer: skolformsnamn(attribut?.schoolTypes),
      antalEnheter: räknat.enheter,
      antalElever: räknat.elever,
    };
  });
}
