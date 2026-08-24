import { describe, expect, test } from "bun:test";
import { koncernSortValue, selectKoncern } from "./koncern-select";
import { parseKoncernQuery, type KoncernQuery } from "./query";
import type { KoncernGroup } from "@/lib/skolregister";
import type { HuvudmanRad } from "@/lib/skolregister";

const dotterbolag = (over: Partial<HuvudmanRad> = {}): HuvudmanRad => ({
  organisationsnummer: "556000-0001",
  namn: "Bolaget AB",
  typ: "Fristående",
  bolagsform: "Aktiebolag",
  koncern: null,
  kommuner: ["Stockholm"],
  skolformer: ["Grundskola"],
  antalEnheter: 2,
  antalElever: 300,
  // No collector addresses in a hand-written fixture; the sources these
  // point at are the Källor section's business, not this file's.
  källor: { koncern: null, bolagsuppgifter: null, årsredovisningar: null },
  ...over,
});

const group = (over: Partial<KoncernGroup> = {}): KoncernGroup => ({
  slug: "koncernen",
  namn: "Koncernen AB",
  orgNr: "556900-0000",
  antalFöretag: 4,
  asof: null,
  inaktuellt: false,
  träd: [],
  dotterbolag: [dotterbolag()],
  ...over,
});

const query = (params: Record<string, string> = {}): KoncernQuery =>
  parseKoncernQuery(params);

const names = (rows: { group: KoncernGroup }[]) => rows.map((r) => r.group.namn);

describe("aggregation", () => {
  test("sums enheter and elever across the koncern's dotterbolag", () => {
    const g = group({
      dotterbolag: [
        dotterbolag({ antalEnheter: 2, antalElever: 300 }),
        dotterbolag({
          organisationsnummer: "556000-0002",
          antalEnheter: 3,
          antalElever: 400,
        }),
      ],
    });
    const rows = selectKoncern([g], query()).rows;
    expect(rows[0].enheter).toBe(5);
    expect(rows[0].elever).toBe(700);
  });

  test("kommuner and skolformer are deduped across dotterbolag", () => {
    const g = group({
      dotterbolag: [
        dotterbolag({ kommuner: ["Stockholm"], skolformer: ["Grundskola"] }),
        dotterbolag({
          organisationsnummer: "556000-0002",
          kommuner: ["Stockholm", "Uppsala"],
          skolformer: ["Grundskola", "Gymnasieskola"],
        }),
      ],
    });
    const rows = selectKoncern([g], query()).rows;
    expect(rows[0].kommuner).toEqual(["Stockholm", "Uppsala"]);
    expect(rows[0].skolformer.sort()).toEqual(["Grundskola", "Gymnasieskola"].sort());
  });
});

describe("filtering", () => {
  const groups = [
    group({ namn: "Stor koncern", slug: "stor", orgNr: "556900-0001" }),
    group({
      namn: "Liten koncern",
      slug: "liten",
      orgNr: "556900-0002",
      dotterbolag: [
        dotterbolag({
          antalEnheter: 1,
          antalElever: 50,
          skolformer: ["Gymnasieskola"],
        }),
      ],
    }),
  ];

  test("search matches the koncern name", () => {
    expect(names(selectKoncern(groups, query({ q: " stor " })).rows)).toEqual([
      "Stor koncern",
    ]);
  });

  test("search also matches the org.nr", () => {
    expect(names(selectKoncern(groups, query({ q: "0002" })).rows)).toEqual([
      "Liten koncern",
    ]);
  });

  test("selecting a skolform drops koncerner with no dotterbolag in it", () => {
    expect(names(selectKoncern(groups, query({ skolform: "GY" })).rows)).toEqual([
      "Liten koncern",
    ]);
  });

  test("enheter range filters on the summed enheter", () => {
    expect(names(selectKoncern(groups, query({ minEnheter: "2" })).rows)).toEqual([
      "Stor koncern",
    ]);
  });

  test("elever range filters on the summed elever", () => {
    expect(names(selectKoncern(groups, query({ maxElever: "100" })).rows)).toEqual([
      "Liten koncern",
    ]);
  });
});

describe("koncernSortValue", () => {
  const row = {
    group: group({ namn: "A" }),
    enheter: 2,
    elever: 100,
    kommuner: ["Stockholm"],
    skolformer: ["Grundskola"],
  };

  test("maps each column", () => {
    expect(koncernSortValue(row, "namn")).toBe("A");
    expect(koncernSortValue(row, "enheter")).toBe(2);
    expect(koncernSortValue(row, "huvudman")).toBe(1);
    expect(koncernSortValue(row, "kommuner")).toBe(1);
    expect(koncernSortValue(row, "elever")).toBe(100);
  });

  test("an unknown key sorts nothing rather than quietly sorting by elever", () => {
    // `resolveKoncernSort` in `query.ts` has already rejected any key the
    // list does not offer, so reaching this means a column was made sortable
    // without being registered there. `undefined` sends every row to the same
    // place, which looks like a sort that did nothing; the old fallback to
    // elever looked like a sort that worked.
    expect(koncernSortValue(row, "whatever")).toBeUndefined();
  });
});

describe("sorting", () => {
  const groups = [
    group({
      namn: "Stor",
      slug: "stor",
      dotterbolag: [dotterbolag({ antalElever: 900 })],
    }),
    group({
      namn: "Liten",
      slug: "liten",
      orgNr: "556900-0002",
      dotterbolag: [dotterbolag({ antalElever: 100 })],
    }),
  ];

  test("defaults to most elever first", () => {
    expect(names(selectKoncern(groups, query()).rows)).toEqual(["Stor", "Liten"]);
  });

  test("sorts by namn ascending on request", () => {
    const rows = selectKoncern(groups, query({ sort: "namn", dir: "asc" })).rows;
    expect(names(rows)).toEqual(["Liten", "Stor"]);
  });
});
