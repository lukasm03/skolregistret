// Allt som rör koncernkartläggningen bland skolhuvudmännen – i en fil, eftersom
// de tre delarna nedan bara används av varandra och av det här kommandot.
//
//   bun run koncern bygg
//   bun run koncern las-arsredovisning <fil>
//   bun run koncern importera-skolkoll
//
// bolagsverket.ts svarar på en fråga i taget: "ingår det här företaget i en
// koncern?". Den här filen gör det till ett register – den letar sig uppåt i
// ägarkedjorna från Skolverkets fristående huvudmän, sparar det den hittar
// mellan körningar och skriver ut en färdig uppslagstabell
// (data/koncern-lookup.json) som sajten kan servera statiskt.
//
// Tre källor fyller samma lager (data/koncern-lager.json), var och en med sin
// egen rang – en svagare källa skriver aldrig över en starkare:
//
//   1. `bun run koncern bygg`                – Bolagsverkets iXBRL, live
//   2. `bun run koncern las-arsredovisning`   – koncernens egen pdf, näst starkast
//   3. `bun run koncern importera-skolkoll`   – skolkoll.se, tredjepartsdata
//
// VARFÖR RESULTATEN SPARAS
// ------------------------
// Ett företag lämnar årsredovisning en gång om året. En körning ser alltså bara
// den bråkdel som lämnat in nyligen; resten svarar "okänt" trots att vi kanske
// visste svaret förra månaden. Därför sparas varje härlett besked permanent, och
// ett nytt "okänt" får aldrig skriva över ett tidigare "ja" eller "nej". Det här
// är inte samma sak som att mellanlagra API-svar – vi sparar slutsatsen, inte
// trafiken.

import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { promisify } from "node:util";
import {
  kontrolleraKoncern,
  type Dotterföretag,
  type Koncernbesked,
} from "./bolagsverket.ts";

const SKOLENHETSREGISTRET = "https://api.skolverket.se/skolenhetsregistret/v2";

// ════════════════════════════════════════════════════════════════════════
// Inställningar
// ════════════════════════════════════════════════════════════════════════

/** Paus mellan företag mot Bolagsverket. Kvoten ger 429 om man kör hårdare. */
const PAUS_MS = 700;

/** Ett sparat besked räknas som färskt så länge. Årsredovisningar kommer årsvis. */
const FÄRSKT_DYGN = 30;

/** Hur många gånger vi matar tillbaka upptäckta moderföretag i bygg-loopen. */
const MAX_RUNDOR = 4;

/** Skydd mot ägarcykler i trasig indata. */
const MAX_DJUP = 12;

/** Under den här kapitalandelen är innehavet inget dotterföretag (pdf-läsningen). */
const MINSTA_ANDEL = 50;

/** pdftotext skriver hela dokumentet till stdout. En årsredovisning blir några megabyte. */
const MAX_UTDATA = 64 * 1024 * 1024;

const vänta = (ms: number) => new Promise((klar) => setTimeout(klar, ms));

// ════════════════════════════════════════════════════════════════════════
// Lager
// ════════════════════════════════════════════════════════════════════════

/**
 * Varifrån ett besked kommer.
 *
 * Ordningen är en rangordning: ett svagare underlag skriver aldrig över ett
 * starkare. En inläst pdf väger tyngre än ett live-anrop, eftersom noten i en
 * koncernredovisning räknar upp hela koncernen medan den digitala
 * årsredovisningen oftast bara pekar uppåt på närmaste moderföretag.
 *
 * `skolkoll` ligger i samma skikt som `live`/`tidigare`, inte över – det är en
 * tredjepartskälla, inte en primärkälla, och ska aldrig kunna skriva över ett
 * svar Bolagsverket redan gett. Importen håller sig dessutom till det
 * striktare: den skriver bara till organisationsnummer som är `"okänt"` hos
 * oss, oavsett vad rangordningen här skulle tillåta.
 */
export type Källa = "manuell" | "pdf" | "skolkoll" | "live" | "tidigare";

const RANG: Record<Källa, number> = {
  manuell: 3,
  pdf: 2,
  skolkoll: 1,
  live: 1,
  tidigare: 1,
};

export type Lagerpost = {
  besked: Koncernbesked;
  /** När beskedet härleddes, ISO-datum. */
  hämtad: string;
  källa: Källa;
  /** Fritt fält för den som lägger in en manuell rättelse. */
  rättadAv?: string;
};

export type Koncernlager = {
  hämta(organisationsnummer: string): Lagerpost | undefined;
  spara(organisationsnummer: string, post: Lagerpost): void;
  alla(): Map<string, Lagerpost>;
  skrivTillDisk(): Promise<void>;
};

type LagerFil = { version: 1; poster: Record<string, Lagerpost> };

/** Skriver via en temporärfil så att en avbruten körning inte lämnar trasig JSON. */
async function skrivAtomiskt(sökväg: string, innehåll: string): Promise<void> {
  await mkdir(dirname(sökväg), { recursive: true });
  const temp = `${sökväg}.tmp`;
  await writeFile(temp, innehåll);
  await rename(temp, sökväg);
}

/** Lager som ligger i en JSON-fil. Läses en gång, skrivs när körningen är klar. */
export async function öppnaLager(sökväg: string): Promise<Koncernlager> {
  let poster = new Map<string, Lagerpost>();

  try {
    const fil = JSON.parse(await readFile(sökväg, "utf8")) as LagerFil;
    poster = new Map(Object.entries(fil.poster ?? {}));
  } catch {
    // Ingen fil än – första körningen börjar tomt.
  }

  return {
    hämta: (orgnr) => poster.get(orgnr),
    spara: (orgnr, post) => void poster.set(orgnr, post),
    alla: () => poster,
    skrivTillDisk: () =>
      skrivAtomiskt(
        sökväg,
        JSON.stringify({ version: 1, poster: Object.fromEntries(poster) }, null, 1),
      ),
  };
}

function ålderDygn(hämtad: string): number {
  return (Date.now() - Date.parse(hämtad)) / 86_400_000;
}

/**
 * Avgör om ett företag behöver frågas om på nytt.
 *
 * Manuella rättelser rörs aldrig. Ett tidigare "okänt" är värt att försöka igen
 * så fort det hunnit bli gammalt – där kan en ny årsredovisning ha dykt upp.
 */
function behöverUppdateras(post: Lagerpost | undefined): boolean {
  if (!post) return true;
  if (post.källa === "manuell") return false;
  return ålderDygn(post.hämtad) > FÄRSKT_DYGN;
}

/**
 * Märker ett besked som oförändrat sedan förra körningen.
 *
 * Bara live-hämtade besked åldersstämplas så – en inläst pdf och en manuell
 * rättelse behåller sin källa, annars tappar de sin rangordning och kan skrivas
 * över av nästa live-anrop.
 */
function bevara(post: Lagerpost): Lagerpost {
  return post.källa === "live" ? { ...post, källa: "tidigare" } : post;
}

/**
 * Väver ihop två besked om samma företag.
 *
 * De två källorna ser olika delar av samma koncern: pdf:en räknar upp
 * dotterbolagen, den digitala årsredovisningen pekar uppåt mot moderföretaget.
 * Att låta den ena ersätta den andra vore att slänga halva bilden, så fält som
 * saknas i det starkare beskedet fylls ur det svagare.
 */
function väv(starkare: Koncernbesked, svagare: Koncernbesked): Koncernbesked {
  return {
    ...starkare,
    namn: starkare.namn ?? svagare.namn,
    juridiskForm: starkare.juridiskForm ?? svagare.juridiskForm,
    verksam: starkare.verksam ?? svagare.verksam,
    koncern: starkare.koncern !== "okänt" ? starkare.koncern : svagare.koncern,
    roll: starkare.roll ?? svagare.roll,
    moderföretag: starkare.moderföretag ?? svagare.moderföretag,
    yttersta: starkare.yttersta ?? svagare.yttersta,
    dotterföretag:
      starkare.dotterföretag.length >= svagare.dotterföretag.length
        ? starkare.dotterföretag
        : svagare.dotterföretag,
    räkenskapsårTom: starkare.räkenskapsårTom ?? svagare.räkenskapsårTom,
    årsredovisningar:
      starkare.årsredovisningar.length > 0
        ? starkare.årsredovisningar
        : svagare.årsredovisningar,
    grunder: [...new Set([...starkare.grunder, ...svagare.grunder])],
  };
}

/**
 * Lägger ett nytt besked ovanpå ett tidigare.
 *
 * Ett "okänt" ersätter aldrig ett svar vi redan har. Det är hela poängen med
 * lagret: företaget har inte lämnat någon ny årsredovisning, alltså vet vi
 * fortfarande det vi visste – vi vet det bara inte av den här körningen.
 */
export function slåIhop(
  tidigare: Lagerpost | undefined,
  nytt: Koncernbesked,
  nu: string,
  källa: Källa = "live",
): Lagerpost {
  if (!tidigare) return { besked: nytt, hämtad: nu, källa };
  if (tidigare.källa === "manuell") return tidigare;

  if (nytt.koncern === "okänt" && tidigare.besked.koncern !== "okänt")
    return bevara(tidigare);

  // Ett svagare underlag får komplettera det starkare, aldrig ersätta det.
  if (RANG[tidigare.källa] > RANG[källa]) {
    return { ...tidigare, besked: väv(tidigare.besked, nytt) };
  }

  return { besked: väv(nytt, tidigare.besked), hämtad: nu, källa };
}

// ════════════════════════════════════════════════════════════════════════
// Upptäcktsloop mot Bolagsverket
// ════════════════════════════════════════════════════════════════════════

/** Organisationsnummer som ett besked pekar vidare på och som är värda att följa. */
function grannar(besked: Koncernbesked): string[] {
  const ut: string[] = [];

  // Utländska nummer går inte att slå upp hos Bolagsverket – de blir rotnoder
  // med enbart det namn dotterbolaget uppgav.
  if (besked.moderföretag?.organisationsnummer && !besked.moderföretag.utländskt) {
    ut.push(besked.moderföretag.organisationsnummer);
  }
  if (besked.yttersta?.organisationsnummer && !besked.yttersta.utländskt) {
    ut.push(besked.yttersta.organisationsnummer);
  }
  for (const dotter of besked.dotterföretag) {
    if (dotter.organisationsnummer && !dotter.utländskt)
      ut.push(dotter.organisationsnummer);
  }

  return ut;
}

export type Kartläggning = {
  lager: Koncernlager;
  statistik: {
    frön: number;
    besökta: number;
    upptäckta: number;
    hoppade: number;
    fel: number;
    rundor: number;
  };
};

/**
 * Går igenom fröna, och därefter de moder- och dotterföretag som dyker upp.
 *
 * Det är den här återmatningen som fångar de små koncernerna: en skola pekar ut
 * ett holdingbolag som inte själv driver skola, och som därför aldrig finns i
 * Skolverkets register. Utan det steget blir kanten hängande och koncernen
 * osynlig.
 */
export async function kartläggKoncerner(
  frön: readonly string[],
  val: {
    lager: Koncernlager;
    maxRundor?: number;
    rapportera?: (klara: number, totalt: number, runda: number) => void;
  },
): Promise<Kartläggning> {
  const { lager, maxRundor = MAX_RUNDOR, rapportera = () => {} } = val;
  const nu = new Date().toISOString();

  const behandlade = new Set<string>();
  const statistik = {
    frön: frön.length,
    besökta: 0,
    upptäckta: 0,
    hoppade: 0,
    fel: 0,
    rundor: 0,
  };
  let kö = [...new Set(frön)];

  for (let runda = 1; runda <= maxRundor && kö.length > 0; runda++) {
    statistik.rundor = runda;
    const nästaKö = new Set<string>();
    let klara = 0;

    for (const orgnr of kö) {
      if (behandlade.has(orgnr)) continue;
      behandlade.add(orgnr);

      const tidigare = lager.hämta(orgnr);

      // Redan färskt: hoppa anropet men följ ändå kanterna vidare, annars
      // stannar upptäckten så fort lagret är varmt.
      if (!behöverUppdateras(tidigare)) {
        statistik.hoppade++;
        for (const granne of grannar(tidigare!.besked)) {
          if (!behandlade.has(granne)) nästaKö.add(granne);
        }
        rapportera(++klara, kö.length, runda);
        continue;
      }

      try {
        const besked = await kontrolleraKoncern(orgnr);
        if (besked) {
          lager.spara(orgnr, slåIhop(tidigare, besked, nu));
          statistik.besökta++;
          if (runda > 1) statistik.upptäckta++;
          for (const granne of grannar(besked)) {
            if (!behandlade.has(granne)) nästaKö.add(granne);
          }
        }
      } catch {
        // Ett företag som inte svarar får inte fälla hela körningen.
        // Lagret behåller det vi visste sedan tidigare.
        statistik.fel++;
      }

      rapportera(++klara, kö.length, runda);
      await vänta(PAUS_MS);
    }

    kö = [...nästaKö];
  }

  return { lager, statistik };
}

// ════════════════════════════════════════════════════════════════════════
// Koncerngraf
// ════════════════════════════════════════════════════════════════════════

export type Koncernpost = {
  orgNr: string;
  namn: string | null;
  /** Koncernens översta bolag. Är lika med orgNr för den som är egen rot. */
  koncernOrgNr: string;
  koncernNamn: string | null;
  /** Namnkedjan från roten ned till företaget. */
  path: string[];
  pathOrgNrs: string[];
  parentOrgNr: string | null;
  ägarandel: number | null;
  källa: Källa;
};

export type Koncern = {
  orgNr: string;
  namn: string | null;
  medlemmar: number;
  /** Sant först när koncernen har mer än ett företag. */
  flerFöretag: boolean;
};

type Nod = {
  namn: string | null;
  förälder: string | null;
  ägarandel: number | null;
  källa: Källa;
};

/**
 * Bygger ägargrafen ur lagret och löser upp varje företag till sin koncernrot.
 *
 * Kanter kommer från två håll: dotterbolag som pekar uppåt på sitt moderföretag,
 * och moderbolag som räknar upp sina dotterföretag. Den uppåtriktade kanten är
 * pålitligast och får gå före när båda finns.
 */
export function byggKoncerngraf(lager: Koncernlager): {
  lookup: Map<string, Koncernpost>;
  koncerner: Map<string, Koncern>;
} {
  const noder = new Map<string, Nod>();

  const nod = (orgnr: string): Nod => {
    let n = noder.get(orgnr);
    if (!n)
      noder.set(
        orgnr,
        (n = { namn: null, förälder: null, ägarandel: null, källa: "live" }),
      );
    return n;
  };

  // Först alla företag vi själva har frågat om.
  for (const [orgnr, post] of lager.alla()) {
    const n = nod(orgnr);
    n.namn = post.besked.namn ?? n.namn;
    n.källa = post.källa;
  }

  // Sedan kanterna. Uppåtkanten skrivs alltid; nedåtkanten bara om företaget
  // inte redan pekat ut en förälder själv.
  for (const [orgnr, post] of lager.alla()) {
    const moder = post.besked.moderföretag;
    if (moder?.organisationsnummer) {
      const m = nod(moder.organisationsnummer);
      m.namn ??= moder.namn;
      nod(orgnr).förälder = moder.organisationsnummer;
    }

    for (const dotter of post.besked.dotterföretag) {
      if (!dotter.organisationsnummer) continue;
      const d = nod(dotter.organisationsnummer);
      d.namn ??= dotter.namn;
      // Ett bolag vi bara känner genom sin förälders förteckning ärver
      // förälderns källa – annars ser en pdf-läst koncern ut att vara
      // live-hämtad hela vägen ned.
      if (!lager.hämta(dotter.organisationsnummer)) d.källa = post.källa;
      if (!d.förälder) {
        d.förälder = orgnr;
        d.ägarandel = dotter.kapitalandel;
      }
    }
  }

  /** Kedjan från ett företag upp till roten. Bryter vid cykel och för stort djup. */
  function uppåt(start: string): string[] {
    const kedja = [start];
    const sedda = new Set([start]);
    let nuvarande = start;

    for (let steg = 0; steg < MAX_DJUP; steg++) {
      const förälder = noder.get(nuvarande)?.förälder;
      if (!förälder || sedda.has(förälder)) break;
      sedda.add(förälder);
      kedja.push(förälder);
      nuvarande = förälder;
    }

    return kedja;
  }

  // Sist: koncernens yttersta bolag, som reserv när kedjan tar slut i förtid.
  // Mellanliggande holdingbolag lämnar sällan in digitalt, så utan det här
  // stannar Dibber-kedjan vid Dibber Sverige AB i stället för DIBBER AS.
  for (const [orgnr, post] of lager.alla()) {
    const topp = post.besked.yttersta;
    if (!topp?.organisationsnummer) continue;

    const kedja = uppåt(orgnr);
    const rot = kedja.at(-1)!;
    if (rot === topp.organisationsnummer || kedja.includes(topp.organisationsnummer))
      continue;

    const t = nod(topp.organisationsnummer);
    t.namn ??= topp.namn;
    if (!noder.get(rot)!.förälder) noder.get(rot)!.förälder = topp.organisationsnummer;
  }

  const lookup = new Map<string, Koncernpost>();
  for (const [orgnr, n] of noder) {
    const kedja = uppåt(orgnr);
    const rot = kedja.at(-1)!;
    const uppifrån = [...kedja].reverse();

    lookup.set(orgnr, {
      orgNr: orgnr,
      namn: n.namn,
      koncernOrgNr: rot,
      koncernNamn: noder.get(rot)?.namn ?? null,
      path: uppifrån.map((o) => noder.get(o)?.namn ?? o),
      pathOrgNrs: uppifrån,
      parentOrgNr: n.förälder,
      ägarandel: n.ägarandel,
      källa: n.källa,
    });
  }

  const antal = new Map<string, number>();
  for (const post of lookup.values()) {
    antal.set(post.koncernOrgNr, (antal.get(post.koncernOrgNr) ?? 0) + 1);
  }

  const koncerner = new Map<string, Koncern>();
  for (const [rot, medlemmar] of antal) {
    koncerner.set(rot, {
      orgNr: rot,
      namn: noder.get(rot)?.namn ?? null,
      medlemmar,
      flerFöretag: medlemmar > 1,
    });
  }

  return { lookup, koncerner };
}

// ════════════════════════════════════════════════════════════════════════
// Batchbygge: bun run koncern bygg
// ════════════════════════════════════════════════════════════════════════

export type Koncernlookup = {
  meta: {
    byggd: string;
    koncerner: number;
    flerföretagskoncerner: number;
    företag: number;
    statistik: Kartläggning["statistik"];
  };
  koncerner: Record<string, Koncern>;
  lookup: Record<string, Koncernpost>;
};

/**
 * Kör hela kartläggningen och skriver den statiska uppslagstabellen.
 *
 * Tänkt för ett cron-jobb, inte för en request. Ett fullt varv gör tusentals
 * anrop mot Bolagsverket och tar timmar; lagret gör att en avbruten körning kan
 * återupptas där den slutade genom att helt enkelt startas om.
 */
export async function byggKoncernlookup(val: {
  frön: readonly string[];
  lagerfil?: string;
  utfil?: string;
  maxRundor?: number;
  rapportera?: (klara: number, totalt: number, runda: number) => void;
}): Promise<Koncernlookup> {
  const {
    frön,
    lagerfil = "data/koncern-lager.json",
    utfil = "data/koncern-lookup.json",
    maxRundor,
    rapportera,
  } = val;

  const lager = await öppnaLager(lagerfil);
  const { statistik } = await kartläggKoncerner(frön, { lager, maxRundor, rapportera });
  await lager.skrivTillDisk();

  const { lookup, koncerner } = byggKoncerngraf(lager);

  const resultat: Koncernlookup = {
    meta: {
      byggd: new Date().toISOString(),
      koncerner: koncerner.size,
      flerföretagskoncerner: [...koncerner.values()].filter((k) => k.flerFöretag).length,
      företag: lookup.size,
      statistik,
    },
    koncerner: Object.fromEntries(koncerner),
    lookup: Object.fromEntries(lookup),
  };

  await skrivAtomiskt(utfil, JSON.stringify(resultat));
  return resultat;
}

/** Läser en färdigbyggd uppslagstabell, t.ex. i en API-rutt. */
export async function läsKoncernlookup(
  sökväg = "data/koncern-lookup.json",
): Promise<Koncernlookup | null> {
  try {
    return JSON.parse(await readFile(sökväg, "utf8")) as Koncernlookup;
  } catch {
    return null;
  }
}

/** Fristående huvudmän. Kommuner och regioner har ingen koncernstruktur att söka. */
async function hämtaFrön(): Promise<string[]> {
  const svar = await fetch(`${SKOLENHETSREGISTRET}/organizers`, {
    headers: { Accept: "application/json" },
  });
  if (!svar.ok) throw new Error(`Skolverket svarade ${svar.status}`);

  const data = (await svar.json()) as {
    data: { attributes: Array<{ organizationNumber: string; organizerType: string }> };
  };
  return data.data.attributes
    .filter((h) => h.organizerType === "ENSKILD")
    .map((h) => h.organizationNumber);
}

function visaFörlopp(klara: number, totalt: number, runda: number, start: number): void {
  if (klara % 25 !== 0 && klara !== totalt) return;
  const andel = klara / totalt;
  const gången = (Date.now() - start) / 1000;
  const kvar = andel > 0 ? Math.round(gången / andel - gången) : 0;
  const bar = "█".repeat(Math.round(andel * 20)).padEnd(20, "░");
  process.stdout.write(
    `\r  runda ${runda}  ${bar} ${klara}/${totalt}  ~${Math.round(kvar / 60)} min kvar   `,
  );
  if (klara === totalt) process.stdout.write("\n");
}

async function körBygg(): Promise<void> {
  const start = Date.now();
  const frön = await hämtaFrön();
  console.log(`Kartlägger koncerner för ${frön.length} fristående huvudmän …`);
  console.log(
    "Avbryt när du vill – lagret gör att nästa körning fortsätter där den slutade.\n",
  );

  const resultat = await byggKoncernlookup({
    frön,
    rapportera: (klara, totalt, runda) => visaFörlopp(klara, totalt, runda, start),
  });

  const { meta } = resultat;
  const minuter = ((Date.now() - start) / 60_000).toFixed(1);
  console.log(`\nKlart på ${minuter} min.`);
  console.log(`  ${meta.företag} företag i grafen`);
  console.log(
    `  ${meta.flerföretagskoncerner} koncerner med fler än ett företag (av ${meta.koncerner} rötter)`,
  );
  console.log(
    `  ${meta.statistik.besökta} hämtade, ${meta.statistik.hoppade} redan kända, ${meta.statistik.fel} fel`,
  );
  console.log(`  ${meta.statistik.upptäckta} bolag upptäckta via ägarkedjorna`);
  console.log("\n  data/koncern-lookup.json skriven");
}

// ════════════════════════════════════════════════════════════════════════
// Årsredovisningar i pdf: bun run koncern las-arsredovisning <fil>
//
// bolagsverket.ts kommer bara åt företag som lämnat in årsredovisningen
// digitalt, och det har de flesta inte gjort. De stora skolkoncernerna har
// däremot en helt annan egenskap: de publicerar själva sin årsredovisning som
// pdf på sin egen webbplats, gratis, och i den finns noten "Andelar i
// koncernföretag" med varje dotterbolags namn, organisationsnummer, säte och
// kapitalandel.
//
// VAD SOM FAKTISKT LÄSES
// ----------------------
// Noten sätts som en tabell, och en tabellrad ser i textform ut så här:
//
//   Sjölins Gymnasium AB      556375-8399   Stockholm   100%   500   1 000
//   ────────────────────      ───────────   ─────────   ────
//   namn                      org.nr        säte        andel
//
// Det är kombinationen organisationsnummer + säte + procenttal som letas upp.
// Andra tabeller i årsredovisningen fastnar därför inte i nätet.
//
// TVÅSPALTIGA SIDOR
// -----------------
// Årsredovisningar sätts ofta i två spalter. Textutdraget lägger då två
// orelaterade tabellrader på samma textrad, och en naiv tolkning låter
// vänsterspaltens sista kolumnrubrik hänga kvar i högerspaltens företagsnamn.
// Därför läses varje rad om och om igen efter fler träffar, och namnet plockas
// som den sista textklumpen före organisationsnumret – klumpar skiljs åt av två
// eller fler mellanslag, vilket är precis vad spaltmellanrummet består av.
// ════════════════════════════════════════════════════════════════════════

const kör = promisify(execFile);

export type Innehav = {
  namn: string | null;
  /** Svenska nummer normaliseras till tio siffror. Utländska sparas som de står. */
  organisationsnummer: string;
  utländskt: boolean;
  säte: string | null;
  /** Kapitalandel i procent. */
  kapitalandel: number;
  /** Sidan i pdf:en där raden står, så att den går att kontrollera mot originalet. */
  sida: number;
  /** Närmaste rubrik ovanför raden. Bara till för granskning – spalterna gör den opålitlig. */
  avsnitt: string | null;
};

export type Årsredovisningsläsning = {
  /** Företaget vars årsredovisning det är, om det gick att läsa ut ur texten. */
  moderföretag: { namn: string | null; organisationsnummer: string } | null;
  dotterföretag: Innehav[];
  /** Innehav under en rubrik om intresseföretag. De ingår inte i koncernen. */
  intresseföretag: Innehav[];
  /** Innehav med för låg kapitalandel för att vara dotterföretag. */
  minoritetsposter: Innehav[];
  sidor: number;
  varningar: string[];
};

/**
 * Städar bort tecken som sättningen lämnar efter sig i textutdraget.
 *
 * Mjuka bindestreck sitter mitt inne i ord ("Kapital{shy}andel") och tankstreck
 * används i stället för bindestreck i organisationsnummer ("556846–0231").
 * Båda måste bort innan något mönster kan matcha.
 */
export function normaliseraText(text: string): string {
  return text
    .replace(/­/g, "")
    .replace(/[    ]/g, " ")
    .replace(/[‐-―−]/g, "-")
    .replace(/\r\n?/g, "\n");
}

/** Kör pdftotext och ger tillbaka texten med sidbrytningar kvar som `\f`. */
export async function textUrPdf(sökväg: string): Promise<string> {
  try {
    const { stdout } = await kör("pdftotext", ["-layout", "-enc", "UTF-8", sökväg, "-"], {
      maxBuffer: MAX_UTDATA,
      encoding: "utf8",
    });
    return stdout;
  } catch (fel) {
    const kod = (fel as NodeJS.ErrnoException).code;
    if (kod === "ENOENT") {
      throw new Error(
        "pdftotext saknas. Installera poppler med `brew install poppler`, " +
          "eller gör textutdraget själv med `pdftotext -layout fil.pdf fil.txt` och läs in .txt-filen i stället.",
      );
    }
    throw new Error(
      `pdftotext kunde inte läsa ${sökväg}: ${fel instanceof Error ? fel.message : fel}`,
    );
  }
}

/**
 * Slutet av en innehavsrad: organisationsnummer, säte och kapitalandel.
 *
 * Sätet är det som skiljer en innehavsrad från alla andra tabeller med tal i.
 * `[ \t]` i stället för `\s` håller matchningen kvar på samma textrad.
 */
const INNEHAVSRAD =
  /(\d{6}-\d{4}|\d{8,11})[ \t]+(\p{Lu}[\p{L}.'’-]*(?:[ ]\p{Lu}[\p{L}.'’-]*)*)[ \t]+(\d{1,3}(?:[.,]\d+)?)[ \t]*%/gu;

/**
 * Samma rad utan procenttecken, för årsredovisningar som skriver andelen som
 * bara "100". Används först när det strikta mönstret inte gett en enda träff,
 * eftersom den här varianten är betydligt lättare att lura.
 */
const INNEHAVSRAD_UTAN_PROCENT =
  /(\d{6}-\d{4}|\d{8,11})[ \t]+(\p{Lu}[\p{L}.'’-]*(?:[ ]\p{Lu}[\p{L}.'’-]*)*)[ \t]+(100|\d{1,2}(?:[.,]\d)?)(?![\d.,%])/gu;

/** Kolumnrubriker som aldrig är företagsnamn. */
const RUBRIKORD =
  /^(org\.?\s*n|säte|kapital|ägar|andel|antal|nominell|bokfört|redovisat|summa|belopp|msek|tkr|kkr|not\b|moderbolag|koncern)/i;

function svensktNummer(nummer: string): boolean {
  return /^\d{6}-\d{4}$/.test(nummer);
}

function tolkaAndel(text: string): number {
  return Number(text.replace(",", "."));
}

/**
 * Plockar ut företagsnamnet ur texten före organisationsnumret.
 *
 * Spaltmellanrum och kolumnmellanrum är alltid två eller fler mellanslag, så
 * den sista klumpen före numret är namnet – oavsett hur mycket text från
 * grannspalten som råkat hamna först på raden.
 */
function namnFöreNumret(segment: string): string | null {
  const klumpar = segment
    .split(/\s{2,}/)
    .map((del) => del.trim())
    .filter(Boolean);

  const namn = klumpar.at(-1);
  if (!namn || namn.length < 2 || namn.length > 90) return null;
  if (RUBRIKORD.test(namn)) return null;
  if (!/\p{L}/u.test(namn)) return null;

  return namn;
}

type Läge = "dotter" | "intresse";

/** Rubriker byter läge. Nämner en rubrik både dotterbolag och intressebolag vinner dotterbolagen. */
function lägeFörRubrik(rad: string): Läge | null {
  if (/\d{6}-\d{4}/.test(rad)) return null;
  if (/dotter(bolag|företag)|koncernföretag|koncernbolag|group compan/i.test(rad))
    return "dotter";
  if (/intresse(bolag|företag)|joint venture|gemensamt styr/i.test(rad))
    return "intresse";
  return null;
}

function ärRubrik(rad: string): boolean {
  const rensad = rad.trim();
  return rensad.length > 0 && rensad.length < 120 && lägeFörRubrik(rensad) !== null;
}

function läsInnehav(text: string, mönster: RegExp): Array<Innehav & { läge: Läge }> {
  const ut: Array<Innehav & { läge: Läge }> = [];
  const sidor = text.split("\f");

  sidor.forEach((sidtext, index) => {
    // Läget nollställs per sida. En innehavstabell som fortsätter över ett
    // sidbrott har sällan med sig sin rubrik, och de flesta tabeller i den
    // här delen av en årsredovisning är dotterbolagstabeller.
    let läge: Läge = "dotter";
    let avsnitt: string | null = null;

    for (const rad of sidtext.split("\n")) {
      if (ärRubrik(rad)) {
        läge = lägeFörRubrik(rad.trim())!;
        avsnitt = rad.trim().replace(/\s{2,}/g, " ");
      }

      mönster.lastIndex = 0;
      let slut = 0;
      let träff: RegExpExecArray | null;

      while ((träff = mönster.exec(rad)) !== null) {
        const namn = namnFöreNumret(rad.slice(slut, träff.index));
        slut = träff.index + träff[0].length;

        const nummer = träff[1]!;
        ut.push({
          namn,
          organisationsnummer: svensktNummer(nummer) ? nummer.replace("-", "") : nummer,
          utländskt: !svensktNummer(nummer),
          säte: träff[2]!,
          kapitalandel: tolkaAndel(träff[3]!),
          sida: index + 1,
          avsnitt,
          läge,
        });
      }
    }
  });

  return ut;
}

/**
 * Letar upp företaget som årsredovisningen handlar om.
 *
 * Formuleringen är i praktiken alltid en variant av "Bolaget AcadeMedia AB
 * (publ), org nr 556846-0231". Det som skiljer moderföretagets nummer från
 * alla andra nummer i dokumentet är att det inte står i innehavsnoten, så
 * dotterbolagen sållas bort först.
 */
function hittaModerföretag(
  text: string,
  dotterbolag: ReadonlySet<string>,
): { namn: string | null; organisationsnummer: string } | null {
  // `\s` i namnet, inte bara mellanslag: sättningen bryter rad mitt i namnet
  // ("Magnora\nAktiebolag med organisationsnummer 556215-1133").
  const mönster =
    /([\p{Lu}][\p{L}\d&.'’\s-]{1,60}?)[ ,]*(?:\(publ\))?[ ,]*org(?:anisations)?\.?\s*n(?:umme)?r\.?\s*:?\s*(\d{6}-\d{4})/giu;

  /** Bindeord runt namnet hör till meningen, inte till firman. */
  const INLEDNING = /^(bolaget|moderbolaget|moderföretaget|företaget|koncernen)\s+/i;
  const AVSLUTNING = /\s+(med|och|som|är|har|i)$/i;

  for (const träff of text.matchAll(mönster)) {
    const nummer = träff[2]!.replace("-", "");
    if (dotterbolag.has(nummer)) continue;

    let namn = träff[1]!.replace(/\s+/g, " ").trim().replace(INLEDNING, "");
    while (AVSLUTNING.test(namn)) namn = namn.replace(AVSLUTNING, "");

    return { namn: namn.length >= 2 ? namn : null, organisationsnummer: nummer };
  }

  return null;
}

/** Tolkar textutdraget från en årsredovisning. Texten måste komma från `pdftotext -layout`. */
export function tolkaÅrsredovisning(
  rå: string,
  val: { minstaAndel?: number } = {},
): Årsredovisningsläsning {
  const { minstaAndel = MINSTA_ANDEL } = val;
  const text = normaliseraText(rå);
  const varningar: string[] = [];

  let rader = läsInnehav(text, INNEHAVSRAD);
  if (rader.length === 0) {
    rader = läsInnehav(text, INNEHAVSRAD_UTAN_PROCENT);
    if (rader.length > 0) {
      varningar.push(
        "Inga procenttecken hittades i innehavsnoten – andelarna lästes med ett lösare mönster. Stäm av mot pdf:en.",
      );
    }
  }

  // Samma bolag står ofta med i flera tabeller. Den högsta andelen får gälla.
  const bästa = new Map<string, Innehav & { läge: Läge }>();
  for (const rad of rader) {
    const nyckel = `${rad.läge}:${rad.organisationsnummer}`;
    const tidigare = bästa.get(nyckel);
    if (!tidigare || rad.kapitalandel > tidigare.kapitalandel) bästa.set(nyckel, rad);
  }

  const alla = [...bästa.values()].sort((a, b) =>
    (a.namn ?? "").localeCompare(b.namn ?? "", "sv"),
  );
  const dotterföretag = alla.filter(
    (r) => r.läge === "dotter" && r.kapitalandel >= minstaAndel,
  );
  const intresseföretag = alla.filter((r) => r.läge === "intresse");
  const minoritetsposter = alla.filter(
    (r) => r.läge === "dotter" && r.kapitalandel < minstaAndel,
  );

  const utanNamn = dotterföretag.filter((r) => !r.namn).length;
  if (utanNamn > 0) {
    varningar.push(
      `${utanNamn} rader fick inget namn – organisationsnumret finns kvar och går att slå upp.`,
    );
  }
  if (dotterföretag.length === 0) {
    varningar.push(
      "Ingen dotterföretagsnot hittades. Kontrollera att pdf:en är den fullständiga årsredovisningen och inte enbart en bokslutskommuniké.",
    );
  }

  const nummer = new Set(alla.map((r) => r.organisationsnummer));

  return {
    moderföretag: hittaModerföretag(text, nummer),
    dotterföretag: dotterföretag.map(tillInnehav),
    intresseföretag: intresseföretag.map(tillInnehav),
    minoritetsposter: minoritetsposter.map(tillInnehav),
    sidor: text.split("\f").length,
    varningar,
  };
}

function tillInnehav(rad: Innehav & { läge: Läge }): Innehav {
  const { läge: _läge, ...rest } = rad;
  return rest;
}

/** Läser en årsredovisning från disk. Både .pdf och en färdig .txt går bra. */
export async function läsÅrsredovisning(
  sökväg: string,
  val: { minstaAndel?: number } = {},
): Promise<Årsredovisningsläsning> {
  const text = sökväg.toLowerCase().endsWith(".pdf")
    ? await textUrPdf(sökväg)
    : await readFile(sökväg, "utf8");

  return tolkaÅrsredovisning(text, val);
}

/**
 * Gör om en läsning till ett koncernbesked, så att pdf:en kan läggas i samma
 * lager som de digitala årsredovisningarna.
 *
 * Noten räknar upp både direkt och indirekt ägda bolag utan att alltid skilja
 * dem åt. Kanterna blir därför platta: alla dotterbolag hängs direkt under
 * moderföretaget. För koncerntillhörighet spelar det ingen roll – rätt bolag
 * hamnar i rätt koncern – och mellannivåerna fylls i av de digitala
 * årsredovisningarna där sådana finns, eftersom en uppåtriktad kant från ett
 * dotterbolag alltid vinner över den platta kanten härifrån.
 */
export function tillKoncernbeskedFrånPdf(
  läsning: Årsredovisningsläsning,
  val: { organisationsnummer?: string; namn?: string; räkenskapsårTom?: string } = {},
): Koncernbesked {
  const organisationsnummer = (
    val.organisationsnummer ??
    läsning.moderföretag?.organisationsnummer ??
    ""
  ).replace(/\D/g, "");
  if (!organisationsnummer) {
    throw new Error(
      "Moderföretagets organisationsnummer gick inte att läsa ur pdf:en. Ange det med --orgnr.",
    );
  }

  const dotterföretag: Dotterföretag[] = läsning.dotterföretag.map((d) => ({
    namn: d.namn,
    organisationsnummer: d.organisationsnummer,
    utländskt: d.utländskt,
    kapitalandel: d.kapitalandel,
  }));

  return {
    organisationsnummer,
    namn: val.namn ?? läsning.moderföretag?.namn ?? null,
    juridiskForm: null,
    verksam: null,
    koncern: dotterföretag.length > 0 ? "ja" : "okänt",
    roll: dotterföretag.length > 0 ? "moderföretag" : null,
    moderföretag: null,
    yttersta: null,
    dotterföretag,
    grunder:
      dotterföretag.length > 0
        ? [`Årsredovisning i pdf: noten räknar upp ${dotterföretag.length} dotterföretag`]
        : ["Årsredovisning i pdf: ingen dotterföretagsnot hittades"],
    räkenskapsårTom: val.räkenskapsårTom ?? null,
    årsredovisningar: [],
  };
}

/**
 * Läser en årsredovisning och lägger in den i koncernlagret.
 *
 * Beskedet sparas med källan `pdf`, vilket gör det tåligt: nästa nattliga
 * körning mot Bolagsverket får komplettera det med moderföretag och
 * räkenskapsår, men kan inte ersätta dotterbolagsförteckningen med sitt eget
 * magrare svar. Bara en manuell rättelse går före.
 */
export async function läggInÅrsredovisning(val: {
  fil: string;
  lagerfil?: string;
  organisationsnummer?: string;
  namn?: string;
  räkenskapsårTom?: string;
  minstaAndel?: number;
}): Promise<{ läsning: Årsredovisningsläsning; besked: Koncernbesked }> {
  const { fil, lagerfil = "data/koncern-lager.json", minstaAndel } = val;

  const läsning = await läsÅrsredovisning(fil, { minstaAndel });
  const besked = tillKoncernbeskedFrånPdf(läsning, val);

  const lager = await öppnaLager(lagerfil);
  const tidigare = lager.hämta(besked.organisationsnummer);
  lager.spara(
    besked.organisationsnummer,
    slåIhop(tidigare, besked, new Date().toISOString(), "pdf"),
  );
  await lager.skrivTillDisk();

  return { läsning, besked };
}

const ARSREDOVISNINGSMAPP = "data/arsredovisningar";

/** Hämtar en pdf-länk till disk, så att den går att jämföra med det som lästes. */
async function hämtaTillDisk(url: string): Promise<string> {
  const svar = await fetch(url);
  if (!svar.ok)
    throw new Error(`Kunde inte hämta ${url}: ${svar.status} ${svar.statusText}`);

  const filnamn = basename(new URL(url).pathname) || "arsredovisning.pdf";
  const sökväg = `${ARSREDOVISNINGSMAPP}/${filnamn}`;

  await mkdir(ARSREDOVISNINGSMAPP, { recursive: true });
  await writeFile(sökväg, Buffer.from(await svar.arrayBuffer()));

  return sökväg;
}

function visaLäsning(läsning: Årsredovisningsläsning, sökväg: string): void {
  console.log(`Årsredovisning: ${sökväg}  (${läsning.sidor} sidor)`);
  console.log(
    `Moderföretag:   ${läsning.moderföretag?.namn ?? "(okänt)"}  ${läsning.moderföretag?.organisationsnummer ?? ""}`,
  );

  console.log(`\nDotterföretag (${läsning.dotterföretag.length}):`);
  läsning.dotterföretag.forEach((d, i) => {
    const namn = (d.namn ?? "(namn saknas)").padEnd(38);
    const nummer = d.organisationsnummer.padEnd(13);
    console.log(
      `  ${String(i + 1).padStart(3)}. ${namn} ${nummer} ${d.säte ?? ""}  ${d.kapitalandel}%  s.${d.sida}`,
    );
  });

  if (läsning.minoritetsposter.length > 0) {
    console.log(`\nMinoritetsposter, utelämnade (${läsning.minoritetsposter.length}):`);
    for (const m of läsning.minoritetsposter)
      console.log(`  ${m.namn ?? m.organisationsnummer}  ${m.kapitalandel}%`);
  }

  if (läsning.varningar.length > 0) {
    console.log("\nVarningar:");
    for (const v of läsning.varningar) console.log(`  ${v}`);
  }
}

async function körLasArsredovisning(argv: readonly string[]): Promise<void> {
  const flaggor: Record<string, string | true> = {};
  const positionella: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      positionella.push(arg);
      continue;
    }
    const nyckel = arg.slice(2);
    const nästa = argv[i + 1];
    if (nästa && !nästa.startsWith("--")) {
      flaggor[nyckel] = nästa;
      i++;
    } else {
      flaggor[nyckel] = true;
    }
  }

  const källa = positionella[0];
  if (!källa) {
    throw new Error(
      "Ange en pdf-fil, .txt-fil eller länk att läsa, t.ex. `bun run koncern las-arsredovisning fil.pdf`.",
    );
  }

  const orgnr = typeof flaggor.orgnr === "string" ? flaggor.orgnr : undefined;
  const namn = typeof flaggor.namn === "string" ? flaggor.namn : undefined;
  const tom = typeof flaggor.tom === "string" ? flaggor.tom : undefined;
  const minst = typeof flaggor.minst === "string" ? Number(flaggor.minst) : undefined;
  const skriv = flaggor.skriv === true;
  const json = flaggor.json === true;

  const sökväg = källa.startsWith("http") ? await hämtaTillDisk(källa) : källa;
  const läsning = await läsÅrsredovisning(sökväg, { minstaAndel: minst });

  if (json) {
    console.log(JSON.stringify(läsning, null, 2));
  } else {
    visaLäsning(läsning, sökväg);
  }

  if (!skriv) {
    console.log(
      "\nInget sparat. Kör med --skriv för att lägga in i data/koncern-lager.json.",
    );
    return;
  }

  const { besked } = await läggInÅrsredovisning({
    fil: sökväg,
    organisationsnummer: orgnr,
    namn,
    räkenskapsårTom: tom,
    minstaAndel: minst,
  });
  console.log(
    `\nSparad: ${besked.namn ?? besked.organisationsnummer} i data/koncern-lager.json.`,
  );
  console.log(
    "Kör `bun run koncern bygg` för att låta Bolagsverket följa upp de nya kanterna.",
  );
}

// ════════════════════════════════════════════════════════════════════════
// Import från skolkoll.se: bun run koncern importera-skolkoll
//
// De egna vägarna (Bolagsverkets iXBRL, koncernens egna pdf:er) täcker inte
// alla fristående huvudmän – de flesta har inte lämnat in digitalt, och ingen
// bekväm pdf finns för alla. skolkoll.se har redan gjort det arbetet för sitt
// eget bruk och lägger uppslagstabellen öppet på
// https://skolkoll.se/data/koncern-lookup.json.
//
// DEN ÄR INTE EN PRIMÄRKÄLLA
// ---------------------------
// Ungefär hälften av posterna kommer från ett skikt som skolkoll själva döpt
// till `previous_lookup` – en tabell som importerats, inte härletts ur en
// årsredovisning, och som kan vara föråldrad. Det här visade sig stämma redan
// vid första importen: skolkoll räknar Skolgrunden AB (556558-8166) till Lilla
// Park och Min Skola AB, medan Cedergrenska AB:s egen årsredovisning för
// 2024/25 räknar upp samma bolag som sin egen kommissionär. skolkolls egen
// `_reconciliation`-logg bekräftar drivet: 14 av Lilla Parks 16 tidigare
// medlemmar är "backfilledMemberCount", återskapade ur en uppgift som inte
// längre går att hitta live.
//
// DÄRFÖR: BARA LUCKOR FYLLS
// --------------------------
// Skriver ALDRIG över ett svar vi redan har – varken ett "ja" eller ett "nej",
// oavsett var det kom ifrån. Bara organisationsnummer där vi i dag har "okänt"
// eller ingen post alls fylls i. Där skolkoll säger emot vad vi redan vet
// listas det som en konflikt och hoppas alltid över, oavsett flaggor.
// ════════════════════════════════════════════════════════════════════════

const SKOLKOLL_URL = "https://skolkoll.se/data/koncern-lookup.json";

export type SkolkollPost = {
  koncernOrgNr: string;
  koncernName: string | null;
  name: string | null;
  ownership: number | null;
  path: string[];
  sourceLayer: string | null;
};

type SkolkollFil = { lookup: Record<string, SkolkollPost> };

/** Hämtar skolkolls uppslagstabell. Kastar om formatet inte längre stämmer. */
export async function hämtaSkolkollLookup(
  url: string = SKOLKOLL_URL,
): Promise<Record<string, SkolkollPost>> {
  const svar = await fetch(url);
  if (!svar.ok) throw new Error(`skolkoll svarade ${svar.status} ${svar.statusText}`);

  const data = (await svar.json()) as Partial<SkolkollFil>;
  if (!data.lookup)
    throw new Error(
      "Väntad nyckel 'lookup' saknas i svaret från skolkoll – har formatet ändrats?",
    );

  return data.lookup;
}

function svensktFormat(nummer: string): boolean {
  return /^\d{10}$/.test(nummer);
}

/** Gör en skolkoll-post till ett koncernbesked med bara den uppåtriktade kanten. */
export function tillKoncernbeskedFrånSkolkoll(
  organisationsnummer: string,
  post: SkolkollPost,
): Koncernbesked {
  const andel = post.ownership != null ? `, ägarandel ${post.ownership}%` : "";

  return {
    organisationsnummer: organisationsnummer.replace(/\D/g, ""),
    namn: post.name ?? null,
    juridiskForm: null,
    verksam: null,
    koncern: "ja",
    roll: "ingår i koncern",
    moderföretag: {
      namn: post.koncernName,
      organisationsnummer: post.koncernOrgNr,
      utländskt: !svensktFormat(post.koncernOrgNr),
      säte: null,
    },
    yttersta: null,
    dotterföretag: [],
    grunder: [
      `Importerad från skolkoll.se (${post.sourceLayer ?? "okänt källskikt"}${andel}). Tredjepartskälla, inte primärkälla.`,
    ],
    räkenskapsårTom: null,
    årsredovisningar: [],
  };
}

export type Jämförelse = {
  organisationsnummer: string;
  skolkoll: SkolkollPost;
  kategori: "ny" | "konflikt" | "har_redan";
  /** Bara satt för `konflikt`: vad vi redan visste, och varför det står emot. */
  orsak?: string;
};

/**
 * Ställer skolkolls uppslag mot det vi redan har, utan att skriva något.
 *
 * Jämförelsen görs mot den lösta koncernroten, inte mot den direkta föräldern.
 * Ett bolag i Dibber-kedjan kan hos oss peka på Dibber Sverige AB och hos
 * skolkoll direkt på DIBBER AS – samma koncern, bara olika djup i kedjan. En
 * jämförelse mot bara den direkta föräldern skulle se det som en konflikt när
 * det egentligen är samma svar. `byggKoncerngraf` har redan följt kedjan hela
 * vägen upp, så det är den lösningen som ska jämföras.
 *
 * Rotens egen post (`organisationsnummer === koncernOrgNr`) hoppas alltid över
 * – den har ingen förälder att peka på, bara sig själv.
 */
export function jämförSkolkoll(
  lookup: Record<string, SkolkollPost>,
  lager: ReadonlyMap<string, Lagerpost>,
  graf: ReadonlyMap<string, Koncernpost>,
): Jämförelse[] {
  const ut: Jämförelse[] = [];

  for (const [organisationsnummer, post] of Object.entries(lookup)) {
    if (!post.koncernOrgNr || organisationsnummer === post.koncernOrgNr) continue;

    const tidigare = lager.get(organisationsnummer);

    if (!tidigare || tidigare.besked.koncern === "okänt") {
      ut.push({ organisationsnummer, skolkoll: post, kategori: "ny" });
      continue;
    }

    // Utan egen post i grafen (t.ex. ett bolag med koncern "nej" och inga
    // kanter) är den lösta roten bolaget självt – vilket redan är rätt
    // jämförelsepunkt, eftersom det då per definition skiljer sig från
    // skolkolls rot så fort skolkoll hävdar en koncern.
    const löst = graf.get(organisationsnummer);
    const resolveradRot = löst?.koncernOrgNr ?? organisationsnummer;

    if (resolveradRot !== post.koncernOrgNr) {
      const vårt =
        löst?.koncernNamn ??
        (tidigare.besked.koncern === "nej" ? "(ingen koncern)" : resolveradRot);
      ut.push({
        organisationsnummer,
        skolkoll: post,
        kategori: "konflikt",
        orsak: `${tidigare.källa} (${tidigare.besked.koncern}) → ${vårt}, skolkoll → ${post.koncernName ?? post.koncernOrgNr}`,
      });
      continue;
    }

    ut.push({ organisationsnummer, skolkoll: post, kategori: "har_redan" });
  }

  return ut;
}

export type Importresultat = {
  jämförelser: Jämförelse[];
  importerade: number;
};

/**
 * Fyller i luckor i lagret från skolkoll.
 *
 * Skriver bara kategorin `ny`. `konflikt` och `har_redan` lämnas orörda oavsett
 * `skriv` – konflikter för att ett tyst fel är värre än en lucka, och
 * `har_redan` för att det inte finns något att vinna på att skriva om samma sak.
 */
export async function importeraSkolkoll(val: {
  url?: string;
  lagerfil?: string;
  skriv?: boolean;
}): Promise<Importresultat> {
  const { url, lagerfil = "data/koncern-lager.json", skriv = false } = val;

  const lookup = await hämtaSkolkollLookup(url);
  const lager = await öppnaLager(lagerfil);
  const { lookup: graf } = byggKoncerngraf(lager);
  const jämförelser = jämförSkolkoll(lookup, lager.alla(), graf);

  let importerade = 0;
  if (skriv) {
    const nu = new Date().toISOString();
    for (const j of jämförelser) {
      if (j.kategori !== "ny") continue;
      const besked = tillKoncernbeskedFrånSkolkoll(j.organisationsnummer, j.skolkoll);
      const tidigare = lager.hämta(j.organisationsnummer);
      lager.spara(j.organisationsnummer, slåIhop(tidigare, besked, nu, "skolkoll"));
      importerade++;
    }
    await lager.skrivTillDisk();
  }

  return { jämförelser, importerade };
}

async function körImporteraSkolkoll(argv: readonly string[]): Promise<void> {
  const flaggor: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;
    const nyckel = arg.slice(2);
    const nästa = argv[i + 1];
    if (nästa && !nästa.startsWith("--")) {
      flaggor[nyckel] = nästa;
      i++;
    } else {
      flaggor[nyckel] = true;
    }
  }

  const url = typeof flaggor.url === "string" ? flaggor.url : undefined;
  const lagerfil = typeof flaggor.lagerfil === "string" ? flaggor.lagerfil : undefined;
  const skriv = flaggor.skriv === true;
  const visaKonflikter = flaggor["visa-konflikter"] === true;

  console.log("Hämtar https://skolkoll.se/data/koncern-lookup.json …");
  const { jämförelser, importerade } = await importeraSkolkoll({ url, lagerfil, skriv });

  const per = { ny: 0, konflikt: 0, har_redan: 0 };
  for (const j of jämförelser) per[j.kategori]++;

  console.log(
    `\nJämfört mot vårt lager: ${jämförelser.length} organisationsnummer hos skolkoll som pekar på en koncern\n`,
  );
  console.log(
    `  ${String(per.ny).padStart(4)}  okända hos oss${skriv ? ` – ${importerade} skrivna` : " – skulle fyllas i med --skriv"}`,
  );
  console.log(
    `  ${String(per.har_redan).padStart(4)}  bekräftar det vi redan visste, inget att skriva`,
  );
  console.log(
    `  ${String(per.konflikt).padStart(4)}  säger emot det vi redan vet – hoppas alltid över`,
  );

  const konflikter = jämförelser.filter((j) => j.kategori === "konflikt");
  if (konflikter.length > 0 && visaKonflikter) {
    console.log("\nKonflikter:");
    for (const k of konflikter) console.log(`  ${k.organisationsnummer}  ${k.orsak}`);
  } else if (konflikter.length > 0) {
    console.log("\nKör med --visa-konflikter för att se detaljerna.");
  }

  if (!skriv) {
    console.log("\nInget sparat. Kör med --skriv för att fylla i luckorna.");
  } else {
    console.log(
      "\nKör `bun run koncern bygg` för att låta Bolagsverket följa upp de nya kanterna.",
    );
  }
}

// ════════════════════════════════════════════════════════════════════════
// Kommandot
// ════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const [kommando, ...argv] = process.argv.slice(2);

  switch (kommando) {
    case "bygg":
      return körBygg();
    case "las-arsredovisning":
      return körLasArsredovisning(argv);
    case "importera-skolkoll":
      return körImporteraSkolkoll(argv);
    default:
      console.error(
        "Ange ett kommando: `bun run koncern bygg`, `bun run koncern las-arsredovisning <fil>` " +
          "eller `bun run koncern importera-skolkoll`.",
      );
      process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((fel) => {
    console.error("\nNågot gick fel:", fel instanceof Error ? fel.message : fel);
    process.exit(1);
  });
}
