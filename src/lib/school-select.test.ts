import { describe, expect, test } from "bun:test";
import { parseSchoolQuery, type SchoolQuery } from "./query";
import type { ListSchool } from "./school-fields";
import { selectSchools } from "./school-select";

const school = (over: Partial<ListSchool> = {}): ListSchool => ({
  kod: "1",
  name: "Vasaskolan",
  huvudman: "Stockholms kommun",
  typ: "Kommunal",
  status: "Aktiv",
  kommunkod: "0180",
  kommun: "Stockholm",
  forms: ["GR"],
  otherForms: [],
  stats: {},
  students: 300,
  years: [],
  gradeSpan: "",
  programmes: [],
  ...over,
});

/** Queries are built through the real parser so defaults stay in sync. */
const query = (params: Record<string, string> = {}): SchoolQuery =>
  parseSchoolQuery(params);

const kods = (rows: ListSchool[]) => rows.map((r) => r.kod);

describe("status filtering", () => {
  const rows = [
    school({ kod: "aktiv", status: "Aktiv" }),
    school({ kod: "vilande", status: "Vilande" }),
    school({ kod: "upphord", status: "Upphörd" }),
  ];

  test("only running units by default", () => {
    expect(kods(selectSchools(rows, query()).sorted)).toEqual(["aktiv"]);
  });

  test("an explicit list is honoured", () => {
    const out = selectSchools(rows, query({ status: "Aktiv,Vilande" })).sorted;
    expect(kods(out).sort()).toEqual(["aktiv", "vilande"]);
  });

  test("an explicitly empty status matches nothing", () => {
    expect(selectSchools(rows, query({ status: "" })).sorted).toHaveLength(0);
  });
});

describe("kommun, type and search filtering", () => {
  const rows = [
    school({ kod: "sthlm", kommunkod: "0180", name: "Vasaskolan" }),
    school({ kod: "gbg", kommunkod: "1480", name: "Hvitfeldtska", typ: "Fristående" }),
  ];

  test("kommun narrows to that kommunkod", () => {
    expect(kods(selectSchools(rows, query({ kommun: "0180" })).sorted)).toEqual([
      "sthlm",
    ]);
  });

  test("no kommun means hela riket", () => {
    expect(selectSchools(rows, query()).sorted).toHaveLength(2);
  });

  test("type filtering", () => {
    expect(kods(selectSchools(rows, query({ typ: "Fristående" })).sorted)).toEqual([
      "gbg",
    ]);
  });

  test("search matches the unit name, case-insensitively", () => {
    expect(kods(selectSchools(rows, query({ q: "vasa" })).sorted)).toEqual(["sthlm"]);
    expect(kods(selectSchools(rows, query({ q: "VASA" })).sorted)).toEqual(["sthlm"]);
    // The term arrives untrimmed from the field — matching normalizes it.
    expect(kods(selectSchools(rows, query({ q: " vasa " })).sorted)).toEqual(["sthlm"]);
    // Whitespace on its own is not a filter.
    expect(selectSchools(rows, query({ q: "   " })).sorted).toEqual(
      selectSchools(rows, query({ q: "" })).sorted,
    );
  });

  test("search does not match the huvudman name", () => {
    expect(selectSchools(rows, query({ q: "Stockholms kommun" })).sorted).toHaveLength(0);
  });
});

describe("elevantal range", () => {
  const rows = [
    school({ kod: "small", students: 50 }),
    school({ kod: "big", students: 500 }),
    school({ kod: "unknown", students: null }),
  ];

  test("min and max are inclusive bounds", () => {
    expect(kods(selectSchools(rows, query({ min: "50", max: "50" })).sorted)).toEqual([
      "small",
    ]);
  });

  test("a unit with no reported elevantal is excluded once a bound is set", () => {
    expect(kods(selectSchools(rows, query({ min: "0" })).sorted).sort()).toEqual([
      "big",
      "small",
    ]);
  });

  test("with no bounds every unit is kept, including the unreported one", () => {
    expect(selectSchools(rows, query()).sorted).toHaveLength(3);
  });
});

describe("skolform filtering", () => {
  const rows = [
    school({ kod: "gr", forms: ["GR"] }),
    school({ kod: "gy", forms: ["GY"] }),
    school({ kod: "both", forms: ["GR", "GY"] }),
  ];

  test("a unit matches if it runs the form at all", () => {
    expect(kods(selectSchools(rows, query({ skolform: "GR" })).sorted).sort()).toEqual([
      "both",
      "gr",
    ]);
  });
});

/**
 * Each filter's own counts are computed with that filter excluded, so the
 * numbers next to a control show what picking it would give you rather than
 * collapsing to zero as soon as you narrow.
 */
describe("facet counts exclude their own filter", () => {
  const rows = [
    school({ kod: "k1", typ: "Kommunal" }),
    school({ kod: "k2", typ: "Kommunal" }),
    school({ kod: "f1", typ: "Fristående" }),
  ];

  test("type counts stay visible after selecting one type", () => {
    const out = selectSchools(rows, query({ typ: "Kommunal" }));
    expect(out.sorted).toHaveLength(2);
    expect(out.counts).toEqual({ Kommunal: 2, Fristående: 1 });
  });

  test("skolform chip counts reflect the rest of the filter", () => {
    const mixed = [
      school({ kod: "a", forms: ["GR"], typ: "Kommunal" }),
      school({ kod: "b", forms: ["GY"], typ: "Fristående" }),
    ];
    const out = selectSchools(mixed, query({ typ: "Kommunal" }));
    expect(out.formCounts.get("GR")).toBe(1);
    expect(out.formCounts.get("GY")).toBeUndefined();
  });

  test("status counts include a selected status even at zero", () => {
    const out = selectSchools(
      [school({ status: "Aktiv" })],
      query({ status: "Aktiv,Vilande" }),
    );
    const vilande = out.statusCounts.find((s) => s.status === "Vilande");
    expect(vilande).toEqual({ status: "Vilande", count: 0 });
  });
});

describe("kommun options", () => {
  test("resolves names and sorts them Swedish-alphabetically", () => {
    const rows = [
      school({ kod: "a", kommunkod: "1480" }),
      school({ kod: "b", kommunkod: "0180" }),
    ];
    const names = selectSchools(rows, query()).kommuner.map((k) => k.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "sv")));
  });

  test("a selected kommun always gets an entry, even when nothing matches", () => {
    const out = selectSchools(
      [school({ kommunkod: "0180", status: "Upphörd" })],
      query({ kommun: "1480" }),
    );
    expect(out.kommuner.some((k) => k.kod === "1480")).toBe(true);
  });

  test("units with no kommunkod are left out of the dropdown", () => {
    const out = selectSchools([school({ kommunkod: null })], query());
    expect(out.kommuner).toHaveLength(0);
  });
});

describe("gymnasieprogram chips", () => {
  const rows = [
    school({ kod: "a", forms: ["GY"], programmes: ["Naturvetenskap", "Teknik"] }),
    school({ kod: "b", forms: ["GY"], programmes: ["Teknik"] }),
  ];

  test("only populated with gymnasieskola selected", () => {
    expect(selectSchools(rows, query()).gymnasieprogram).toHaveLength(0);
  });

  test("counts how many units offer each programme", () => {
    const out = selectSchools(rows, query({ skolform: "GY" }));
    expect(out.gymnasieprogram).toEqual([
      { name: "Naturvetenskap", count: 1 },
      { name: "Teknik", count: 2 },
    ]);
  });

  test("filtering by programme keeps units offering any of them", () => {
    const out = selectSchools(rows, query({ skolform: "GY", program: "Naturvetenskap" }));
    expect(kods(out.sorted)).toEqual(["a"]);
  });
});

/**
 * The chips are spans ("1–3"); the register reports individual years. Chips
 * exist only per skolform, so every case here selects one — an `?arskurs=`
 * without a skolform is dropped by the parser (pinned in query.test.ts).
 *
 * Note the fixtures: a unit running F–9 has "0" in its unit-wide `years` but
 * not in `stats.GR.years`, because the register keys förskoleklass under
 * `fsk` → FKLASS. That is the whole reason grundskolan has no F chip.
 */
describe("årskurs filtering", () => {
  const grStats = (years: string[]) => ({
    GR: { years, gradeSpan: "", students: null, metrics: {} },
  });
  const rows = [
    school({ kod: "lag", years: ["0", "1", "2", "3"], stats: grStats(["1", "2", "3"]) }),
    school({ kod: "hog", years: ["7", "8", "9"], stats: grStats(["7", "8", "9"]) }),
    school({
      kod: "hela",
      years: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
      stats: grStats(["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
    }),
    school({ kod: "ingen", years: [], stats: grStats([]) }),
    school({ kod: "gy", forms: ["GY"], years: [] }),
  ];

  test("selecting nothing keeps every unit, including the yearless ones", () => {
    expect(selectSchools(rows, query()).sorted).toHaveLength(5);
  });

  test("a chip matches any unit that overlaps it, not only an exact span", () => {
    const out = selectSchools(rows, query({ skolform: "GR", arskurs: "1–3" }));
    expect(kods(out.sorted).sort()).toEqual(["hela", "lag"]);
  });

  test("several chips union rather than intersect", () => {
    const out = selectSchools(rows, query({ skolform: "GR", arskurs: "1–3,7–9" }));
    expect(kods(out.sorted).sort()).toEqual(["hela", "hog", "lag"]);
  });

  test("a chip only one unit covers narrows to it", () => {
    const out = selectSchools(rows, query({ skolform: "GR", arskurs: "4–6" }));
    expect(kods(out.sorted)).toEqual(["hela"]);
  });

  /**
   * Grundskolan declares no "F" chip, so a hand-written `?arskurs=F` drops the
   * param rather than emptying the list: `stats.GR.years` never contains "0",
   * so an F chip would match nothing, not even a unit running F–9. Filtering
   * on förskoleklass is the FKLASS skolform's job. Do not add the chip back.
   */
  test("an F chip on grundskolan is dropped rather than matching nothing", () => {
    expect(query({ skolform: "GR", arskurs: "F" }).arskurs).toEqual([]);

    const out = selectSchools(rows, query({ skolform: "GR", arskurs: "F" }));
    expect(kods(out.sorted).sort()).toEqual(["hela", "hog", "ingen", "lag"]);
  });

  /**
   * Skolverket reports years only for förskoleklass, grundskola and anpassad
   * grundskola, and even there a unit may be missing from the årskurs data.
   * Such a unit matches no chip — the honest answer to "does it teach year 5",
   * but it does mean picking any chip drops it silently.
   */
  test("a unit with no reported years is excluded once any chip is picked", () => {
    const out = selectSchools(rows, query({ skolform: "GR", arskurs: "1–3,4–6,7–9" }));
    expect(kods(out.sorted)).not.toContain("ingen");
  });

  test("years are read per skolform when one is selected", () => {
    const mixed = [
      school({
        kod: "both",
        forms: ["GR", "GY"],
        years: ["1", "2", "3"],
        stats: {
          GR: { years: ["1", "2", "3"], gradeSpan: "1–3", students: null, metrics: {} },
          GY: { years: [], gradeSpan: "", students: null, metrics: {} },
        },
      }),
    ];
    expect(
      selectSchools(mixed, query({ skolform: "GR", arskurs: "1–3" })).sorted,
    ).toHaveLength(1);
  });

  /**
   * The safety net for the gymnasium case: `parseSchoolQuery` validates chips
   * against the selected skolform's own `gradeFilter`, and gymnasieskola
   * declares none. A hand-written `?skolform=GY&arskurs=1–3` therefore drops
   * the årskurs param entirely instead of quietly emptying the list.
   */
  test("an årskurs param is discarded for a skolform that has no chips", () => {
    expect(query({ skolform: "GY", arskurs: "1–3" }).arskurs).toEqual([]);

    const gymnasier = [school({ kod: "gy", forms: ["GY"], years: [] })];
    const out = selectSchools(gymnasier, query({ skolform: "GY", arskurs: "1–3" }));
    expect(kods(out.sorted)).toEqual(["gy"]);
  });
});
