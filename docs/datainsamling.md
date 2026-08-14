# Datainsamlingen

Datahämtning från Skolverkets och Bolagsverkets öppna API:er. Skolverkets koder
(`AKTIV`, `ENSKILD`, `GYAN`) översätts till svenska innan de lämnar modulerna.

Modulerna ligger i repots rot, bredvid Next-appen. De importeras aldrig från
`src/` – appen läser filen `export.ts` skriver, inte modulerna själva. Se
[README](../README.md) för helheten.

```bash
bun install
bun run export        # bygger data/skolregister-export.json – det appen läser
bun run typecheck
bun run api           # startar API:et (server.ts), alternativ till exportfilen
```

Bolagsverkets nycklar läses ur miljön och behövs bara för `bun run koncern` –
se [.env.example](../.env.example). Skolverket kräver ingen nyckel, så
`bun run export` fungerar utan.

## Filer

| Fil                                     | Vad den gör                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`skolverket.ts`](../skolverket.ts)     | Skolregister, skoldetaljer, huvudmän, nationella genomsnitt                              |
| [`bolagsverket.ts`](../bolagsverket.ts) | Om en enskild huvudman ingår i en koncern                                                |
| [`koncern.ts`](../koncern.ts)           | Bygger koncernregistret av `bolagsverket.ts`-svar över tid – kommandot `bun run koncern` |
| [`server.ts`](../server.ts)             | HTTP-API:et som binder ihop de tre ovan                                                  |

`skolverket.ts` och `bolagsverket.ts` är rena moduler utan sidoeffekter –
importera funktionerna du behöver. `koncern.ts` är både en modul (`läsKoncernlookup()`
används av `server.ts`) och ett CLI-verktyg, eftersom uppbyggnaden av
koncernregistret tar timmar och hör hemma i ett cron-jobb, inte i en request.

## Skolverket

Allt ligger i [`skolverket.ts`](../skolverket.ts).

| Funktion                                          | Returnerar                      | Anrop   | Tid    |
| ------------------------------------------------- | ------------------------------- | ------- | ------ |
| `byggKommunregister()`                            | `Kommunregister`                | ~290    | 0,5 s  |
| `byggSkolregister(rapportera?, kommuner?)`        | `Skolrad[]`                     | ~17 000 | 19 s   |
| `byggSkoldetalj(kod, kommuner?)`                  | `Skoldetalj \| null`            | 2–3     | 30 ms  |
| `byggHuvudmannaregister(skolor)`                  | `Huvudmannarad[]`               | ~1 360  | 1,5 s  |
| `byggNationelltGenomsnitt(skolform, programkod?)` | `NationelltGenomsnitt \| null`  | 1       | 30 ms  |
| `byggSkolenkät(kod)`                              | `Skolenkät`                     | 1–6     | 100 ms |
| `byggSkolinspektionDokument(kod, skolform?)`      | `SkolinspektionDokumentgrupp[]` | 1       | 30 ms  |
| `visaMätvärde(mätvärde)`                          | `string`                        | –       | –      |

Typer: `Skolrad`, `Skoldetalj`, `Huvudmannarad`, `NationelltGenomsnitt`, `Mätvärde`, `Kommunregister`,
`Skolenkät`, `Vårdnadshavarenkät`, `Elevenkät`, `Enkätfråga`, `SkolinspektionDokumentgrupp`, `SkolinspektionDokument`.

`byggSkolregister()` gör ~17 000 anrop och hör hemma i ett bygg- eller cron-steg
som sparar resultatet, inte i en request-hanterare – se hur `server.ts` gör det.
`byggSkoldetalj()` är billig och går bra att anropa direkt per request.

**Skicka alltid med `kommuner`.** Skolverket har ingen kommunlista, så
kommunkod → kommunnamn härleds från de 290 kommunala huvudmännen. Bygg tabellen
en gång och återanvänd den – annars byggs den om vid varje anrop, och en
detaljsida tar 413 ms i stället för 30 ms:

```ts
import { byggKommunregister, byggSkoldetalj } from "@/skolverket";

const kommuner = byggKommunregister(); // en gång per process

export async function GET(_: Request, { params }: { params: { kod: string } }) {
  const skola = await byggSkoldetalj(params.kod, await kommuner);
  if (!skola) return new Response("Skolan finns inte", { status: 404 });
  return Response.json(skola);
}
```

### `Skolrad`

```json
{
  "skolenhetskod": "61686233",
  "namn": "Rålambshovsskolan",
  "status": "Aktiv",
  "huvudman": "STOCKHOLMS KOMMUN",
  "huvudmannaOrgnr": "2120000142",
  "huvudmannatyp": "Kommunal",
  "kommun": "Stockholm",
  "kommunkod": "0180",
  "skolformer": ["Grundskola", "Förskoleklass", "Fritidshem"],
  "gymnasieprogram": [],
  "antalElever": 450
}
```

`gymnasieprogram` listar skolans nationella gymnasieprogram, för skolor som
bedriver gymnasieskola eller anpassad gymnasieskola. Tom lista annars.

### `Skoldetalj`

Samma fält som `Skolrad`, plus kontaktuppgifter och nyckeltal:

```json
{
  "rektor": "Eva Andersson",
  "startdatum": "2013-10-01",
  "besöksadress": "Gjörwellsgatan 13, 11260 Stockholm",
  "telefon": "08-50808700",
  "webbplats": "https://grundskola.stockholm/hitta-grundskola/grundskola/ralambshovsskolan",
  "epost": "ralambshovsskolan@edu.stockholm.se",
  "koordinater": { "latitud": 59.329132979015, "longitud": 18.019998115185295 },
  "nyckeltal": {
    "meritvärdeÅrskurs9": {
      "status": "finns",
      "text": "268,0",
      "tal": 268,
      "läsår": "2024/25"
    },
    "andelGodkändaÅrskurs9": {
      "status": "finns",
      "text": "88,1",
      "tal": 88.1,
      "läsår": "2024/25"
    },
    "andelBehörigaLärare": {
      "status": "finns",
      "text": "87,9",
      "tal": 87.9,
      "läsår": "2025/26"
    },
    "eleverPerLärare": {
      "status": "finns",
      "text": "14,0",
      "tal": 14,
      "läsår": "2025/26"
    }
  }
}
```

### `NationelltGenomsnitt`

Samma nyckeltal som `Skoldetalj`, men för hela riket i stället för en enskild
skola. `gy` kräver en programkod – Skolverket har inget riksgenomsnitt för
gymnasieskolan som helhet, bara per program:

```json
{
  "skolform": "gr",
  "nyckeltal": {
    "meritvärdeÅrskurs9": {
      "status": "finns",
      "text": "228,5",
      "tal": 228.5,
      "läsår": "2024/25"
    },
    "andelGodkändaÅrskurs9": {
      "status": "finns",
      "text": "71,9",
      "tal": 71.9,
      "läsår": "2024/25"
    },
    "andelBehörigaLärare": {
      "status": "finns",
      "text": "73,4",
      "tal": 73.4,
      "läsår": "2025/26"
    },
    "eleverPerLärare": {
      "status": "finns",
      "text": "11,9",
      "tal": 11.9,
      "läsår": "2025/26"
    }
  }
}
```

```json
{
  "skolform": "gy",
  "programkod": "NA25",
  "nyckeltal": {
    "antalElever": {
      "status": "saknas",
      "förklaring": "Uppgiften saknas",
      "läsår": null
    },
    "lägstaAntagningspoäng": {
      "status": "saknas",
      "förklaring": "Uppgiften saknas",
      "läsår": null
    },
    "genomsnittligAntagningspoäng": {
      "status": "saknas",
      "förklaring": "Uppgiften saknas",
      "läsår": null
    },
    "andelMedExamenInom3År": {
      "status": "finns",
      "text": "84,7",
      "tal": 84.7,
      "läsår": "2022/23"
    },
    "betygspoängMedExamen": {
      "status": "finns",
      "text": "16,4",
      "tal": 16.4,
      "läsår": "2024/25"
    },
    "andelMedHögskolebehörighet": {
      "status": "finns",
      "text": "93,2",
      "tal": 93.2,
      "läsår": "2024/25"
    }
  }
}
```

### `Huvudmannarad`

```json
{
  "organisationsnummer": "5566127600",
  "namn": "Nya Skolan Sverige AB",
  "typ": "Fristående",
  "bolagsform": "Aktiebolag utom bank- och försäkringsaktiebolag",
  "koncern": {
    "koncernOrgNr": "5568126550",
    "koncernNamn": "Ursa Callis Holding AB",
    "kedja": ["Ursa Callis Holding AB", "Nya Skolan Sverige AB"],
    "antalFöretag": 2
  },
  "kommuner": ["Trollhättan"],
  "skolformer": ["Grundskola", "Förskoleklass", "Fritidshem"],
  "antalEnheter": 3,
  "antalElever": 460
}
```

`bolagsform` är juridisk form (`companyForm` hos Skolverket) och säger
ingenting om koncerntillhörighet. Den frågan besvaras av `koncern`, som fylls
från koncernregistret – se [Koncernkartläggning](#koncernkartläggning) nedan.
`koncern: null` betyder att uppgift saknas; `antalFöretag: 1` betyder att
huvudmannen är ensam, inte del av en koncern.

### `Skolenkät`

Skolinspektionens skolenkät – en vårdnadshavarenkät per skolform enheten
bedriver och en elevenkät per årskurs och skolform. Enheter utan svarande
saknar länken helt hos Skolverket, och ger då tomma listor här i stället för
en enkät fylld med nollor:

```json
{
  "skolenhetskod": "43038662",
  "vårdnadshavare": [
    {
      "skolform": "Grundskola",
      "läsår": "VT25",
      "antalSvar": 100,
      "rekommendation": null,
      "nöjdhet": {
        "fråga": "Hur nöjd är du med ditt barns skola?",
        "ämne": "Övergripande nöjdhet",
        "genomsnitt": 7,
        "svarsfördelning": {
          "Stämmer helt och hållet": 35,
          "Stämmer ganska bra": 46,
          "Stämmer ganska dåligt": 13,
          "Stämmer inte alls": 6,
          "Vet inte": 0,
          "Inget svar": 0
        }
      },
      "trygghet": { "...": "samma form" },
      "studiero": { "...": "samma form" },
      "stöd": { "...": "samma form" },
      "stimulans": { "...": "samma form" }
    }
  ],
  "elever": [
    {
      "skolform": "Grundskola",
      "läsår": "VT25",
      "årskurs": "ak5",
      "antalIGruppen": 36,
      "svarsfrekvens": 81,
      "antalSvar": 29,
      "nöjdhet": { "...": "samma form som ovan" }
    }
  ]
}
```

`rekommendation` är `null` när frågan inte ställdes i den enkätomgången –
skiljt från en fråga med bara "Inget svar" i sin svarsfördelning.
`svarsfördelning` tar bara med svarsalternativ som faktiskt har data.

### `SkolinspektionDokumentgrupp`

Skolenkätrapporter, granskningsbeslut och liknande i pdf, grupperade per
skolform. Filerna själva ligger hos Siris – funktionen ger bara länkarna:

```json
[
  {
    "skolform": "Grundskola",
    "dokument": [
      {
        "typ": "Skolenkäten (Ansvarig myndighet - Skolinspektionen)",
        "typId": "SCHOOL_SURVEY",
        "titel": "Grundskola, Skolenkäten, Skolenhetsrapport, Ekerö, Färentuna skola, VT25 (pdf, 418 kB)",
        "filnamn": "S_43038662_Färentuna skola.pdf",
        "mimetyp": "application/pdf",
        "storlekBytes": 428488,
        "url": "https://siris.skolverket.se/siris/ris.openfile?docID=653753"
      }
    ]
  }
]
```

Skicka med en `skolform` (`"fsk"`, `"gr"`, `"gran"`, `"gy"` eller `"gyan"`) för
att bara hämta en enskild skolforms dokument i ett anrop i stället för alla.

### Uppgifter som saknas

Skolverket skriver inte ut siffror som saknas eller är skyddade: `.` betyder att
uppgiften saknas, `..` att den döljs för att skolan har för få elever, `*` att
lärare saknar legitimation. De får aldrig behandlas som noll. Modulen tolkar dem
och `visaMätvärde()` ger en färdig svensk text:

```json
{ "status": "saknas", "förklaring": "Visas inte – för få elever", "läsår": "2024/25" }
```

Samma sak gäller `antalElever`, som är `number | null`. `null` betyder att
Skolverket inte redovisar antalet – inte att skolan saknar elever.

## Bolagsverket

[`bolagsverket.ts`](../bolagsverket.ts) svarar på om en huvudman ingår i en koncern.

| Funktion                                                              | Returnerar                             |
| --------------------------------------------------------------------- | -------------------------------------- |
| `kontrolleraKoncern(orgnr)`                                           | `Koncernbesked \| null`                |
| `hämtaOrganisation(orgnr)`                                            | `Organisation \| null`                 |
| `hämtaÅrsredovisningar(orgnr)`                                        | `Årsredovisning[]`, nyaste först       |
| `hämtaÅrsredovisning(dokumentId)`                                     | `ArrayBuffer` (zip) `\| null`          |
| `läsFakta(xhtml)` / `tolkaKoncern(xhtml)` / `läsDotterföretag(xhtml)` | iXBRL-tolkning, testbar utan nätverk   |
| `hämtaToken()`                                                        | `string`, återanvänds tills det går ut |

```json
{
  "organisationsnummer": "5566127600",
  "namn": "Nya Skolan Sverige AB",
  "juridiskForm": "Övriga aktiebolag",
  "verksam": true,
  "koncern": "ja",
  "roll": "dotterföretag",
  "moderföretag": {
    "namn": "Ursa Callis Holding AB",
    "organisationsnummer": "5568126550",
    "utländskt": false,
    "säte": "Trollhättan"
  },
  "yttersta": null,
  "dotterföretag": [],
  "grunder": [
    "Årsredovisningen anger moderföretag: Ursa Callis Holding AB",
    "Redovisar fordringar eller skulder till koncernföretag",
    "Redovisar koncernbidrag"
  ],
  "räkenskapsårTom": "2025-06-30"
}
```

`moderföretag` är närmaste moderföretag. `yttersta` är koncernens topp när noten
nämner ett bolag utöver det närmaste – ofta enda vägen dit, eftersom
mellanliggande holdingbolag sällan lämnar in digitalt. Utländska nummer
(norska `998831067`) markeras med `utländskt: true` och kan inte slås upp vidare.

### Så tas beskedet fram

API:et redovisar inte koncerntillhörighet – ordet finns inte i specen. Svaret
läses i stället ur företagets digitala årsredovisning, som API:et lämnar som ett
zip-arkiv med iXBRL. Modulen packar upp arkivet (`node:zlib`, inga beroenden) och
läser de taggade uppgifterna om moderföretag och koncernposter.

Bedömningen görs på XBRL-taggarna, aldrig på löptext: varje K3-årsredovisning
innehåller frasen "Årsredovisning och koncernredovisning (K3)" – det är
regelverkets namn och säger ingenting om koncerntillhörighet.

`roll` är `"dotterföretag"` när moderföretaget är namngivet, `"moderföretag"` när
företaget pekar ut sig självt, och `"ingår i koncern"` när årsredovisningen visar
koncernposter utan att namnge någon moder.

### Begränsningar

`koncern: "okänt"` betyder att underlag saknas, inte att företaget står utanför en
koncern. Bara digitalt inlämnade årsredovisningar går att läsa – av 1 040
fristående skolhuvudmän hade 42 en sådan; resten har lämnat in på papper. Det är
det här som `koncern.ts` fyller i med andra källor.

API:et har en kvot som ger 429 vid många anrop i följd och släpper först efter en
halv minut. Modulen backar av och försöker om, men kör inte det här parallellt
över tusentals företag.

Nycklarna läses ur `BOLAGSVERKET_KLIENT_ID` och `BOLAGSVERKET_HEMLIGHET` och
finns inte i koden. Saknas de kastar `hämtaToken()` ett fel som säger vilka
variabler som behövs – kontrollen sker där och inte vid import, så
`bun run export` fungerar utan nycklar. Modulen måste stanna på serversidan; en
klientbunt skulle exponera hemligheten.

## Koncernkartläggning

`bolagsverket.ts` svarar på ett företag i taget: "ingår det här i en koncern?".
[`koncern.ts`](../koncern.ts) gör det till ett register – följer ägarkedjorna
uppåt från Skolverkets fristående huvudmän, sparar det den hittar mellan
körningar i `data/koncern-lager.json`, och skriver ut en statisk uppslagstabell
i `data/koncern-lookup.json` som `server.ts` serverar.

Kommandot har tre underkommandon, ett per källa. En svagare källa skriver
aldrig över en starkare:

| Rang         | Kommando                             | Källa                        |
| ------------ | ------------------------------------ | ---------------------------- |
| 1 (starkast) | –                                    | manuell rättelse i lagret    |
| 2            | `bun run koncern las-arsredovisning` | koncernens egen pdf          |
| 3            | `bun run koncern bygg`               | Bolagsverkets iXBRL, live    |
| 3            | `bun run koncern importera-skolkoll` | skolkoll.se, tredjepartsdata |

**Varför resultaten sparas.** Ett företag lämnar årsredovisning en gång om året.
En körning ser alltså bara den bråkdel som lämnat in nyligen; resten svarar
"okänt" trots att vi kanske visste svaret förra månaden. Därför sparas varje
härlett besked permanent, och ett nytt "okänt" får aldrig skriva över ett
tidigare "ja" eller "nej". Möts två källor om samma företag ersätter de inte
varandra utan vävs ihop: pdf:en har dotterbolagsförteckningen, den digitala
årsredovisningen har moderföretaget, och båda behövs.

### `bun run koncern bygg`

```bash
bun run koncern bygg
```

Går igenom Skolverkets fristående huvudmän och därefter de moder- och
dotterföretag som Bolagsverket pekar ut, i flera rundor – det är den
återmatningen som fångar de små koncernerna: en skola pekar ut ett holdingbolag
som inte själv driver skola, och som därför aldrig finns i Skolverkets
register. Ett prov med 8 frön gav 15 företag och 5 flerföretagskoncerner på tre
rundor.

Jobbet hör hemma i ett cron-jobb, inte i en request-hanterare. Ett fullt varv
gör tusentals anrop mot Bolagsverket och tar timmar. Det kan avbrytas när som
helst – lagret gör att en ny start hoppar över allt som redan är hämtat. Kör
det inte oftare än dygnsvis, och inte parallellt: Bolagsverkets kvot ger 429
långt innan tusen företag är avklarade.

Uppslagstabellen ger varje företag en rot och hela kedjan dit:

```json
{
  "orgNr": "5565190609",
  "namn": "Dibber Capella Skola AB",
  "koncernOrgNr": "998831067",
  "koncernNamn": "Dibber AS",
  "path": [
    "Dibber AS",
    "Dibber Sverige AB",
    "Dibber Kreavita AB",
    "Dibber Capella Skola AB"
  ],
  "pathOrgNrs": ["998831067", "5591153803", "5567399075", "5565190609"],
  "parentOrgNr": "5567399075",
  "ägarandel": null,
  "källa": "live"
}
```

| Funktion                              | Gör                                             |
| ------------------------------------- | ----------------------------------------------- |
| `byggKoncernlookup({ frön })`         | hela varvet, skriver `data/koncern-lookup.json` |
| `kartläggKoncerner(frön, { lager })`  | upptäcktsloopen                                 |
| `byggKoncerngraf(lager)`              | löser kedjorna till koncernrötter               |
| `öppnaLager(sökväg)` / `slåIhop(...)` | lagret och dess sammanslagningsregel            |
| `läsKoncernlookup(sökväg)`            | läser den byggda tabellen, t.ex. i en API-rutt  |

### `bun run koncern las-arsredovisning`

De flesta företag har inte lämnat in årsredovisningen digitalt, så Bolagsverket
svarar `"okänt"` för dem. De stora skolkoncernerna har däremot en annan
egenskap: de lägger ut sin årsredovisning som pdf på sin egen webbplats,
gratis, och i den står noten `Andelar i koncernföretag` med varje dotterbolags
namn, organisationsnummer, säte och kapitalandel. En enda sådan pdf –
AcadeMedias – ger 88 dotterbolag.

```bash
bun run koncern las-arsredovisning academedia-arsredovisning-2425.pdf
bun run koncern las-arsredovisning academedia-arsredovisning-2425.pdf --tom 2025-06-30 --skriv
bun run koncern las-arsredovisning https://example.se/arsredovisning.pdf --skriv
```

Första kommandot visar bara vad som lästes. Inget sparas förrän `--skriv` är
med, och det är meningen: en felläst tabell blir annars en felaktig koncern som
ligger kvar tills någon rättar den för hand. Ett argument som börjar med
`http` hämtas och sparas i `data/arsredovisningar/` så att det går att jämföra
med det som lästes ut.

```
Årsredovisning: academedia-arsredovisning-2425.pdf  (113 sidor)
Moderföretag:   AcadeMedia AB  5568460231

Dotterföretag (240):
    1. ACM 2001 AB                          5560572850   Stockholm    100%   s.94
    2. Sjölins Gymnasium AB                 5563758399   Stockholm    100%   s.95
    3. AcadeMedia Norge AS                  913192281    Karmøy       100%   s.95
  …
```

Sjölins Gymnasium AB är exemplet som gör poängen: bolaget har ingen digital
årsredovisning alls och får `"okänt"` av Bolagsverket, men står i AcadeMedias
not och hamnar därmed i rätt koncern ändå. Noten skiljer inte alltid på direkt
och indirekt ägda bolag, så kanterna blir platta – alla dotterbolag hängs
direkt under moderföretaget. Det spelar ingen roll för koncerntillhörigheten,
och mellannivåerna fylls i av de digitala årsredovisningarna där sådana finns.

| Flagga          | Gör                                                                      |
| --------------- | ------------------------------------------------------------------------ |
| `--orgnr <nr>`  | moderföretagets organisationsnummer, om det inte gick att läsa ur texten |
| `--namn <namn>` | moderföretagets namn, om det blev fel                                    |
| `--tom <datum>` | räkenskapsårets sista dag, t.ex. `2025-06-30`                            |
| `--minst <tal>` | lägsta kapitalandel som räknas som dotterföretag (förval 50)             |
| `--skriv`       | spara i `data/koncern-lager.json`                                        |
| `--json`        | skriv ut hela läsningen som json                                         |

**Vilken årsredovisning ska matas in?** Ta koncernmoderns, inte skolans – en
enskild skola har sällan några dotterbolag alls. Har du bara skolans
organisationsnummer, kör `bun run koncern bygg` först: den följer ägarkedjan
uppåt och namnger moderbolaget åt dig.

Kraven på filen:

1. **Fullständig årsredovisning**, inte bokslutskommuniké, delårsrapport eller
   "årsöversikt". Bara den fullständiga innehåller noterna.
2. **Koncernredovisning ska ingå.** Leta i innehållsförteckningen efter en not
   som heter `Andelar i koncernföretag`, `Aktier i dotterbolag` eller
   `Andelar i dotterföretag`.
3. **Noten ska ha organisationsnummer i tabellen**, inte bara namn.
4. **Texten ska gå att markera i pdf:en.** Är den inskannad måste den
   OCR-tolkas först.

Textutdraget görs av `pdftotext` ur poppler, som inte följer med projektet:

```bash
brew install poppler
```

Den som hellre gör utdraget själv kan mata in en färdig `.txt` i stället – den
måste vara gjord med `pdftotext -layout`, eftersom hela tolkningen bygger på
att kolumnerna står kvar på sina platser.

### `bun run koncern importera-skolkoll`

skolkoll.se lägger sin egen koncernuppslagstabell öppet på
`https://skolkoll.se/data/koncern-lookup.json`. Den täcker fler bolag än de
egna vägarna hittills gjort, men är en tredjepartskälla, inte en primärkälla:
ungefär hälften av posterna kommer från ett skikt de själva kallar
`previous_lookup` – importerat, inte härlett ur en årsredovisning, och kan vara
föråldrat. Det bekräftades direkt vid import: skolkoll räknade Skolgrunden AB
till Lilla Park och Min Skola AB, medan Cedergrenskas egen årsredovisning –
avskriven för hand samma vecka – räknar upp bolaget som sin egen kommissionär.

```bash
bun run koncern importera-skolkoll                    # visar vad som skulle hända
bun run koncern importera-skolkoll --skriv            # skriver bara det som är nytt
bun run koncern importera-skolkoll --skriv --visa-konflikter
```

Importen skriver bara till organisationsnummer där vi i dag har `"okänt"`
eller ingen post alls. Ett redan känt svar – ett `"ja"` eller ett `"nej"`,
oavsett källa – rörs aldrig, även när skolkoll säger något annat. Jämförelsen
görs mot den lösta koncernroten, inte mot den direkta föräldern – annars skulle
två bolag i samma kedja som pekar på olika djup se ut som en konflikt när de
egentligen är samma svar.

| Flagga                | Gör                                      |
| --------------------- | ---------------------------------------- |
| `--url <url>`         | annan uppslagsfil än skolkolls, för test |
| `--lagerfil <sökväg>` | annat lager än `data/koncern-lager.json` |
| `--skriv`             | spara det som är nytt                    |
| `--visa-konflikter`   | lista varje konflikt, inte bara antalet  |

`skolkoll` som källa ligger i samma rangskikt som Bolagsverkets live-svar –
aldrig över en pdf-läsning eller en manuell rättelse i lagret. Nästa
`bun run koncern bygg` kan uppgradera en importerad post om Bolagsverket ger
ett eget svar, men ingenting kan skriva över en pdf-läsning eller en manuell
rättelse.

## Omfattning

7 466 aktiva skolenheter, 1 357 huvudmän, 1 542 170 elever (augusti 2026).
1 768 enheter saknar redovisat elevantal, 15 saknar kommunnamn.

Källor: [Skolenhetsregistret v2](https://api.skolverket.se/skolenhetsregistret/v2),
[Planerade utbildningar v4](https://api.skolverket.se/planned-educations/v4) och
[Bolagsverkets API för värdefulla datamängder](https://bolagsverket.se/apierochoppnadata/hamtaforetagsinformation/vardefulladatamangder/apiforvardefulladatamangder.5513.html).
Skolverkets API:er kräver ingen nyckel; Bolagsverkets gör det. Datat uppdateras
en gång per dygn.
