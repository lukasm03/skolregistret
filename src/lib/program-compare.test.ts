import { describe, expect, test } from "bun:test";
import {
  buildProgramComparisons,
  nextProgramSort,
  sortProgramComparisons,
  sumProgramElever,
  type ProgramComparison,
} from "./program-compare";
import type {
  NationelltProgramGenomsnitt,
  NyckeltalVärde,
  ProgramNyckeltalKey,
  SkolaProgram,
} from "./skolregister";

/** A reported figure, with the register's own text kept distinct from its number. */
const finns = (tal: number, text = String(tal).replace(".", ",")): NyckeltalVärde => ({
  status: "finns",
  text,
  tal,
  läsår: "2024/25",
});

const saknas: NyckeltalVärde = {
  status: "saknas",
  förklaring: "uppgift saknas",
  läsår: null,
};

/** Figures in `programmetriker` order: elever, lägsta, medel, examen, betyg, högsk. */
function program(
  kod: string,
  namn: string,
  [elever, lägsta, medel, examen, betyg, högsk]: (number | null)[],
): SkolaProgram {
  const v = (n: number | null | undefined) => (n == null ? saknas : finns(n));
  return {
    kod,
    namn,
    antalElever: v(elever),
    nyckeltal: {
      lägstaAntagningspoäng: v(lägsta),
      genomsnittligAntagningspoäng: v(medel),
      andelMedExamenInom3År: v(examen),
      betygspoängMedExamen: v(betyg),
      andelMedHögskolebehörighet: v(högsk),
    },
  };
}

/**
 * The national endpoint reports every metric, present or not, so the fixture
 * fills the ones a test does not name with "saknas" rather than leaving holes
 * the type would not allow.
 */
function riks(
  ...entries: [string, Partial<Record<ProgramNyckeltalKey, NyckeltalVärde>>][]
): Map<string, NationelltProgramGenomsnitt> {
  return new Map(
    entries.map(([kod, values]) => [
      kod,
      {
        skolform: "gy",
        programkod: kod,
        nyckeltal: {
          antalElever: values.antalElever ?? saknas,
          lägstaAntagningspoäng: values.lägstaAntagningspoäng ?? saknas,
          genomsnittligAntagningspoäng: values.genomsnittligAntagningspoäng ?? saknas,
          andelMedExamenInom3År: values.andelMedExamenInom3År ?? saknas,
          betygspoängMedExamen: values.betygspoängMedExamen ?? saknas,
          andelMedHögskolebehörighet: values.andelMedHögskolebehörighet ?? saknas,
        },
      },
    ]),
  );
}

const noRiks = riks();
const noBeräknat = new Map<string, Partial<Record<ProgramNyckeltalKey, number>>>();

const cellFor = (row: ProgramComparison, key: ProgramNyckeltalKey) =>
  row.cells.find((c) => c.metrik.key === key)!;

describe("buildProgramComparisons", () => {
  test("puts riket beside each figure instead of on a row of its own", () => {
    const [row] = buildProgramComparisons(
      [program("NA", "Naturvetenskap", [320, 197.5, 285.8, 81.4, 16.9, 92.2])],
      riks(["NA", { genomsnittligAntagningspoäng: finns(281.9, "281,9") }]),
      noBeräknat,
    );
    const medel = cellFor(row, "genomsnittligAntagningspoäng");
    expect(medel.riksText).toBe("281,9");
    expect(medel.diff).toBeCloseTo(3.9, 5);
  });

  test("compares numbers, never the strings the register renders", () => {
    // "cirka 330" is a rounded figure and must stay that on screen, but the
    // difference has to come off `tal` — parsing the text back would present
    // an approximation as exact.
    const [row] = buildProgramComparisons(
      [program("NA", "Naturvetenskap", [330, null, null, null, null, null])],
      riks(["NA", { antalElever: finns(96.1, "96,1") }]),
      noBeräknat,
    );
    const elever = cellFor(row, "antalElever");
    expect(elever.text).toBe("330");
    expect(elever.diff).toBeCloseTo(233.9, 5);
  });

  test("keeps Skolverket's own text but falls back to our computed average", () => {
    const [row] = buildProgramComparisons(
      [program("NA", "Naturvetenskap", [null, null, 285.8, null, null, null])],
      noRiks,
      new Map([["NA", { genomsnittligAntagningspoäng: 281.94 }]]),
    );
    const medel = cellFor(row, "genomsnittligAntagningspoäng");
    // Formatted by us, so one decimal — it is not the register's own string.
    expect(medel.riksText).toBe("281,9");
    expect(medel.riksTal).toBeCloseTo(281.94, 5);
  });

  test("a missing figure on either side leaves nothing to compare", () => {
    const [row] = buildProgramComparisons(
      [program("IM", "Yrkesintroduktion", [30, null, null, null, null, null])],
      riks(["IM", { andelMedExamenInom3År: finns(8.8, "8,8") }]),
      noBeräknat,
    );
    const examen = cellFor(row, "andelMedExamenInom3År");
    expect(examen.text).toBe("—");
    expect(examen.diff).toBeNull();
    expect(examen.t).toBeNull();
  });
});

describe("the deviation the bar is drawn from", () => {
  test("is the difference over a fixed share of the metric's domain", () => {
    // betygspoäng: domain [10, 20], span 18% = 1.8. A difference of 0.9 is
    // half a bar.
    const [row] = buildProgramComparisons(
      [program("SA", "Samhäll", [null, null, null, null, 15.8, null])],
      riks(["SA", { betygspoängMedExamen: finns(14.9, "14,9") }]),
      noBeräknat,
    );
    expect(cellFor(row, "betygspoängMedExamen").t).toBeCloseTo(0.5, 5);
  });

  test("clamps at a full bar in both directions", () => {
    const [over] = buildProgramComparisons(
      [program("A", "A", [null, null, null, null, 19, null])],
      riks(["A", { betygspoängMedExamen: finns(14) }]),
      noBeräknat,
    );
    const [under] = buildProgramComparisons(
      [program("A", "A", [null, null, null, null, 11, null])],
      riks(["A", { betygspoängMedExamen: finns(16) }]),
      noBeräknat,
    );
    expect(cellFor(over, "betygspoängMedExamen").t).toBe(1);
    expect(cellFor(under, "betygspoängMedExamen").t).toBe(-1);
  });
});

describe("the default order", () => {
  test("is by how the programme stands against riket, strongest first", () => {
    const rows = buildProgramComparisons(
      [
        program("SVAG", "Svag", [null, null, null, null, 14.0, null]),
        program("STARK", "Stark", [null, null, null, null, 17.0, null]),
      ],
      riks(
        ["SVAG", { betygspoängMedExamen: finns(15) }],
        ["STARK", { betygspoängMedExamen: finns(15) }],
      ),
      noBeräknat,
    );
    expect(rows.map((r) => r.namn)).toEqual(["Stark", "Svag"]);
  });

  test("counts only the measures that have a better direction", () => {
    // Elevantal is far above riket, but a big programme is not a good one, so
    // it must not contribute to the score at all.
    const [row] = buildProgramComparisons(
      [program("NA", "Naturvetenskap", [320, null, null, null, null, null])],
      riks(["NA", { antalElever: finns(96.1) }]),
      noBeräknat,
    );
    expect(row.score).toBeNull();
  });

  test("puts a programme with nothing to compare last, not first", () => {
    const rows = buildProgramComparisons(
      [
        program("IM", "Introduktionsprogram", [20, null, null, null, null, null]),
        program("NA", "Naturvetenskap", [null, null, null, null, 16.9, null]),
      ],
      riks(["NA", { betygspoängMedExamen: finns(16.4) }]),
      noBeräknat,
    );
    expect(rows.map((r) => r.namn)).toEqual(["Naturvetenskap", "Introduktionsprogram"]);
  });
});

describe("sorting by a column", () => {
  const rows = buildProgramComparisons(
    [
      program("B", "B", [40, null, null, null, null, null]),
      program("A", "A", [320, null, null, null, null, null]),
      program("C", "C", [null, null, null, null, null, null]),
    ],
    noRiks,
    noBeräknat,
  );

  test("orders by the figure, and never lets a missing one lead", () => {
    expect(
      sortProgramComparisons(rows, { key: "antalElever", dir: "desc" }).map(
        (r) => r.namn,
      ),
    ).toEqual(["A", "B", "C"]);
    expect(
      sortProgramComparisons(rows, { key: "antalElever", dir: "asc" }).map((r) => r.namn),
    ).toEqual(["B", "A", "C"]);
  });

  test("breaks ties by name, so the order never wobbles between renders", () => {
    const tied = buildProgramComparisons(
      [
        program("Ö", "Östra", [100, null, null, null, null, null]),
        program("A", "Alfa", [100, null, null, null, null, null]),
      ],
      noRiks,
      noBeräknat,
    );
    expect(
      sortProgramComparisons(tied, { key: "antalElever", dir: "desc" }).map(
        (r) => r.namn,
      ),
    ).toEqual(["Alfa", "Östra"]);
  });
});

describe("nextProgramSort", () => {
  test("cycles highest first, then lowest, then back to the default order", () => {
    const first = nextProgramSort(null, "betygspoängMedExamen");
    expect(first).toEqual({ key: "betygspoängMedExamen", dir: "desc" });
    const second = nextProgramSort(first, "betygspoängMedExamen");
    expect(second).toEqual({ key: "betygspoängMedExamen", dir: "asc" });
    expect(nextProgramSort(second, "betygspoängMedExamen")).toBeNull();
  });

  test("a different column starts its own cycle rather than inheriting one", () => {
    expect(
      nextProgramSort({ key: "antalElever", dir: "asc" }, "betygspoängMedExamen"),
    ).toEqual({ key: "betygspoängMedExamen", dir: "desc" });
  });
});

describe("sumProgramElever", () => {
  test("adds up what the programmes report when the unit reports nothing", () => {
    expect(
      sumProgramElever([
        program("A", "A", [160, null, null, null, null, null]),
        program("B", "B", [40, null, null, null, null, null]),
      ]),
    ).toBe(200);
  });

  test("is null rather than 0 when no programme has a figure", () => {
    // 0 would be a claim about the school; null says we were not told.
    expect(
      sumProgramElever([program("A", "A", [null, null, null, null, null, null])]),
    ).toBeNull();
    expect(sumProgramElever([])).toBeNull();
  });
});
