// Klient mot Bolagsverkets API för värdefulla datamängder, med koncernkontroll.
//
// HUR KONCERNBESKEDET TAS FRAM
// ----------------------------
// API:et självt redovisar inte koncerntillhörighet – hela specen nämner varken
// koncern, moderföretag eller dotterföretag. Svaret hämtas i stället ur
// företagets digitala årsredovisning, som API:et lämnar ut som ett zip-arkiv
// med iXBRL. Där finns uppgifterna taggade:
//
//   se-gaap-ext:UppgiftModerforetagTuple          moderföretaget, strukturerat
//   se-gaap-ext:UppgiftNarmasteModerforetagTuple  närmaste moderföretaget
//   se-gen-base:NotUpplysningModerforetagKommentar  samma sak, som fritext
//   se-gen-base:ModerforetagTypList               företaget uppger ett moderföretag
//   se-gen-base:*Koncernforetag*                  fordringar/skulder inom koncernen
//   se-gen-base:*Koncernbidrag                    koncernbidrag
//
// Bedömningen görs på XBRL-taggarna, aldrig på löptext: varje K3-årsredovisning
// innehåller frasen "Årsredovisning och koncernredovisning (K3)" – det är
// regelverkets namn och säger ingenting om koncerntillhörighet.
//
// BEGRÄNSNINGAR
// -------------
// Bara företag som lämnat in årsredovisning digitalt går att bedöma. Av 1 040
// fristående skolhuvudmän hade 42 en digital årsredovisning i registret –
// resten har lämnat in på papper och får svaret "okänt".
//
// API:et har en kvot som ger 429 "Message throttled out" vid många anrop i följd,
// och den släpper först efter en halv minut. Anropen görs därför ett i taget med
// lång paus vid 429 – kör inte det här parallellt över tusentals företag.

// ════════════════════════════════════════════════════════════════════════
// Inställningar
// ════════════════════════════════════════════════════════════════════════

import { inflateRawSync } from "node:zlib";

/**
 * Nycklarna läses ur miljön och finns inte i koden – de hör inte hemma i ett
 * versionshanterat repo. Lägg dem i `.env.local`, som bun läser automatiskt.
 * Se `.env.example`.
 *
 * Kontrollen görs i `hämtaToken()`, inte här: `export.ts` importerar den här
 * modulen via `koncern.ts` utan att någonsin ringa Bolagsverket, och
 * `bun run export` ska fungera utan nycklar.
 */
function läsNyckel(namn: string): string {
  const värde = process.env[namn];
  if (!värde) {
    throw new Error(
      `${namn} saknas. Bolagsverkets API kräver nyckel – sätt ` +
        `BOLAGSVERKET_KLIENT_ID och BOLAGSVERKET_HEMLIGHET i .env.local. Se .env.example.`,
    );
  }
  return värde;
}

/** Nycklarna gäller produktion. Acceptansmiljöns nycklar är andra. */
export type Miljö = "test" | "produktion";

const MILJÖER: Record<Miljö, { token: string; api: string }> = {
  test: {
    token: "https://portal-accept2.api.bolagsverket.se/oauth2/token",
    api: "https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1",
  },
  produktion: {
    token: "https://portal.api.bolagsverket.se/oauth2/token",
    api: "https://gw.api.bolagsverket.se/vardefulla-datamangder/v1",
  },
};

const MILJÖ: Miljö = (process.env.BOLAGSVERKET_MILJÖ as Miljö) ?? "produktion";

/** Läsbehörighet. (`:ping` finns också, men gäller bara /isalive.) */
const SCOPE = "vardefulla-datamangder:read";

const TIDSGRÄNS_MS = 20_000;
const ANTAL_OMFÖRSÖK = 3;

// ════════════════════════════════════════════════════════════════════════
// Åtkomsttoken
// ════════════════════════════════════════════════════════════════════════

type Tokensvar = { access_token: string; expires_in: number; token_type: string };

let gällandeToken: { värde: string; giltigTill: number } | null = null;

/**
 * Hämtar ett åtkomsttoken och återanvänder det tills det går ut.
 *
 * Tokenet lever en timme. Att begära ett nytt inför varje anrop skulle
 * dubbla antalet anrop mot Bolagsverket helt i onödan – därför sparas det
 * i minnet, med en marginal på 60 sekunder före utgång.
 */
export async function hämtaToken(): Promise<string> {
  if (gällandeToken && Date.now() < gällandeToken.giltigTill) return gällandeToken.värde;

  const svar = await fetch(MILJÖER[MILJÖ].token, {
    method: "POST",
    signal: AbortSignal.timeout(TIDSGRÄNS_MS),
    headers: {
      Authorization: `Basic ${btoa(
        `${läsNyckel("BOLAGSVERKET_KLIENT_ID")}:${läsNyckel("BOLAGSVERKET_HEMLIGHET")}`,
      )}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE }),
  });

  if (!svar.ok) {
    throw new Error(
      `Kunde inte hämta token från Bolagsverket (${svar.status}): ${await svar.text()}`,
    );
  }

  const data = (await svar.json()) as Tokensvar;
  gällandeToken = {
    värde: data.access_token,
    giltigTill: Date.now() + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

// ════════════════════════════════════════════════════════════════════════
// Nätverkslager
// ════════════════════════════════════════════════════════════════════════

const vänta = (ms: number) => new Promise((klar) => setTimeout(klar, ms));

/**
 * Hur länge vi väntar innan nästa försök.
 *
 * Bolagsverket har en kvot som ger 429 "Message throttled out". Den återställs
 * inte på någon sekund – mätt tar det omkring en halv minut – så en 429 pausar
 * betydligt längre än ett vanligt serverfel.
 */
function paus(svar: Response, försök: number): number {
  const huvud = Number(svar.headers.get("retry-after"));
  if (Number.isFinite(huvud) && huvud > 0) return huvud * 1000;
  const bas = svar.status === 429 ? 8_000 : 500;
  return bas * 2 ** försök + Math.random() * 250;
}

/** Bolagsverkets felsvar följer problem+json. */
type ApiFel = { status: number; title: string; detail: string; requestId?: string };

export class BolagsverketFel extends Error {
  constructor(
    readonly status: number,
    readonly detalj: string,
    readonly requestId?: string,
  ) {
    super(`Bolagsverket svarade ${status}: ${detalj}`);
    this.name = "BolagsverketFel";
  }
}

async function anropa<T>(sökväg: string, kropp?: unknown): Promise<T | null> {
  let senasteFel: unknown = null;

  for (let försök = 0; försök <= ANTAL_OMFÖRSÖK; försök++) {
    try {
      const token = await hämtaToken();
      const svar = await fetch(`${MILJÖER[MILJÖ].api}${sökväg}`, {
        method: kropp ? "POST" : "GET",
        signal: AbortSignal.timeout(TIDSGRÄNS_MS),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(kropp ? { "Content-Type": "application/json" } : {}),
        },
        body: kropp ? JSON.stringify(kropp) : undefined,
      });

      // Företaget finns inte – inget fel, bara inget svar.
      if (svar.status === 404) return null;

      // Tokenet kan ha återkallats i förtid. Släng det och försök igen.
      if (svar.status === 401 && försök < ANTAL_OMFÖRSÖK) {
        gällandeToken = null;
        continue;
      }

      if (svar.status === 429 || svar.status >= 500) {
        await vänta(paus(svar, försök));
        continue;
      }

      if (!svar.ok) {
        const fel = (await svar.json().catch(() => null)) as ApiFel | null;
        throw new BolagsverketFel(
          svar.status,
          fel?.detail ?? svar.statusText,
          fel?.requestId,
        );
      }

      return (await svar.json()) as T;
    } catch (fel) {
      // Felaktig indata ska inte försökas om – svaret blir detsamma.
      if (fel instanceof BolagsverketFel) throw fel;
      senasteFel = fel;
      if (försök < ANTAL_OMFÖRSÖK) await vänta(500 * 2 ** försök + Math.random() * 250);
    }
  }

  throw new Error(`Kunde inte nå Bolagsverket (${sökväg}): ${senasteFel}`);
}

// ════════════════════════════════════════════════════════════════════════
// Svarsformat (enligt swagger-2.json)
// ════════════════════════════════════════════════════════════════════════

type KodKlartext = { kod?: string; klartext?: string };
type Fält<T> = T & {
  dataproducent?: string;
  fel?: { typ: string; felBeskrivning: string };
};

export type Organisation = {
  organisationsidentitet?: { identitetsbeteckning?: string; typ?: KodKlartext };
  namnskyddslopnummer?: number;
  organisationsnamn?: Fält<{
    organisationsnamnLista?: Array<{
      namn?: string;
      organisationsnamntyp?: KodKlartext;
      registreringsdatum?: string;
      verksamhetsbeskrivningSarskiltForetagsnamn?: string;
    }>;
  }>;
  registreringsland?: KodKlartext;
  organisationsform?: Fält<KodKlartext>;
  juridiskForm?: Fält<KodKlartext>;
  verksamOrganisation?: Fält<{ kod?: "JA" | "NEJ" }>;
  avregistreradOrganisation?: Fält<{ avregistreringsdatum?: string }>;
  avregistreringsorsak?: Fält<KodKlartext>;
  pagaendeAvvecklingsEllerOmstruktureringsforfarande?: Fält<{
    pagaendeAvvecklingsEllerOmstruktureringsforfarandeLista?: Array<
      KodKlartext & { fromDatum?: string }
    >;
  }>;
  organisationsdatum?: Fält<{ registreringsdatum?: string; infortHosScb?: string }>;
  verksamhetsbeskrivning?: Fält<{ beskrivning?: string }>;
  naringsgrenOrganisation?: Fält<{ sni?: Array<KodKlartext> }>;
  postadressOrganisation?: Fält<{
    postadress?: {
      coAdress?: string;
      utdelningsadress?: string;
      postnummer?: string;
      postort?: string;
      land?: string;
    };
  }>;
};

export type Årsredovisning = {
  dokumentId?: string;
  filformat?: string;
  rapporteringsperiodTom?: string;
  registreringstidpunkt?: string;
};

// ════════════════════════════════════════════════════════════════════════
// Operationer
// ════════════════════════════════════════════════════════════════════════

/**
 * Uppgifter om ett företag. `null` om organisationsnumret inte finns.
 *
 * Observera att testmiljön bara känner igen sina egna testföretag – riktiga
 * organisationsnummer ger BolagsverketFel med status 400.
 */
export async function hämtaOrganisation(
  organisationsnummer: string,
): Promise<Organisation | null> {
  const svar = await anropa<{ organisationer?: Organisation[] }>("/organisationer", {
    identitetsbeteckning: rensaOrganisationsnummer(organisationsnummer),
  });
  return svar?.organisationer?.[0] ?? null;
}

/** Företagets inlämnade årsredovisningar, nyaste först. */
export async function hämtaÅrsredovisningar(
  organisationsnummer: string,
): Promise<Årsredovisning[]> {
  const svar = await anropa<{ dokument?: Årsredovisning[] }>("/dokumentlista", {
    identitetsbeteckning: rensaOrganisationsnummer(organisationsnummer),
  });
  const dokument = svar?.dokument ?? [];
  return [...dokument].sort((a, b) =>
    (b.rapporteringsperiodTom ?? "").localeCompare(a.rapporteringsperiodTom ?? ""),
  );
}

/**
 * En årsredovisning som zip-arkiv (iXBRL). Returneras rå – innehållet måste
 * packas upp och tolkas av anroparen.
 */
export async function hämtaÅrsredovisning(
  dokumentId: string,
): Promise<ArrayBuffer | null> {
  let senasteFel: unknown = null;

  for (let försök = 0; försök <= ANTAL_OMFÖRSÖK; försök++) {
    try {
      const token = await hämtaToken();
      const svar = await fetch(
        `${MILJÖER[MILJÖ].api}/dokument/${encodeURIComponent(dokumentId)}`,
        {
          signal: AbortSignal.timeout(TIDSGRÄNS_MS),
          headers: { Authorization: `Bearer ${token}`, Accept: "application/zip" },
        },
      );

      if (svar.status === 404) return null;

      if (svar.status === 401 && försök < ANTAL_OMFÖRSÖK) {
        gällandeToken = null;
        continue;
      }

      if ((svar.status === 429 || svar.status >= 500) && försök < ANTAL_OMFÖRSÖK) {
        await vänta(paus(svar, försök));
        continue;
      }

      if (!svar.ok)
        throw new BolagsverketFel(svar.status, (await svar.text()).slice(0, 200));

      return await svar.arrayBuffer();
    } catch (fel) {
      if (fel instanceof BolagsverketFel) throw fel;
      senasteFel = fel;
      if (försök < ANTAL_OMFÖRSÖK) await vänta(500 * 2 ** försök);
    }
  }

  throw new Error(`Kunde inte hämta dokument ${dokumentId}: ${senasteFel}`);
}

/** Bolagsverket vill ha tio siffror utan bindestreck. */
function rensaOrganisationsnummer(nummer: string): string {
  return nummer.replace(/\D/g, "").replace(/^16(?=\d{10}$)/, "");
}

/**
 * Ett organisationsnummer som kan vara utländskt.
 *
 * Koncerntoppen ligger inte alltid i Sverige – Dibber-koncernen toppas av
 * norska DIBBER AS med nummer 998831067, nio siffror. Bara svenska nummer
 * normaliseras; utländska sparas som de står, eftersom formatet varierar.
 */
export type Identitet = { nummer: string; svenskt: boolean };

const SVENSKT_NUMMER = /(?<!\d)(\d{6}-?\d{4})(?!\d)/;
const UTLÄNDSKT_NUMMER = /(?<![\d-])(\d{8,11})(?![\d-])/;

function tolkaIdentitet(text: string): Identitet | null {
  const svenskt = SVENSKT_NUMMER.exec(text);
  if (svenskt) return { nummer: rensaOrganisationsnummer(svenskt[1]!), svenskt: true };

  const utländskt = UTLÄNDSKT_NUMMER.exec(text);
  if (utländskt) return { nummer: utländskt[1]!, svenskt: false };

  return null;
}

// ════════════════════════════════════════════════════════════════════════
// Zip
// ════════════════════════════════════════════════════════════════════════

/**
 * Packar upp ett zip-arkiv i minnet.
 *
 * Årsredovisningspaketen är små (~150 kB) och innehåller ett par XHTML-filer,
 * så en minimal läsare räcker: central directory → lokal header → inflate.
 */
function packaUppZip(data: Uint8Array): Map<string, Uint8Array> {
  const vy = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Slutposten ligger sist, men kan följas av en kommentar på upp till 64 kB.
  let slut = -1;
  for (let i = data.length - 22; i >= 0 && i > data.length - 66_000; i--) {
    if (vy.getUint32(i, true) === 0x06054b50) {
      slut = i;
      break;
    }
  }
  if (slut < 0) throw new Error("Filen är inte ett zip-arkiv");

  const antal = vy.getUint16(slut + 10, true);
  let post = vy.getUint32(slut + 16, true);
  const filer = new Map<string, Uint8Array>();

  for (let n = 0; n < antal; n++) {
    if (vy.getUint32(post, true) !== 0x02014b50) throw new Error("Trasig zip-katalog");

    const metod = vy.getUint16(post + 10, true);
    const komprimeradStorlek = vy.getUint32(post + 20, true);
    const namnLängd = vy.getUint16(post + 28, true);
    const extraLängd = vy.getUint16(post + 30, true);
    const kommentarLängd = vy.getUint16(post + 32, true);
    const lokalOffset = vy.getUint32(post + 42, true);
    const namn = new TextDecoder().decode(
      data.subarray(post + 46, post + 46 + namnLängd),
    );

    // Den lokala headern har egna längder för namn och extrafält, och de
    // behöver inte stämma med katalogens – därför läses de om här.
    const lokaltNamn = vy.getUint16(lokalOffset + 26, true);
    const lokaltExtra = vy.getUint16(lokalOffset + 28, true);
    const start = lokalOffset + 30 + lokaltNamn + lokaltExtra;
    const rå = data.subarray(start, start + komprimeradStorlek);

    filer.set(namn, metod === 0 ? rå : new Uint8Array(inflateRawSync(rå)));
    post += 46 + namnLängd + extraLängd + kommentarLängd;
  }

  return filer;
}

// ════════════════════════════════════════════════════════════════════════
// iXBRL
// ════════════════════════════════════════════════════════════════════════

export type Faktum = {
  namn: string;
  värde: string;
  kontext: string | null;
  /** Kopplar faktumet till en ix:tuple, t.ex. uppgifterna om moderföretaget. */
  tupel: string | null;
};

/**
 * Läser innehållet i ett element, med hänsyn till att samma elementtyp kan
 * vara nästlad. En icke-girig regex skulle kapa värdet vid första inre taggen.
 */
function läsInnehåll(
  xhtml: string,
  tagg: string,
  från: number,
): { text: string; slut: number } {
  const nivå = new RegExp(`<(/?)ix:${tagg}\\b`, "g");
  nivå.lastIndex = från;
  let djup = 1;

  for (let steg = nivå.exec(xhtml); steg; steg = nivå.exec(xhtml)) {
    djup += steg[1] ? -1 : 1;
    if (djup === 0) return { text: xhtml.slice(från, steg.index), slut: steg.index };
  }
  return { text: xhtml.slice(från), slut: xhtml.length };
}

const rensaText = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Plockar ut de taggade fakta ur en iXBRL-fil.
 *
 * Långa värden delas upp i `ix:continuation`-element – "Ursa Callis Holding AB"
 * ligger som "Ursa" plus en fortsättning – så fortsättningskedjan följs och
 * sätts ihop igen. Utan det blir moderföretagets namn avhugget.
 */
export function läsFakta(xhtml: string): Faktum[] {
  // Fortsättningar först, så att de kan slås upp när fakta läses.
  const fortsättningar = new Map<string, { text: string; nästa: string | null }>();
  const fortsättning = /<ix:continuation\b([^>]*)>/g;
  for (let träff = fortsättning.exec(xhtml); träff; träff = fortsättning.exec(xhtml)) {
    const id = /id="([^"]+)"/.exec(träff[1]!)?.[1];
    if (!id) continue;
    const { text } = läsInnehåll(xhtml, "continuation", träff.index + träff[0].length);
    fortsättningar.set(id, {
      text,
      nästa: /continuedAt="([^"]+)"/.exec(träff[1]!)?.[1] ?? null,
    });
  }

  const fakta: Faktum[] = [];

  for (const tagg of ["nonNumeric", "nonFraction"] as const) {
    const öppna = new RegExp(`<ix:${tagg}\\b([^>]*)>`, "g");

    for (let träff = öppna.exec(xhtml); träff; träff = öppna.exec(xhtml)) {
      const attribut = träff[1]!;
      const namn = /name="([^"]+)"/.exec(attribut)?.[1];
      if (!namn) continue;

      const { text } = läsInnehåll(xhtml, tagg, träff.index + träff[0].length);
      const delar = [text];

      // Följ kedjan av fortsättningar. Besökta id:n stoppar en trasig fil
      // från att loopa i all evighet.
      const besökta = new Set<string>();
      let nästa = /continuedAt="([^"]+)"/.exec(attribut)?.[1] ?? null;
      while (nästa && !besökta.has(nästa)) {
        besökta.add(nästa);
        const bit = fortsättningar.get(nästa);
        if (!bit) break;
        delar.push(bit.text);
        nästa = bit.nästa;
      }

      fakta.push({
        namn,
        värde: rensaText(delar.join(" ")),
        kontext: /contextRef="([^"]+)"/.exec(attribut)?.[1] ?? null,
        tupel: /tupleRef="([^"]+)"/.exec(attribut)?.[1] ?? null,
      });
    }
  }

  return fakta;
}

/** tupleID → elementnamn, för att kunna slå upp vad en tupel innehåller. */
function läsTuplar(xhtml: string): Map<string, string> {
  const tuplar = new Map<string, string>();
  const uttryck = /<ix:tuple\b([^>]*?)\/?>/g;
  for (let träff = uttryck.exec(xhtml); träff; träff = uttryck.exec(xhtml)) {
    const id = /tupleID="([^"]+)"/.exec(träff[1]!)?.[1];
    const namn = /name="([^"]+)"/.exec(träff[1]!)?.[1];
    if (id && namn) tuplar.set(id, namn);
  }
  return tuplar;
}

/** Organisationsnumret som årsredovisningen är inlämnad för. */
function läsUppgiftslämnare(xhtml: string): string | null {
  const träff = /<xbrli:identifier[^>]*>([^<]+)<\/xbrli:identifier>/.exec(xhtml);
  return träff ? rensaOrganisationsnummer(träff[1]!) : null;
}

/** Väljer årsredovisningen ur paketet – resten är revisionsberättelse. */
function väljÅrsredovisning(filer: Map<string, Uint8Array>): string | null {
  const avkodare = new TextDecoder();
  let bäst: { text: string; antal: number } | null = null;

  for (const [namn, innehåll] of filer) {
    if (!/\.x?html?$/i.test(namn)) continue;
    const text = avkodare.decode(innehåll);
    // Årsredovisningen använder se-gen-base; revisionsberättelsen se-ar-base.
    const antal = text.includes("se-gen-base") ? läsFakta(text).length : 0;
    if (antal > 0 && (!bäst || antal > bäst.antal)) bäst = { text, antal };
  }

  return bäst?.text ?? null;
}

// ════════════════════════════════════════════════════════════════════════
// Koncern
// ════════════════════════════════════════════════════════════════════════

export type Koncernroll = "moderföretag" | "dotterföretag" | "ingår i koncern";

export type Koncernbesked = {
  organisationsnummer: string;
  namn: string | null;
  juridiskForm: string | null;
  verksam: boolean | null;
  /** "okänt" betyder att underlag saknas, inte att företaget står utanför koncern. */
  koncern: "ja" | "nej" | "okänt";
  roll: Koncernroll | null;
  moderföretag: Moderföretag | null;
  /**
   * Koncernens översta bolag, när noten nämner ett utöver det närmaste.
   *
   * Noten skiljer på närmaste moderföretag och det som upprättar
   * koncernredovisning: "…dotterbolag till Dibber Kreavita AB, 556739-9075.
   * Moderbolag i den minsta koncern där koncernredovisning upprättas är
   * Dibber AS 998831067." Det andra bolaget är ofta enda vägen till toppen,
   * eftersom mellanliggande holdingbolag sällan lämnar in digitalt.
   */
  yttersta: Moderföretag | null;
  /** Dotterföretag som årsredovisningen räknar upp, när noten finns. */
  dotterföretag: Dotterföretag[];
  /** Vad bedömningen vilar på, i klartext. */
  grunder: string[];
  /** Räkenskapsåret som bedömningen bygger på. */
  räkenskapsårTom: string | null;
  årsredovisningar: Årsredovisning[];
};

export type Moderföretag = {
  namn: string | null;
  organisationsnummer: string | null;
  /** Sant för utländska nummer, som inte följer svenskt format. */
  utländskt: boolean;
  säte: string | null;
};

export type Dotterföretag = {
  namn: string | null;
  organisationsnummer: string | null;
  utländskt: boolean;
  kapitalandel: number | null;
};

/**
 * Plockar ut moderföretagets namn och organisationsnummer ur en fritextnot.
 *
 * En del årsredovisningar taggar inte moderföretaget strukturerat utan skriver
 * det i klartext: "Bolaget är ett helägt dotterbolag till Dibber Kreavita AB,
 * 556739-9075, med säte i Sollentuna." Organisationsnumret är entydigt, och
 * namnet står omedelbart före det – inledande småbokstavsord ("helägt",
 * "dotterbolag", "till") hör till meningen och skalas bort.
 */
function moderföretagUrText(text: string): {
  namn: string | null;
  organisationsnummer: string;
  utländskt: boolean;
  säte: string | null;
} | null {
  const svenskt = SVENSKT_NUMMER.exec(text);
  const utländskt = UTLÄNDSKT_NUMMER.exec(text);

  // Svenskt nummer går före: står båda i samma not är det svenska bolaget
  // närmaste moderföretag och det utländska koncernens yttersta topp.
  const nummer = svenskt ?? utländskt;
  if (!nummer) return null;
  const identitet = svenskt
    ? { nummer: rensaOrganisationsnummer(svenskt[1]!), svenskt: true }
    : { nummer: utländskt![1]!, svenskt: false };

  // Texten före numret slutar ofta på en etikett – "Org.nr:", "med
  // organisationsnummer" – som ska bort innan namnet plockas ut.
  const före = text
    .slice(0, nummer.index)
    .replace(/[\s,;:]*(?:med\s+)?org(?:anisations)?\.?\s*(?:nr|nummer)\.?\s*:?\s*$/i, "")
    .replace(/[\s,;:]+$/, "");

  // Noten introducerar nästan alltid namnet med "till" eller "är":
  // "… är ett helägt dotterbolag till X AB". Allt efter det sista sådana
  // ordet är namnet. Det klarar namn med små bokstäver i sig – "Stiftelsen
  // Viktor Rydbergs skolor" – som en ordvis genomgång skulle kapa.
  let namn: string[] = [];
  const inledning = [...före.matchAll(/\b(?:till|är|avser)\s+/gi)].at(-1);
  if (inledning) {
    namn = före.slice(inledning.index + inledning[0].length).split(/\s+/);
  } else {
    // Utan inledningsord: ta orden i slutet som ser ut som ett namn.
    const BINDEORD = new Set(["och", "&", "i", "av", "för"]);
    const ord = före.split(/\s+/);
    for (let i = ord.length - 1; i >= 0; i--) {
      const o = ord[i]!;
      if (/^[A-ZÅÄÖ0-9&]/.test(o) || BINDEORD.has(o.toLowerCase())) namn.unshift(o);
      else break;
    }
  }

  // Skala bort inledande småord som "ett" eller "en" som kan följa med.
  while (namn.length > 0 && !/^[A-ZÅÄÖ0-9]/.test(namn[0]!)) namn.shift();

  const säte =
    /säte\s*(?:i\s+)?:?\s*([A-ZÅÄÖ][\wÅÄÖåäö-]*(?:\s+[A-ZÅÄÖ][\wÅÄÖåäö-]*)?)/i.exec(text);

  return {
    namn: namn.length > 0 ? namn.join(" ") : null,
    organisationsnummer: identitet.nummer,
    utländskt: !identitet.svenskt,
    säte: säte?.[1]?.trim() ?? null,
  };
}

/**
 * Läser en moderföretagsnot som kan nämna två bolag: det närmaste och det som
 * upprättar koncernredovisning.
 *
 * Meningarna delas på punkt följd av stor bokstav, så att förkortningar som
 * "Org.nr:" inte råkar bli meningsslut.
 */
function moderföretagUrNot(text: string): {
  närmaste: Moderföretag | null;
  yttersta: Moderföretag | null;
} {
  const meningar = text
    .split(/(?<=\.)\s+(?=[A-ZÅÄÖ])/)
    .filter((m) => m.trim().length > 0);
  const funna: Moderföretag[] = [];

  for (const mening of meningar) {
    const träff = moderföretagUrText(mening);
    if (
      träff &&
      !funna.some((f) => f.organisationsnummer === träff.organisationsnummer)
    ) {
      funna.push(träff);
    }
  }

  // Hela texten som reserv om meningsuppdelningen inte gav något.
  if (funna.length === 0) {
    const helhet = moderföretagUrText(text);
    return { närmaste: helhet, yttersta: null };
  }

  return { närmaste: funna[0]!, yttersta: funna[1] ?? null };
}

/**
 * Läser specifikationen över dotterföretag ur ett moderbolags årsredovisning.
 *
 * Noten "Andelar i koncernföretag" kan innehålla en tupel per dotterföretag
 * med namn, organisationsnummer och kapitalandel. Det ger kanter uppifrån och
 * ned, och den ägarandel som annars inte går att få tag i.
 *
 * Observera: noten är frivillig för mindre bolag och används inte av något av
 * de bolag vi hittills läst – de redovisar bara ett belopp. Den slår till först
 * när digitalt inlämnad koncernredovisning blir vanligare.
 */
export function läsDotterföretag(xhtml: string): Array<{
  namn: string | null;
  organisationsnummer: string | null;
  utländskt: boolean;
  kapitalandel: number | null;
}> {
  const tuplar = läsTuplar(xhtml);
  const dotterTuplar = new Set(
    [...tuplar]
      .filter(([, namn]) => /Innehav.*Koncernforetag|Dotterforetag/i.test(namn))
      .map(([id]) => id),
  );
  if (dotterTuplar.size === 0) return [];

  const perTupel = new Map<string, Faktum[]>();
  for (const faktum of läsFakta(xhtml)) {
    if (!faktum.tupel || !dotterTuplar.has(faktum.tupel)) continue;
    perTupel.set(faktum.tupel, [...(perTupel.get(faktum.tupel) ?? []), faktum]);
  }

  const dotterföretag = [];
  for (const fakta of perTupel.values()) {
    const ur = (slut: RegExp) => fakta.find((f) => slut.test(f.namn))?.värde || null;
    const identitet = tolkaIdentitet(ur(/Organisationsnummer$/) ?? "");
    const andel = ur(/Kapitalandel|AgarandelProcent|Andel$/);

    dotterföretag.push({
      namn: ur(/ForetagetsNamn$/),
      organisationsnummer: identitet?.nummer ?? null,
      utländskt: identitet ? !identitet.svenskt : false,
      kapitalandel: andel
        ? Number(andel.replace(",", ".").replace(/[^\d.]/g, "")) || null
        : null,
    });
  }

  return dotterföretag.filter((d) => d.namn || d.organisationsnummer);
}

/** Poster som bara förekommer när företaget har mellanhavanden inom en koncern. */
const KONCERNPOSTER: Array<{ mönster: RegExp; beskrivning: string }> = [
  {
    mönster: /Koncernforetag/,
    beskrivning: "fordringar eller skulder till koncernföretag",
  },
  { mönster: /Koncernbidrag/, beskrivning: "koncernbidrag" },
  { mönster: /AndelarKoncernforetag/, beskrivning: "andelar i koncernföretag" },
];

/**
 * Bedömer koncerntillhörighet utifrån en uppackad årsredovisning.
 *
 * Exporterad för sig så att bedömningen går att testa mot en sparad fil utan
 * att gå via API:et.
 */
export function tolkaKoncern(xhtml: string): {
  koncern: "ja" | "nej";
  roll: Koncernroll | null;
  moderföretag: Moderföretag | null;
  yttersta: Moderföretag | null;
  dotterföretag: Dotterföretag[];
  grunder: string[];
} {
  const fakta = läsFakta(xhtml);
  const tuplar = läsTuplar(xhtml);
  const egetNummer = läsUppgiftslämnare(xhtml);
  const grunder: string[] = [];

  // 1. Uppgifterna om moderföretaget ligger samlade i en egen ix:tuple
  //    (se-gaap-ext:UppgiftModerforetagTuple). Att gå på tupeln är säkrare än
  //    att gissa utifrån vilket organisationsnummer som inte är företagets
  //    eget – noten kan innehålla flera företag.
  const moderTupler = new Set(
    [...tuplar].filter(([, namn]) => /Moderforetag/i.test(namn)).map(([id]) => id),
  );
  const moderFakta = fakta.filter((f) => f.tupel && moderTupler.has(f.tupel));

  // Alla årsredovisningar taggar inte moderföretaget strukturerat. De som
  // inte gör det skriver noten som fritext i ett Moderforetag-element.
  const moderNoter = fakta.filter(
    (f) => /Moderforetag/i.test(f.namn) && f.värde.length > 20,
  );
  const uppgerModerföretag =
    moderFakta.length > 0 ||
    moderNoter.length > 0 ||
    fakta.some((f) => f.namn === "se-gen-base:ModerforetagTypList");

  let moderföretag: Moderföretag | null = null;
  let yttersta: Moderföretag | null = null;
  if (uppgerModerföretag) {
    const ur = (slut: string) =>
      moderFakta.find((f) => f.namn.endsWith(slut))?.värde || null;
    const nummer = ur("Organisationsnummer");

    if (moderFakta.length > 0) {
      const identitet = nummer ? tolkaIdentitet(nummer) : null;
      moderföretag = {
        namn: ur("ForetagetsNamn"),
        organisationsnummer: identitet?.nummer ?? null,
        utländskt: identitet ? !identitet.svenskt : false,
        säte: ur("ForetagetsSate"),
      };
    }

    // Fritextnoten läses alltid, även när tupeln redan gett ett svar.
    // UppgiftNarmasteModerforetagTuple beskriver bara närmaste moderföretag –
    // koncernens topp står enbart i löptexten, och det är den enda vägen dit
    // när mellanbolagen saknar digital årsredovisning.
    for (const not of moderNoter) {
      const { närmaste, yttersta: topp } = moderföretagUrNot(not.värde);
      moderföretag ??= närmaste;

      for (const kandidat of [topp, närmaste]) {
        if (!kandidat?.organisationsnummer || yttersta) continue;
        if (kandidat.organisationsnummer !== moderföretag?.organisationsnummer)
          yttersta = kandidat;
      }
    }

    grunder.push(
      moderföretag?.namn
        ? `Årsredovisningen anger moderföretag: ${moderföretag.namn}`
        : "Årsredovisningen anger ett moderföretag",
    );
  }

  // Ett företag som anger sig självt som moderföretag är koncernens topp.
  const egetSomModer =
    moderföretag?.organisationsnummer != null &&
    moderföretag.organisationsnummer === egetNummer;

  // 2. Uppräknade dotterföretag – kanter uppifrån och ned.
  const dotterföretag = läsDotterföretag(xhtml);
  if (dotterföretag.length > 0) {
    grunder.push(`Räknar upp ${dotterföretag.length} dotterföretag`);
  }

  // 3. Poster som förutsätter andra företag i samma koncern.
  for (const { mönster, beskrivning } of KONCERNPOSTER) {
    const post = fakta.find(
      (f) => mönster.test(f.namn) && f.värde !== "" && f.värde !== "0",
    );
    if (post) grunder.push(`Redovisar ${beskrivning}`);
  }

  if (grunder.length === 0) {
    return {
      koncern: "nej",
      roll: null,
      moderföretag: null,
      yttersta: null,
      dotterföretag: [],
      grunder: ["Inga koncernposter i årsredovisningen"],
    };
  }

  // Pekar företaget ut ett annat företag som moderföretag är det dotterföretag.
  // Pekar det ut sig självt, eller räknar upp egna dotterföretag, är det
  // moderföretaget. Utan sådan uppgift, men med koncernposter, vet vi bara
  // att det ingår i en koncern.
  const roll: Koncernroll = egetSomModer
    ? "moderföretag"
    : moderföretag?.organisationsnummer
      ? "dotterföretag"
      : dotterföretag.length > 0
        ? "moderföretag"
        : "ingår i koncern";

  return {
    koncern: "ja",
    roll,
    moderföretag: egetSomModer ? null : moderföretag,
    yttersta,
    dotterföretag,
    grunder,
  };
}

/**
 * Avgör om ett företag ingår i en koncern, utifrån dess senaste digitala
 * årsredovisning.
 *
 * Svarar "okänt" när företaget inte lämnat in årsredovisning digitalt – de
 * flesta har inte gjort det, så ett okänt svar är vanligt och betyder inte
 * att företaget står utanför en koncern.
 */
export async function kontrolleraKoncern(
  organisationsnummer: string,
): Promise<Koncernbesked | null> {
  const [organisation, årsredovisningar] = await Promise.all([
    hämtaOrganisation(organisationsnummer),
    hämtaÅrsredovisningar(organisationsnummer).catch(() => [] as Årsredovisning[]),
  ]);
  if (!organisation) return null;

  const verksam = organisation.verksamOrganisation?.kod;
  const grund: Koncernbesked = {
    organisationsnummer: rensaOrganisationsnummer(organisationsnummer),
    namn: organisation.organisationsnamn?.organisationsnamnLista?.[0]?.namn ?? null,
    juridiskForm: organisation.juridiskForm?.klartext ?? null,
    verksam: verksam === "JA" ? true : verksam === "NEJ" ? false : null,
    koncern: "okänt",
    roll: null,
    moderföretag: null,
    yttersta: null,
    dotterföretag: [],
    grunder: ["Ingen digital årsredovisning finns att granska"],
    räkenskapsårTom: null,
    årsredovisningar,
  };

  const senaste = årsredovisningar[0];
  if (!senaste?.dokumentId) return grund;

  const paket = await hämtaÅrsredovisning(senaste.dokumentId);
  if (!paket) return grund;

  const xhtml = väljÅrsredovisning(packaUppZip(new Uint8Array(paket)));
  if (!xhtml) {
    return {
      ...grund,
      grunder: ["Årsredovisningen gick inte att tolka"],
      räkenskapsårTom: senaste.rapporteringsperiodTom ?? null,
    };
  }

  return {
    ...grund,
    ...tolkaKoncern(xhtml),
    räkenskapsårTom: senaste.rapporteringsperiodTom ?? null,
  };
}
