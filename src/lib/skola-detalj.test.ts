import { describe, expect, test } from "bun:test";
import { buildSkolaDetaljVy, type SkolaDetaljIndata } from "./skola-detalj";
import type {
  HuvudmanKoncern,
  Nyckeltal,
  NyckeltalVärde,
  SkolaDetalj,
  Skolform,
} from "./skolregister";

const finns = (tal: number, läsår: string | null = "2024/25"): NyckeltalVärde => ({
  status: "finns",
  text: String(tal),
  tal,
  läsår,
});

const saknas = (läsår: string | null = null): NyckeltalVärde => ({
  status: "saknas",
  förklaring: "Uppgiften är inte inrapporterad till Skolverket.",
  läsår,
});

function skola(overrides: Partial<SkolaDetalj> = {}): SkolaDetalj {
  return {
    skolenhetskod: "12345678",
    namn: "Testskolan",
    status: "Aktiv",
    huvudman: "Testskolan AB",
    huvudmannaOrgnr: "5567001234",
    huvudmannatyp: "Fristående",
    kommun: "Test Kommun",
    kommunkod: "0126",
    skolformer: ["Grundskola"],
    gymnasieprogram: [],
    antalElever: 300,
    antalEleverKälla: "rapporterat",
    årskurser: ["7", "8", "9"],
    årskurserPerSkolform: [
      { kod: "gr", skolform: "Grundskola", årskurser: ["7", "8", "9"] },
    ],
    rektor: null,
    startdatum: null,
    besöksadress: null,
    telefon: null,
    webbplats: null,
    epost: null,
    koordinater: null,
    program: [],
    nyckeltal: {
      meritvärdeÅrskurs9: finns(250),
      andelGodkändaÅrskurs9: finns(95),
      andelBehörigaLärare: finns(88),
      eleverPerLärare: finns(12),
    },
    salsa: null,
    ...overrides,
  };
}

function indata(overrides: Partial<SkolaDetaljIndata> = {}): SkolaDetaljIndata {
  const perSkolform = new Map<Skolform, Partial<Record<keyof Nyckeltal, number>>>([
    [
      "gr",
      {
        meritvärdeÅrskurs9: 240,
        andelGodkändaÅrskurs9: 92,
        andelBehörigaLärare: 85,
        eleverPerLärare: 11,
      },
    ],
    ["gy", { andelBehörigaLärare: 80, eleverPerLärare: 14 }],
  ]);
  return {
    kommunStats: [],
    beräknatRiks: { perSkolform, perProgram: new Map() },
    koncernIndex: new Map(),
    skolenkät: { skolenhetskod: "12345678", vårdnadshavare: [], elever: [] },
    dokumentgrupper: [],
    kommunEnkätGrupper: new Map(),
    riksEnkätGrupper: new Map(),
    ...overrides,
  };
}

describe("buildSkolaDetaljVy — riksgenomsnitt-pairing", () => {
  test("meritvärde compares against grundskolans bucket, the rest against the unit's statistikskolform", () => {
    const vy = buildSkolaDetaljVy(skola(), indata());
    const perKey = Object.fromEntries(
      vy.nyckeltal.map((rad) => [rad.key, rad]),
    ) as Record<string, (typeof vy.nyckeltal)[number]>;

    expect(perKey.meritvärdeÅrskurs9!.riksTal).toBe(240);
    expect(perKey.andelGodkändaÅrskurs9!.riksTal).toBe(92);
    // A grundskola's primärStatistikskolform is also "gr".
    expect(perKey.eleverPerLärare!.riksTal).toBe(11);
    expect(perKey.andelBehörigaLärare!.riksTal).toBe(85);
  });

  test("a gymnasieskola's behöriga/eleverPerLärare compare against the gy bucket", () => {
    const vy = buildSkolaDetaljVy(
      skola({
        skolformer: ["Gymnasieskola"],
        program: [
          {
            kod: "NA25",
            namn: "Naturvetenskapsprogrammet",
            antalElever: finns(120),
            nyckeltal: {
              lägstaAntagningspoäng: saknas(),
              genomsnittligAntagningspoäng: saknas(),
              andelMedExamenInom3År: saknas(),
              betygspoängMedExamen: saknas(),
              andelMedHögskolebehörighet: saknas(),
            },
          },
        ],
        gymnasieprogram: ["Naturvetenskapsprogrammet"],
      }),
      indata(),
    );
    const epl = vy.nyckeltal.find((rad) => rad.key === "eleverPerLärare")!;
    expect(epl.riksTal).toBe(14);
    // Which skolform the rikstal was read from is stated in the provenance.
    expect(epl.källa.some((rad) => rad.v.includes("gymnasieskola"))).toBe(true);
  });

  test("every paired figure carries beräknat — this source has no official rikstal", () => {
    const vy = buildSkolaDetaljVy(skola(), indata());
    expect(vy.harBeräknatRiks).toBe(true);
    expect(vy.nyckeltal.every((rad) => rad.beräknatRiks)).toBe(true);
  });

  test("a nyckeltal whose bucket has no figure compares against nothing, not zero", () => {
    const tomGr = new Map<Skolform, Partial<Record<keyof Nyckeltal, number>>>([
      ["gr", {}],
    ]);
    const vy = buildSkolaDetaljVy(
      skola(),
      indata({ beräknatRiks: { perSkolform: tomGr, perProgram: new Map() } }),
    );
    const merit = vy.nyckeltal.find((rad) => rad.key === "meritvärdeÅrskurs9")!;
    expect(merit.riksTal).toBeNull();
    expect(merit.diffRiks).toBeNull();
  });
});

describe("buildSkolaDetaljVy — åk 9-hiding regeln", () => {
  const åk9Rader = (vy: ReturnType<typeof buildSkolaDetaljVy>) =>
    vy.nyckeltal
      .filter(
        (rad) => rad.key === "meritvärdeÅrskurs9" || rad.key === "andelGodkändaÅrskurs9",
      )
      .map((rad) => rad.key);

  test("a grundskola reporting åk 9 keeps both rows", () => {
    const vy = buildSkolaDetaljVy(skola(), indata());
    expect(vy.nyckeltal).toHaveLength(4);
    expect(åk9Rader(vy)).toHaveLength(2);
  });

  test("a unit running gymnasieprogram hides them — meritvärdet belongs to grundskolan", () => {
    const vy = buildSkolaDetaljVy(
      skola({
        skolformer: ["Gymnasieskola"],
        gymnasieprogram: ["Naturvetenskapsprogrammet"],
        program: [
          {
            kod: "NA25",
            namn: "Naturvetenskapsprogrammet",
            antalElever: finns(120),
            nyckeltal: {
              lägstaAntagningspoäng: saknas(),
              genomsnittligAntagningspoäng: saknas(),
              andelMedExamenInom3År: saknas(),
              betygspoängMedExamen: saknas(),
              andelMedHögskolebehörighet: saknas(),
            },
          },
        ],
      }),
      indata(),
    );
    expect(vy.harProgram).toBe(true);
    expect(åk9Rader(vy)).toHaveLength(0);
  });

  test("an unreported åk 9 (saknas without läsår) hides them too", () => {
    const vy = buildSkolaDetaljVy(
      skola({
        nyckeltal: {
          meritvärdeÅrskurs9: saknas(),
          andelGodkändaÅrskurs9: saknas(),
          andelBehörigaLärare: finns(88),
          eleverPerLärare: finns(12),
        },
      }),
      indata(),
    );
    expect(åk9Rader(vy)).toHaveLength(0);
  });

  test("a saknas with a läsår is a historical figure, not an absent one — rows stay", () => {
    const vy = buildSkolaDetaljVy(
      skola({
        nyckeltal: {
          meritvärdeÅrskurs9: saknas("2023/24"),
          andelGodkändaÅrskurs9: saknas("2023/24"),
          andelBehörigaLärare: finns(88),
          eleverPerLärare: finns(12),
        },
      }),
      indata(),
    );
    expect(åk9Rader(vy)).toHaveLength(2);
  });
});

describe("buildSkolaDetaljVy — läsår och faktarader", () => {
  test("statistikLäsår is the latest across the shown rows; enkätLäsår dashes when empty", () => {
    const vy = buildSkolaDetaljVy(
      skola({
        nyckeltal: {
          meritvärdeÅrskurs9: finns(250, "2023/24"),
          andelGodkändaÅrskurs9: finns(95, "2024/25"),
          andelBehörigaLärare: finns(88, "2022/23"),
          eleverPerLärare: finns(12, "2024/25"),
        },
      }),
      indata(),
    );
    expect(vy.statistikLäsår).toBe("2024/25");
    expect(vy.enkätLäsår).toBe("—");
    expect(vy.harEnkät).toBe(false);
  });

  test("eleverPerLärare carries the row's own text, register spelling intact", () => {
    const vy = buildSkolaDetaljVy(skola(), indata());
    const rad = vy.nyckeltal.find((r) => r.key === "eleverPerLärare")!;
    expect(vy.eleverPerLärare).toBe(rad.value);
  });

  test("harSalsa follows whether the unit has SALSA data at all", () => {
    const utan = buildSkolaDetaljVy(skola(), indata());
    expect(utan.harSalsa).toBe(false);

    const med = buildSkolaDetaljVy(
      skola({ salsa: { period: "2024/25", matt: {} } }),
      indata(),
    );
    expect(med.harSalsa).toBe(true);
  });
});

describe("buildSkolaDetaljVy — koncernkedjan", () => {
  test("kedjan runs from koncernmoder down to the huvudman, slug derived from the name", () => {
    const koncern: HuvudmanKoncern = {
      koncernOrgNr: "5560001111",
      koncernNamn: "Acme Holding AB",
      antalFöretag: 7,
      asof: null,
      inaktuellt: false,
      träd: [
        {
          orgnr: "5560001111",
          namn: "Acme Holding AB",
          land: null,
          anstallda: null,
          bolagsstatus: null,
          barn: [
            {
              orgnr: "5567001234",
              namn: "Testskolan AB",
              land: null,
              anstallda: null,
              bolagsstatus: null,
              barn: [],
            },
          ],
        },
      ],
    };
    const vy = buildSkolaDetaljVy(
      skola(),
      indata({ koncernIndex: new Map([["5567001234", koncern]]) }),
    );
    expect(vy.kedja.map((nod) => nod.orgnr)).toEqual(["5560001111", "5567001234"]);
    expect(vy.koncernSlug).toBe("acme-holding-ab");
    expect(vy.huvudmanSlug).toBe("testskolan-ab");
  });

  test("no koncern membership means an empty chain and no slug", () => {
    const vy = buildSkolaDetaljVy(skola(), indata());
    expect(vy.kedja).toEqual([]);
    expect(vy.koncernSlug).toBeNull();
  });
});
