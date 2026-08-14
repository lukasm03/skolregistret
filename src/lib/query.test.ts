import { describe, expect, test } from "bun:test";
import { site } from "@/config/site";
import { DEFAULT_STATUS, SKOLSTATUS_ORDER } from "./types";
import {
  parseHuvudmanQuery,
  parseSchoolQuery,
  patchParams,
  searchString,
  toggleInList,
  toggleStatus,
} from "./query";

describe("parseSchoolQuery defaults", () => {
  test("an empty URL yields the documented defaults", () => {
    const q = parseSchoolQuery({});
    expect(q.q).toBe("");
    expect(q.page).toBe(1);
    expect(q.perPage).toBe(site.pagination.perPage);
    expect(q.status).toEqual(DEFAULT_STATUS);
    expect(q.typ).toEqual(["Kommunal", "Fristående"]);
    expect(q.skolform).toBeUndefined();
    expect(q.kommun).toBeUndefined();
  });

  test("trims the search term", () => {
    expect(parseSchoolQuery({ q: "  vasa  " }).q).toBe("vasa");
  });

  test("takes the first value when Next hands over an array", () => {
    expect(parseSchoolQuery({ q: ["a", "b"] }).q).toBe("a");
  });
});

describe("parseSchoolQuery is defensive about garbage", () => {
  test("a non-numeric page falls back to 1, never NaN", () => {
    expect(parseSchoolQuery({ page: "abc" }).page).toBe(1);
  });

  test("page is clamped to at least 1", () => {
    expect(parseSchoolQuery({ page: "0" }).page).toBe(1);
    expect(parseSchoolQuery({ page: "-5" }).page).toBe(1);
  });

  test("perPage outside the offered options falls back to the default", () => {
    expect(parseSchoolQuery({ perPage: "37" }).perPage).toBe(site.pagination.perPage);
    const allowed = site.pagination.perPageOptions[1];
    expect(parseSchoolQuery({ perPage: String(allowed) }).perPage).toBe(allowed);
  });

  test("an unknown skolform is dropped rather than passed through", () => {
    expect(parseSchoolQuery({ skolform: "NOPE" }).skolform).toBeUndefined();
  });

  test("skolform is case-insensitive in the URL", () => {
    expect(parseSchoolQuery({ skolform: "gr" }).skolform).toBe("GR");
  });

  test("unknown statuses are filtered out", () => {
    expect(parseSchoolQuery({ status: "Aktiv,Nedlagd" }).status).toEqual(["Aktiv"]);
  });
});

/**
 * `?status=` carries three distinct meanings and the UI depends on all three:
 * absent is the default, empty means "nothing ticked" (an empty list), and a
 * list is that list.
 */
describe("parseSchoolQuery status tri-state", () => {
  test("absent means the default", () => {
    expect(parseSchoolQuery({}).status).toEqual(DEFAULT_STATUS);
  });

  test("explicitly empty means none selected, not all", () => {
    expect(parseSchoolQuery({ status: "" }).status).toEqual([]);
  });

  test("a list is taken as given", () => {
    expect(parseSchoolQuery({ status: "Aktiv,Vilande" }).status).toEqual([
      "Aktiv",
      "Vilande",
    ]);
  });

  test("the legacy ?planerad=1 link still means every status", () => {
    expect(parseSchoolQuery({ planerad: "1" }).status).toEqual([...SKOLSTATUS_ORDER]);
  });

  test("an explicit status wins over the legacy toggle", () => {
    expect(parseSchoolQuery({ planerad: "1", status: "Aktiv" }).status).toEqual([
      "Aktiv",
    ]);
  });
});

describe("parseSchoolQuery typ tri-state", () => {
  test("absent means both types", () => {
    expect(parseSchoolQuery({}).typ).toEqual(["Kommunal", "Fristående"]);
  });

  test("explicitly empty means neither, so nothing matches", () => {
    expect(parseSchoolQuery({ typ: "" }).typ).toEqual([]);
  });

  test("unknown types are filtered out", () => {
    expect(parseSchoolQuery({ typ: "Kommunal,Statlig" }).typ).toEqual(["Kommunal"]);
  });
});

describe("parseSchoolQuery skolform-scoped params", () => {
  test("programme filters only apply to gymnasieskola", () => {
    expect(
      parseSchoolQuery({ skolform: "GY", program: "Naturvetenskap" }).program,
    ).toEqual(["Naturvetenskap"]);
    expect(
      parseSchoolQuery({ skolform: "GR", program: "Naturvetenskap" }).program,
    ).toEqual([]);
  });

  test("årskurs values not valid for the form are dropped", () => {
    expect(parseSchoolQuery({ skolform: "GR", arskurs: "1–3,tolv" }).arskurs).toEqual([
      "1–3",
    ]);
  });

  test("årskurs is dropped entirely when no skolform is selected", () => {
    // "alla skolformer" renders no årskurs chips, so a hand-written or shared
    // ?arskurs= must not survive parsing either — otherwise it silently hides
    // every unit the register reports no years for (gymnasieskola, förskola,
    // fritidshem, vuxenutbildning) with no chip on screen to clear.
    expect(parseSchoolQuery({ arskurs: "1–3" }).arskurs).toEqual([]);
  });

  test("grundskola offers no F chip, so ?arskurs=F is dropped for it", () => {
    // The register keys förskoleklass years under `fsk` → FKLASS, so
    // stats.GR.years can never contain "0" (pinned in api-normalize.test.ts).
    // An F chip on grundskolan would therefore empty the list for every unit,
    // including one running F–9. Filtering on förskoleklass is the FKLASS
    // skolform's job. Do not add "F" back to GR's gradeFilter.
    expect(parseSchoolQuery({ skolform: "GR", arskurs: "F,1–3" }).arskurs).toEqual([
      "1–3",
    ]);
  });
});

describe("sort direction", () => {
  test("?dir wins over the sort option's natural direction", () => {
    expect(parseSchoolQuery({ sort: "name", dir: "desc" }).desc).toBe(true);
    expect(parseSchoolQuery({ sort: "elever", dir: "asc" }).desc).toBe(false);
  });

  test("without ?dir the sort's own default direction is used", () => {
    expect(parseSchoolQuery({ sort: "name" }).desc).toBe(false);
    expect(parseSchoolQuery({ sort: "elever" }).desc).toBe(true);
  });

  test("an unknown sort falls back to the first option rather than passing through", () => {
    expect(parseSchoolQuery({ sort: "nonsense" }).sort).toBe("name");
  });

  test("header-only sorts stay valid so a shared link survives a reload", () => {
    expect(parseSchoolQuery({ sort: "huvudman" }).sort).toBe("huvudman");
    expect(parseSchoolQuery({ sort: "kommun" }).sort).toBe("kommun");
  });
});

describe("parseHuvudmanQuery", () => {
  test("defaults", () => {
    const q = parseHuvudmanQuery({});
    expect(q.q).toBe("");
    expect(q.page).toBe(1);
    expect(q.koncernOnly).toBe(false);
    expect(q.perPage).toBe(site.pagination.perPage);
  });

  test("koncern is a strict '1' flag", () => {
    expect(parseHuvudmanQuery({ koncern: "1" }).koncernOnly).toBe(true);
    expect(parseHuvudmanQuery({ koncern: "true" }).koncernOnly).toBe(false);
    expect(parseHuvudmanQuery({ koncern: "0" }).koncernOnly).toBe(false);
  });

  test("defaults to elever descending, the busiest huvudmän first", () => {
    const q = parseHuvudmanQuery({});
    expect(q.sort).toBe("elever");
    expect(q.desc).toBe(true);
  });
});

describe("toggleInList", () => {
  test("adds a value that is absent and removes one that is present", () => {
    expect(toggleInList(["a"], "b")).toBe("a,b");
    expect(toggleInList(["a", "b"], "a")).toBe("b");
  });

  test("emptying drops the param, which reads as 'all'", () => {
    expect(toggleInList(["a"], "a")).toBeNull();
  });

  test("keepEmpty keeps an explicit empty string instead", () => {
    expect(toggleInList(["a"], "a", true)).toBe("");
  });
});

describe("toggleStatus", () => {
  test("removing a status leaves the rest", () => {
    expect(toggleStatus(["Aktiv", "Vilande"], "Aktiv")).toBe("Vilande");
  });

  test("adding one restores the canonical display order, not click order", () => {
    expect(toggleStatus(["Vilande"], "Aktiv")).toBe("Aktiv,Vilande");
  });

  test("emptying yields an empty string, never null — 'none' is explicit", () => {
    expect(toggleStatus(["Aktiv"], "Aktiv")).toBe("");
  });
});

describe("patchParams", () => {
  test("null removes a key", () => {
    expect(patchParams({ q: "x", typ: "Kommunal" }, { typ: null })).toEqual({ q: "x" });
  });

  test("an empty string is kept as an explicit empty value", () => {
    expect(patchParams({}, { status: "" })).toEqual({ status: "" });
  });

  test("numbers are stringified", () => {
    expect(patchParams({}, { page: 3 })).toEqual({ page: "3" });
  });

  test("changing any filter returns to page 1 by dropping page", () => {
    expect(patchParams({ page: "4", q: "a" }, { q: "b" })).toEqual({ q: "b" });
  });

  test("but paging itself keeps the page", () => {
    expect(patchParams({ page: "4" }, { page: 5 })).toEqual({ page: "5" });
  });
});

describe("searchString", () => {
  test("empty params produce no query string at all", () => {
    expect(searchString({})).toBe("");
  });

  test("prefixes with ? and keeps explicit empty values", () => {
    expect(searchString({ status: "" })).toBe("?status=");
    expect(searchString({ q: "vasa" })).toBe("?q=vasa");
  });

  test("round-trips back through parseSchoolQuery", () => {
    const params = { skolform: "GR", status: "Aktiv,Vilande", perPage: "50" };
    const parsed = parseSchoolQuery(
      Object.fromEntries(new URLSearchParams(searchString(params).slice(1))),
    );
    expect(parsed.skolform).toBe("GR");
    expect(parsed.status).toEqual(["Aktiv", "Vilande"]);
    expect(parsed.perPage).toBe(50);
  });
});
