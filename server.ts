/**
 * HTTP-API som exponerar skolregistret, huvudmannaregistret och
 * skoldetaljer via skolverket.ts.
 *
 * `byggSkolregister()` och `byggHuvudmannaregister()` gör tusentals anrop
 * mot Skolverket och hör enligt README inte hemma i en request-hanterare.
 * Servern bygger dem därför en gång vid uppstart och håller resultatet i
 * minnet, med en daglig ombyggnad eftersom källdatat uppdateras en gång per
 * dygn. `byggSkoldetalj()` är billig och byggs per anrop.
 */

import {
  byggHuvudmannaregister,
  byggKommunregister,
  byggNationelltGenomsnitt,
  byggSkoldetalj,
  byggSkolenkät,
  byggSkolenkäterOchDokument,
  byggSkolinspektionDokument,
  byggSkolregister,
  type Huvudmannarad,
  type Kommunregister,
  type NationelltGenomsnitt,
  type SkolenkätOchDokument,
  type Skolrad,
  type Statistiknyckel,
} from "./skolverket.ts";
import { läsKoncernlookup } from "./koncern.ts";

const PORT = Number(process.env.PORT ?? 3000);
const OMBYGGNADSINTERVALL_MS = 24 * 60 * 60 * 1000;

const NATIONELLA_SKOLFORMER = ["fsk", "gr", "gran", "gyan"] as const;

type Register = {
  byggd: Date;
  kommuner: Kommunregister;
  skolor: Skolrad[];
  huvudmän: Huvudmannarad[];
  nationelltGenomsnitt: NationelltGenomsnitt[];
  skolenkäterOchDokument: SkolenkätOchDokument[];
};

let register: Register | null = null;
let byggning: Promise<Register> | null = null;

async function byggRegister(): Promise<Register> {
  const kommuner = await byggKommunregister();
  const skolor = await byggSkolregister(undefined, kommuner);
  const koncerner = await läsKoncernlookup();
  const huvudmän = await byggHuvudmannaregister(skolor, koncerner);
  const nationelltGenomsnitt = (
    await Promise.all(
      NATIONELLA_SKOLFORMER.map((skolform) => byggNationelltGenomsnitt(skolform)),
    )
  ).filter((g): g is NationelltGenomsnitt => g !== null);
  const skolenkäterOchDokument = await byggSkolenkäterOchDokument(
    skolor.map((s) => s.skolenhetskod),
  );
  return {
    byggd: new Date(),
    kommuner,
    skolor,
    huvudmän,
    nationelltGenomsnitt,
    skolenkäterOchDokument,
  };
}

async function hämtaRegister(): Promise<Register> {
  if (register) return register;
  if (!byggning) byggning = byggRegister().then((r) => ((register = r), r));
  return byggning;
}

function schemaläggOmbyggnad() {
  setInterval(() => {
    byggning = byggRegister().then((r) => ((register = r), r));
    byggning.catch((fel) => console.error("Ombyggnad av registret misslyckades:", fel));
  }, OMBYGGNADSINTERVALL_MS);
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function fel(meddelande: string, status: number): Response {
  return json({ fel: meddelande }, status);
}

function sidnumrera<T>(
  rader: T[],
  url: URL,
): { rader: T[]; totalt: number; sida: number; sidstorlek: number } {
  const sidstorlek = Math.min(
    Number(url.searchParams.get("sidstorlek") ?? 100) || 100,
    500,
  );
  const sida = Math.max(Number(url.searchParams.get("sida") ?? 1) || 1, 1);
  const start = (sida - 1) * sidstorlek;
  return {
    rader: rader.slice(start, start + sidstorlek),
    totalt: rader.length,
    sida,
    sidstorlek,
  };
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const segment = url.pathname.split("/").filter(Boolean);

    if (segment[0] !== "api") return fel("Hittades inte", 404);

    // GET /api/status
    if (segment.length === 1 && segment[0] === "api") return fel("Hittades inte", 404);

    // GET /api/export – hela registret som nedladdningsbar json-fil
    if (segment[1] === "export" && segment.length === 2) {
      const {
        byggd,
        kommuner,
        skolor,
        huvudmän,
        nationelltGenomsnitt,
        skolenkäterOchDokument,
      } = await hämtaRegister();
      const filnamn = `skolregister-${byggd.toISOString().slice(0, 10)}.json`;
      return new Response(
        JSON.stringify(
          {
            byggd: byggd.toISOString(),
            kommuner: Object.fromEntries(kommuner),
            skolor,
            huvudmän,
            nationelltGenomsnitt,
            skolenkäterOchDokument,
          },
          null,
          2,
        ),
        {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="${filnamn}"`,
          },
        },
      );
    }

    if (segment[1] === "status" && segment.length === 2) {
      return json({
        byggd: register?.byggd.toISOString() ?? null,
        skolor: register?.skolor.length ?? 0,
        huvudmän: register?.huvudmän.length ?? 0,
        kommuner: register?.kommuner.size ?? 0,
      });
    }

    // GET /api/kommuner
    if (segment[1] === "kommuner" && segment.length === 2) {
      const { kommuner } = await hämtaRegister();
      return json(Object.fromEntries(kommuner));
    }

    // GET /api/skolor
    // GET /api/skolor/:skolenhetskod
    if (segment[1] === "skolor") {
      if (segment.length === 2) {
        const { skolor, kommuner } = await hämtaRegister();
        let träffar = skolor;
        const kommun = url.searchParams.get("kommun");
        const status = url.searchParams.get("status");
        const huvudmannaOrgnr = url.searchParams.get("huvudmannaOrgnr");
        if (kommun)
          träffar = träffar.filter(
            (s) => s.kommun?.toLowerCase() === kommun.toLowerCase(),
          );
        if (status)
          träffar = träffar.filter(
            (s) => s.status?.toLowerCase() === status.toLowerCase(),
          );
        if (huvudmannaOrgnr)
          träffar = träffar.filter((s) => s.huvudmannaOrgnr === huvudmannaOrgnr);
        void kommuner;
        return json(sidnumrera(träffar, url));
      }
      if (segment.length === 3) {
        const { kommuner } = await hämtaRegister();
        const skola = await byggSkoldetalj(segment[2]!, kommuner);
        if (!skola) return fel("Skolan finns inte", 404);
        return json(skola);
      }
      // GET /api/skolor/:skolenhetskod/enkat
      if (segment.length === 4 && segment[3] === "enkat") {
        return json(await byggSkolenkät(segment[2]!));
      }
      // GET /api/skolor/:skolenhetskod/dokument
      // GET /api/skolor/:skolenhetskod/dokument?skolform=gr
      if (segment.length === 4 && segment[3] === "dokument") {
        const skolform = url.searchParams.get("skolform") as Statistiknyckel | null;
        return json(await byggSkolinspektionDokument(segment[2]!, skolform ?? undefined));
      }
    }

    // GET /api/huvudman
    // GET /api/huvudman/:organisationsnummer
    if (segment[1] === "huvudman") {
      if (segment.length === 2) {
        const { huvudmän } = await hämtaRegister();
        let träffar = huvudmän;
        const kommun = url.searchParams.get("kommun");
        const typ = url.searchParams.get("typ");
        if (kommun)
          träffar = träffar.filter((h) =>
            h.kommuner.some((k) => k.toLowerCase() === kommun.toLowerCase()),
          );
        if (typ)
          träffar = träffar.filter((h) => h.typ?.toLowerCase() === typ.toLowerCase());
        return json(sidnumrera(träffar, url));
      }
      if (segment.length === 3) {
        const { huvudmän } = await hämtaRegister();
        const huvudman = huvudmän.find((h) => h.organisationsnummer === segment[2]);
        if (!huvudman) return fel("Huvudmannen finns inte", 404);
        return json(huvudman);
      }
    }

    // GET /api/nationellt-genomsnitt/:skolform          (fsk, gr, gran, gyan)
    // GET /api/nationellt-genomsnitt/gy/:programCode
    if (segment[1] === "nationellt-genomsnitt") {
      if (segment.length === 3 && segment[2] !== "gy") {
        const skolform = segment[2] as "fsk" | "gr" | "gran" | "gyan";
        if (!["fsk", "gr", "gran", "gyan"].includes(skolform)) {
          return fel("Okänd skolform", 400);
        }
        const genomsnitt = await byggNationelltGenomsnitt(skolform);
        if (!genomsnitt) return fel("Ingen statistik hittades", 404);
        return json(genomsnitt);
      }
      if (segment.length === 4 && segment[2] === "gy") {
        const genomsnitt = await byggNationelltGenomsnitt("gy", segment[3]!);
        if (!genomsnitt) return fel("Ingen statistik hittades", 404);
        return json(genomsnitt);
      }
      if (segment.length === 3 && segment[2] === "gy") {
        return fel("Ange en programkod: /api/nationellt-genomsnitt/gy/:programCode", 400);
      }
    }

    return fel("Hittades inte", 404);
  },
});

console.log(`Bygger registret …`);
hämtaRegister()
  .then((r) => {
    console.log(
      `Klart: ${r.skolor.length} skolor, ${r.huvudmän.length} huvudmän, ${r.kommuner.size} kommuner.`,
    );
    schemaläggOmbyggnad();
  })
  .catch((e) => console.error("Kunde inte bygga registret:", e));

console.log(`Server körs på http://localhost:${PORT}`);
