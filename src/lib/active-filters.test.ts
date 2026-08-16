import { describe, expect, test } from "bun:test";
import {
  activeHuvudmanFilters,
  activeSchoolFilters,
  clearAllPatch,
} from "./active-filters";
import { parseHuvudmanQuery, parseSchoolQuery } from "./query";

/** Filters are read off a parsed query, so the fixtures are query strings. */
const school = (search: string) =>
  activeSchoolFilters(parseSchoolQuery(Object.fromEntries(new URLSearchParams(search))), {
    kommun: "Uppsala",
    huvudman: "Uppsala kommun",
    skolform: "Grundskola",
  });

const huvudman = (search: string) =>
  activeHuvudmanFilters(
    parseHuvudmanQuery(Object.fromEntries(new URLSearchParams(search))),
    { kommun: "Uppsala", skolform: "Grundskola" },
  );

describe("activeSchoolFilters", () => {
  test("an untouched list has nothing to show", () => {
    expect(school("")).toEqual([]);
  });

  test("the defaults do not count as filters", () => {
    // Both huvudmannatyper and status=Aktiv are what you get without asking.
    expect(school("typ=Kommunal,Fristående&status=Aktiv")).toEqual([]);
  });

  test("a filter is labelled with the name, not the code", () => {
    expect(school("kommun=0380")).toEqual([
      { key: "kommun", label: "Kommun", value: "Uppsala", clear: { kommun: null } },
    ]);
  });

  test("selecting nothing is reported as such, not as unset", () => {
    // An empty status matches no unit at all — the case worth naming, since
    // an empty list otherwise looks like a data problem.
    const [status] = school("status=");
    expect(status.value).toBe("ingen vald");
  });

  test("clearing the skolform clears what hung off it", () => {
    const [form] = school("skolform=GR&arskurs=4-6&sort=meritvarde");
    expect(form.clear).toEqual({
      skolform: null,
      arskurs: null,
      program: null,
      sort: null,
      dir: null,
    });
  });

  test("an elevintervall reads as a range, or as the bound that is set", () => {
    expect(school("min=50&max=200")[0].value).toBe("50–200");
    expect(school("min=50")[0].value).toBe("från 50");
    expect(school("max=200")[0].value).toBe("upp till 200");
  });

  test("programmes collapse to a count once there is more than one", () => {
    expect(school("skolform=GY&program=Naturvetenskap")[1].value).toBe("Naturvetenskap");
    expect(school("skolform=GY&program=Naturvetenskap,Teknik")[1].value).toBe("2 valda");
  });

  test("statuses are listed in the register's order, not the URL's", () => {
    expect(school("status=Avvecklad,Aktiv")[0].value).toBe("Aktiv, Avvecklad");
  });

  test("tokens come in the order the sidebar lists their controls", () => {
    const keys = school("q=skola&kommun=0380&skolform=GR&typ=Kommunal&min=10").map(
      (f) => f.key,
    );
    expect(keys).toEqual(["q", "kommun", "skolform", "typ", "elever"]);
  });

  test("a half-typed term is a token, whitespace alone is not", () => {
    expect(school("q=vasa ")[0]).toMatchObject({ key: "q", value: "vasa" });
    expect(school("q=%20%20")).toEqual([]);
  });
});

describe("activeHuvudmanFilters", () => {
  // Each token has to name the sidebar heading that produced it, and the two
  // pages head this filter differently.
  test("the typ token reads back this page's own heading", () => {
    expect(huvudman("typ=Kommunal")[0]).toMatchObject({
      key: "typ",
      label: "Typ",
    });
    expect(school("typ=Kommunal")[0]).toMatchObject({
      key: "typ",
      label: "Huvudmannatyp",
    });
  });

  test("the koncern toggle shows what it is doing", () => {
    expect(huvudman("koncern=1")).toEqual([
      {
        key: "koncern",
        label: "Koncern",
        value: "endast koncernbolag",
        clear: { koncern: null },
      },
    ]);
  });
});

describe("clearAllPatch", () => {
  test("removes every param the tokens own, and the page with them", () => {
    expect(clearAllPatch(school("kommun=0380&skolform=GR&arskurs=4-6&min=5"))).toEqual({
      kommun: null,
      skolform: null,
      arskurs: null,
      program: null,
      sort: null,
      dir: null,
      min: null,
      max: null,
      page: null,
    });
  });

  test("is empty when there is nothing to clear", () => {
    expect(clearAllPatch([])).toEqual({ page: null });
  });
});
