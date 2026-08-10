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
 * The API supplies no grade spans (see api-normalize), so `gradeSpanOf` is
 * always "" and the guard in selectSchools drops every unit. Pinned so the
 * behaviour is visible rather than looking like a filtering bug.
 */
describe("årskurs filtering against spanless API data", () => {
  test("selecting an årskurs currently matches nothing", () => {
    const rows = [school({ gradeSpan: "", stats: {} })];
    expect(selectSchools(rows, query({ arskurs: "F" })).sorted).toHaveLength(0);
  });

  test("but it matches when a span is actually present", () => {
    const rows = [school({ kod: "x", gradeSpan: "F–9" })];
    expect(kods(selectSchools(rows, query({ arskurs: "F" })).sorted)).toEqual(["x"]);
  });
});
