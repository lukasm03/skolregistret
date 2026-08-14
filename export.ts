/**
 * Bygger registret och skriver det till en json-fil på disk – för den som vill
 * ha ett engångsexport utan att starta servern.
 *
 *   bun run export
 *   bun run export mitt-register.json
 */

import {
  byggHuvudmannaregister,
  byggKommunregister,
  byggNationelltGenomsnitt,
  byggSkolenkäterOchDokument,
  byggSkoldetaljer,
  byggSkolregister,
  type NationelltGenomsnitt,
} from "./skolverket.ts";
import { läsKoncernlookup } from "./koncern.ts";

const NATIONELLA_SKOLFORMER = ["fsk", "gr", "gran", "gyan"] as const;

async function main(): Promise<void> {
  const utfil =
    process.argv[2] ?? `skolregister-${new Date().toISOString().slice(0, 10)}.json`;

  console.log("Bygger registret …");
  const kommuner = await byggKommunregister();
  const skolor = await byggSkolregister(undefined, kommuner);
  const koncerner = await läsKoncernlookup();
  const huvudmän = await byggHuvudmannaregister(skolor, koncerner);
  const nationelltGenomsnitt = (
    await Promise.all(
      NATIONELLA_SKOLFORMER.map((skolform) => byggNationelltGenomsnitt(skolform)),
    )
  ).filter((g): g is NationelltGenomsnitt => g !== null);
  console.log("Hämtar skolenkäter och dokument …");
  const skolenkäterOchDokument = await byggSkolenkäterOchDokument(
    skolor.map((s) => s.skolenhetskod),
    (klara, totalt) => {
      if (klara % 500 === 0 || klara === totalt) console.log(`  ${klara}/${totalt}`);
    },
  );

  console.log("Hämtar skoldetaljer …");
  const skoldetaljer = await byggSkoldetaljer(
    skolor.map((s) => s.skolenhetskod),
    kommuner,
    (klara, totalt) => {
      if (klara % 500 === 0 || klara === totalt) console.log(`  ${klara}/${totalt}`);
    },
  );

  console.log("Hämtar nationellt genomsnitt per gymnasieprogram …");
  const programkoder = [
    ...new Set(skoldetaljer.flatMap((s) => s.program.map((p) => p.kod))),
  ];
  const nationelltProgramGenomsnitt = (
    await Promise.all(programkoder.map((kod) => byggNationelltGenomsnitt("gy", kod)))
  ).filter((g): g is NationelltGenomsnitt => g !== null);

  const register = {
    byggd: new Date().toISOString(),
    kommuner: Object.fromEntries(kommuner),
    skolor,
    skoldetaljer,
    huvudmän,
    nationelltGenomsnitt,
    nationelltProgramGenomsnitt,
    skolenkäterOchDokument,
  };

  await Bun.write(utfil, JSON.stringify(register, null, 2));
  console.log(
    `Klart: ${skolor.length} skolor, ${huvudmän.length} huvudmän, ${kommuner.size} kommuner.`,
  );
  console.log(`Skrivet till ${utfil}`);
}

main().catch((fel) => {
  console.error("Kunde inte bygga registret:", fel);
  process.exit(1);
});
