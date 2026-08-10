import { describe, expect, test } from "bun:test";
import {
  gradeSpanOf,
  metricNumberOf,
  schoolSortValue,
  sortSchools,
  studentsOf,
  type ListSchool,
} from "./school-fields";

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
  gradeSpan: "F–9",
  programmes: [],
  ...over,
});

const withStats = (over: Partial<ListSchool>, gr = {}, gy = {}): ListSchool =>
  school({
    forms: ["GR", "GY"],
    stats: {
      GR: {
        gradeSpan: "F–9",
        students: { raw: "200", value: 200, missing: null },
        metrics: {},
        ...gr,
      },
      GY: {
        gradeSpan: "",
        students: { raw: "100", value: 100, missing: null },
        metrics: {},
        ...gy,
      },
    },
    ...over,
  });

/**
 * Every figure is qualified by skolform: "elever" at a unit running both
 * grundskola and gymnasium is two different numbers, and comparing across
 * forms is meaningless.
 */
describe("studentsOf", () => {
  test("without a form, the unit-wide figure", () => {
    expect(studentsOf(withStats({ students: 300 }))).toBe(300);
  });

  test("with a form, that form's own figure", () => {
    const s = withStats({ students: 300 });
    expect(studentsOf(s, "GR")).toBe(200);
    expect(studentsOf(s, "GY")).toBe(100);
  });

  test("null for a form the unit does not run", () => {
    expect(studentsOf(withStats({}), "VUX")).toBeNull();
  });

  test("null, not 0, when the unit reports nothing", () => {
    expect(studentsOf(school({ students: null }))).toBeNull();
  });
});

describe("gradeSpanOf", () => {
  test("falls back to an empty string rather than undefined", () => {
    expect(gradeSpanOf(school({ gradeSpan: "" }))).toBe("");
    expect(gradeSpanOf(withStats({}), "GY")).toBe("");
    expect(gradeSpanOf(withStats({}), "VUX")).toBe("");
  });

  test("prefers the form's span when a form is given", () => {
    expect(gradeSpanOf(withStats({ gradeSpan: "F–9" }), "GR")).toBe("F–9");
  });
});

describe("metricNumberOf", () => {
  test("null without a form, since metrics are only comparable within one", () => {
    expect(metricNumberOf(withStats({}), undefined, "meritvarde")).toBeNull();
  });

  test("reads the form's metric when present", () => {
    const s = withStats(
      {},
      { metrics: { meritvarde: { raw: "215", value: 215, missing: null } } },
    );
    expect(metricNumberOf(s, "GR", "meritvarde")).toBe(215);
  });

  test("null for a metric the form does not report", () => {
    expect(metricNumberOf(withStats({}), "GR", "saknas")).toBeNull();
  });
});

describe("schoolSortValue", () => {
  test("maps the identity columns", () => {
    const s = school();
    expect(schoolSortValue(s, "name")).toBe("Vasaskolan");
    expect(schoolSortValue(s, "huvudman")).toBe("Stockholms kommun");
    expect(schoolSortValue(s, "kommun")).toBe("Stockholm");
    expect(schoolSortValue(s, "status")).toBe("Aktiv");
  });

  test("a missing figure is undefined — never a low value", () => {
    expect(schoolSortValue(school({ students: null }), "elever")).toBeUndefined();
    expect(schoolSortValue(school({ kommun: null }), "kommun")).toBeUndefined();
  });

  test("an unknown key is read as a metric of the selected form", () => {
    const s = withStats({}, { metrics: { x: { raw: "5", value: 5, missing: null } } });
    expect(schoolSortValue(s, "x", "GR")).toBe(5);
    expect(schoolSortValue(s, "x")).toBeUndefined();
  });
});

describe("sortSchools", () => {
  const rows = [
    school({ kod: "b", name: "Björkskolan", students: 100 }),
    school({ kod: "a", name: "Almskolan", students: 300 }),
    school({ kod: "c", name: "Cederskolan", students: 200 }),
  ];

  test("sorts ascending by default and descending on request", () => {
    expect(sortSchools(rows, "elever").map((r) => r.kod)).toEqual(["b", "c", "a"]);
    expect(sortSchools(rows, "elever", undefined, true).map((r) => r.kod)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  test("does not mutate the input array", () => {
    const order = rows.map((r) => r.kod);
    sortSchools(rows, "elever");
    expect(rows.map((r) => r.kod)).toEqual(order);
  });

  test("collates Swedish letters after z, not as accented a/o", () => {
    const swedish = [
      school({ kod: "ä", name: "Ängsskolan" }),
      school({ kod: "a", name: "Almskolan" }),
      school({ kod: "ö", name: "Öskolan" }),
    ];
    expect(sortSchools(swedish, "name").map((r) => r.kod)).toEqual(["a", "ä", "ö"]);
  });

  /** A blank is "not reported", not a zero — so it sorts last either way. */
  describe("rows with no value sort last in both directions", () => {
    const mixed = [
      school({ kod: "none", name: "Utan", students: null }),
      school({ kod: "low", name: "Låg", students: 10 }),
      school({ kod: "high", name: "Hög", students: 90 }),
    ];

    test("ascending", () => {
      expect(sortSchools(mixed, "elever").map((r) => r.kod)).toEqual([
        "low",
        "high",
        "none",
      ]);
    });

    test("descending", () => {
      expect(sortSchools(mixed, "elever", undefined, true).map((r) => r.kod)).toEqual([
        "high",
        "low",
        "none",
      ]);
    });
  });

  test("ties break by name so the order is stable and predictable", () => {
    const tied = [
      school({ kod: "z", name: "Ö", students: 100 }),
      school({ kod: "a", name: "A", students: 100 }),
    ];
    expect(sortSchools(tied, "elever").map((r) => r.kod)).toEqual(["a", "z"]);
    // Even reversed: the tiebreak is not itself inverted.
    expect(sortSchools(tied, "elever", undefined, true).map((r) => r.kod)).toEqual([
      "a",
      "z",
    ]);
  });
});
