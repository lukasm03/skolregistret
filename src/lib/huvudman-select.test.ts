import { describe, expect, test } from "bun:test";
import { huvudmanSortValue, selectHuvudman } from "./huvudman-select";
import { parseHuvudmanQuery, type HuvudmanQuery } from "./query";
import type { ListSchool } from "./school-fields";
import type { Huvudman } from "./types";

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
  students: 100,
  years: [],
  gradeSpan: "",
  programmes: [],
  ...over,
});

const huvudman = (over: Partial<Huvudman> = {}): Huvudman => ({
  slug: "stockholms-kommun",
  name: "Stockholms kommun",
  typ: "Kommunal",
  org: "212000-0142",
  koncern: null,
  ...over,
});

const query = (params: Record<string, string> = {}): HuvudmanQuery =>
  parseHuvudmanQuery(params);

const names = (rows: { huvudman: Huvudman }[]) => rows.map((r) => r.huvudman.name);

describe("aggregation", () => {
  const hs = [huvudman({ name: "A", slug: "a" }), huvudman({ name: "B", slug: "b" })];
  const schools = [
    school({ kod: "1", huvudman: "A", students: 100 }),
    school({ kod: "2", huvudman: "A", students: 200 }),
    school({ kod: "3", huvudman: "B", students: 300 }),
  ];

  test("counts units and sums pupils per huvudman", () => {
    const rows = selectHuvudman(hs, schools, query()).rows;
    const a = rows.find((r) => r.huvudman.name === "A")!;
    expect(a.enheter).toBe(2);
    expect(a.elever).toBe(300);
  });

  test("only running units count toward the aggregate", () => {
    const withClosed = [
      ...schools,
      school({ kod: "4", huvudman: "A", status: "Upphörd" }),
    ];
    const a = selectHuvudman(hs, withClosed, query()).rows.find(
      (r) => r.huvudman.name === "A",
    )!;
    expect(a.enheter).toBe(2);
  });
});

describe("filtering", () => {
  const hs = [
    huvudman({ name: "Kommunen", slug: "kommunen", typ: "Kommunal" }),
    huvudman({
      name: "Friskolan",
      slug: "friskolan",
      typ: "Fristående",
      org: "556000-0001",
      koncern: "Academedia",
    }),
  ];
  const schools = [
    school({ kod: "1", huvudman: "Kommunen" }),
    school({ kod: "2", huvudman: "Friskolan", typ: "Fristående" }),
  ];

  test("by type", () => {
    expect(names(selectHuvudman(hs, schools, query({ typ: "Fristående" })).rows)).toEqual(
      ["Friskolan"],
    );
  });

  test("koncern=1 keeps only huvudmän in a koncern", () => {
    expect(names(selectHuvudman(hs, schools, query({ koncern: "1" })).rows)).toEqual([
      "Friskolan",
    ]);
  });

  test("search matches the name", () => {
    // Untrimmed, as it comes from the field — see `parseSchoolQuery`.
    expect(names(selectHuvudman(hs, schools, query({ q: " fri " })).rows)).toEqual(
      names(selectHuvudman(hs, schools, query({ q: "fri" })).rows),
    );
    expect(names(selectHuvudman(hs, schools, query({ q: "fri" })).rows)).toEqual([
      "Friskolan",
    ]);
  });

  test("search also matches the organisationsnummer", () => {
    const rows = selectHuvudman(hs, schools, query({ q: "212000" })).rows;
    expect(names(rows)).toEqual(["Kommunen"]);
  });

  test("a kommun filter drops huvudmän running nothing there", () => {
    const elsewhere = [
      school({ kod: "1", huvudman: "Kommunen", kommunkod: "0180" }),
      school({ kod: "2", huvudman: "Friskolan", kommunkod: "1480", typ: "Fristående" }),
    ];
    expect(names(selectHuvudman(hs, elsewhere, query({ kommun: "0180" })).rows)).toEqual([
      "Kommunen",
    ]);
  });

  test("selecting a skolform drops huvudmän with no units in it", () => {
    const byForm = [
      school({ kod: "1", huvudman: "Kommunen", forms: ["GR"] }),
      school({ kod: "2", huvudman: "Friskolan", forms: ["GY"], typ: "Fristående" }),
    ];
    expect(names(selectHuvudman(hs, byForm, query({ skolform: "GR" })).rows)).toEqual([
      "Kommunen",
    ]);
  });
});

describe("huvudmanSortValue", () => {
  const row = {
    huvudman: huvudman({ name: "A", koncern: null }),
    units: [],
    enheter: 2,
    elever: 100,
  };

  test("maps each column", () => {
    expect(huvudmanSortValue(row, "name")).toBe("A");
    expect(huvudmanSortValue(row, "typ")).toBe("Kommunal");
    expect(huvudmanSortValue(row, "enheter")).toBe(2);
    expect(huvudmanSortValue(row, "elever")).toBe(100);
  });

  test("missing figures are undefined so they sort last, not first", () => {
    expect(huvudmanSortValue(row, "koncern")).toBeUndefined();
  });

  test("an unknown key sorts nothing rather than quietly sorting by elever", () => {
    // `resolveHuvudmanSort` in `query.ts` has already rejected any key the
    // list does not offer, so reaching this means a column was made sortable
    // without being registered there. `undefined` sends every row to the same
    // place, which looks like a sort that did nothing; the old fallback to
    // elever looked like a sort that worked.
    expect(huvudmanSortValue(row, "whatever")).toBeUndefined();
  });
});

describe("sorting", () => {
  const hs = [
    huvudman({ name: "Stor", slug: "stor" }),
    huvudman({ name: "Liten", slug: "liten" }),
    huvudman({ name: "Tom", slug: "tom" }),
  ];
  const schools = [
    school({ kod: "1", huvudman: "Stor", students: 900 }),
    school({ kod: "2", huvudman: "Liten", students: 100 }),
  ];

  test("defaults to most pupils first", () => {
    expect(names(selectHuvudman(hs, schools, query()).rows).slice(0, 2)).toEqual([
      "Stor",
      "Liten",
    ]);
  });

  test("sorts by name ascending on request", () => {
    const rows = selectHuvudman(hs, schools, query({ sort: "name", dir: "asc" })).rows;
    expect(names(rows)).toEqual(["Liten", "Stor", "Tom"]);
  });

  test("a huvudman with no units still appears, with zero counts", () => {
    const tom = selectHuvudman(hs, schools, query()).rows.find(
      (r) => r.huvudman.name === "Tom",
    )!;
    expect(tom.enheter).toBe(0);
    expect(tom.elever).toBe(0);
  });
});
