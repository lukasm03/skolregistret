import { describe, expect, test } from "bun:test";
import type { HuvudmanRad, SkolorRad } from "@/lib/skolregister";
import {
  dedupeHuvudmanRows,
  groupKoncern,
  normalizeApiHuvudmanList,
  normalizeApiSchool,
} from "./api-normalize";

const skola = (over: Partial<SkolorRad> = {}): SkolorRad => ({
  skolenhetskod: "12345678",
  namn: "Vasaskolan",
  status: "Aktiv",
  huvudman: "Stockholms kommun",
  huvudmannaOrgnr: "212000-0142",
  huvudmannatyp: "Kommunal",
  kommun: "Stockholm",
  kommunkod: "0180",
  skolformer: ["Grundskola"],
  gymnasieprogram: [],
  antalElever: 300,
  årskurser: ["0", "1", "2", "3"],
  årskurserPerSkolform: [
    { kod: "fsk", skolform: "Förskoleklass", årskurser: ["0"] },
    { kod: "gr", skolform: "Grundskola", årskurser: ["1", "2", "3"] },
  ],
  ...over,
});

const huvudman = (over: Partial<HuvudmanRad> = {}): HuvudmanRad => ({
  organisationsnummer: "556000-0001",
  namn: "Kunskapsskolan i Sverige AB",
  typ: "Fristående",
  bolagsform: "AB",
  koncern: null,
  kommuner: ["0180"],
  skolformer: ["Grundskola"],
  antalEnheter: 3,
  antalElever: 900,
  ...over,
});

describe("normalizeApiSchool", () => {
  test("maps the register's identity fields onto the view model", () => {
    const s = normalizeApiSchool(skola());
    expect(s.kod).toBe("12345678");
    expect(s.name).toBe("Vasaskolan");
    expect(s.typ).toBe("Kommunal");
    expect(s.status).toBe("Aktiv");
    expect(s.kommunkod).toBe("0180");
    expect(s.students).toBe(300);
  });

  test("splits skolformer into known codes and unrecognised labels", () => {
    const s = normalizeApiSchool(skola({ skolformer: ["Grundskola", "Kulturskola"] }));
    expect(s.forms).toEqual(["GR"]);
    // Unknown forms are kept and shown, just never compared against metrics.
    expect(s.otherForms).toEqual(["Kulturskola"]);
  });

  test("builds a stats bucket per known form, carrying the unit's elevantal", () => {
    const s = normalizeApiSchool(skola({ antalElever: 250 }));
    expect(s.stats.GR?.students).toEqual({ raw: "250", value: 250, missing: null });
  });

  test("a null elevantal becomes a null MetricValue, not a zero", () => {
    const s = normalizeApiSchool(skola({ antalElever: null }));
    expect(s.students).toBeNull();
    expect(s.stats.GR?.students).toBeNull();
  });

  test("carries the flat year union through as-is", () => {
    expect(normalizeApiSchool(skola()).years).toEqual(["0", "1", "2", "3"]);
  });

  test("derives a display span from the years", () => {
    expect(normalizeApiSchool(skola()).gradeSpan).toBe("F–3");
  });

  /**
   * The register keys years by Skolverket's skolformsnyckel (fsk/gr/gran),
   * which is a different vocabulary from the app's SkolformCode.
   */
  test("re-keys per-skolform years onto the app's own skolform codes", () => {
    const s = normalizeApiSchool(
      skola({
        skolformer: ["Förskoleklass", "Grundskola", "Anpassad grundskola"],
        årskurser: ["0", "1", "2", "3"],
        årskurserPerSkolform: [
          { kod: "fsk", skolform: "Förskoleklass", årskurser: ["0"] },
          { kod: "gr", skolform: "Grundskola", årskurser: ["1", "2", "3"] },
          { kod: "gran", skolform: "Anpassad grundskola", årskurser: ["1", "2", "3"] },
        ],
      }),
    );
    expect(s.stats.FKLASS?.years).toEqual(["0"]);
    expect(s.stats.GR?.years).toEqual(["1", "2", "3"]);
    expect(s.stats.GRS?.years).toEqual(["1", "2", "3"]);
    expect(s.stats.FKLASS?.gradeSpan).toBe("F");
    expect(s.stats.GR?.gradeSpan).toBe("1–3");
  });

  /**
   * Skolverket publishes no years for gymnasieskola, so gy units arrive with
   * empty arrays. That is "not reported", not "teaches no years".
   */
  test("a gymnasium keeps empty years and an empty span", () => {
    const s = normalizeApiSchool(
      skola({
        skolformer: ["Gymnasieskola"],
        årskurser: [],
        årskurserPerSkolform: [],
      }),
    );
    expect(s.years).toEqual([]);
    expect(s.gradeSpan).toBe("");
    expect(s.stats.GY?.years).toEqual([]);
    expect(s.stats.GY?.gradeSpan).toBe("");
  });

  test("a form the register reports no years for still gets an empty array", () => {
    // Runs grundskola and fritidshem; only grundskola has years.
    const s = normalizeApiSchool(
      skola({
        skolformer: ["Grundskola", "Fritidshem"],
        årskurser: ["1", "2"],
        årskurserPerSkolform: [
          { kod: "gr", skolform: "Grundskola", årskurser: ["1", "2"] },
        ],
      }),
    );
    expect(s.stats.GR?.years).toEqual(["1", "2"]);
    expect(s.stats.FTH?.years).toEqual([]);
  });

  /**
   * The register's årskurs vocabulary is exhaustively fsk | gr | gran, so
   * specialskola and sameskola can never receive years — even though both
   * declare årskurs chips in src/config/skolformer.ts. Selecting either form
   * together with a chip is therefore guaranteed to return nothing. Pinned
   * because it is deducible from the API contract, not from sample data.
   */
  test("specialskola and sameskola can never receive years", () => {
    const s = normalizeApiSchool(
      skola({
        skolformer: ["Specialskola", "Sameskola"],
        årskurser: [],
        årskurserPerSkolform: [],
      }),
    );
    expect(s.stats.SP?.years).toEqual([]);
    expect(s.stats.SAM?.years).toEqual([]);
  });

  test("non-contiguous coverage keeps its gap in the span", () => {
    const s = normalizeApiSchool(skola({ årskurser: ["0", "4", "5", "6"] }));
    expect(s.gradeSpan).toBe("F, 4–6");
  });

  test("survives rows the declared type says are impossible", () => {
    // Seen in the wild: a unit with no name. Sorting needs a string.
    const s = normalizeApiSchool(
      skola({ namn: undefined as never, skolformer: undefined as never }),
    );
    expect(s.name).toBe("");
    expect(s.forms).toEqual([]);
  });
});

describe("normalizeApiHuvudmanList", () => {
  test("derives the slug the same way the detail route does", () => {
    const [h] = normalizeApiHuvudmanList([huvudman()]);
    expect(h.slug).toBe("kunskapsskolan-i-sverige-ab");
    expect(h.org).toBe("556000-0001");
    expect(h.koncern).toBeNull();
  });

  test("lifts the koncern name out of the koncern block", () => {
    const [h] = normalizeApiHuvudmanList([
      huvudman({
        koncern: {
          koncernOrgNr: "556999-0000",
          koncernNamn: "Academedia",
          kedja: [],
          antalFöretag: 40,
        },
      }),
    ]);
    expect(h.koncern).toBe("Academedia");
  });
});

/**
 * Huvudmän are joined to units by *name* alone — the API offers no other key
 * both sides agree on. Two rows sharing a name therefore aggregate identical
 * unit sets and collide on `slug`, so the list collapses them to the first
 * occurrence. Pinned here because it is a deliberate trade-off, not an
 * oversight: `/huvudman/[slug]` resolves the same way, so both pages agree.
 */
describe("dedupeHuvudmanRows", () => {
  test("keeps the first of two rows that slugify identically", () => {
    const rows = dedupeHuvudmanRows([
      huvudman({ namn: "Vittra AB", organisationsnummer: "556000-1111" }),
      huvudman({ namn: "Vittra, AB", organisationsnummer: "556000-2222" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].organisationsnummer).toBe("556000-1111");
  });

  test("distinct organisationsnummer under one name are LOST, by design", () => {
    const rows = dedupeHuvudmanRows([
      huvudman({ namn: "Thoren", organisationsnummer: "556000-1111" }),
      huvudman({ namn: "Thoren", organisationsnummer: "556000-9999" }),
    ]);
    expect(rows).toHaveLength(1);
  });

  test("genuinely different names are all kept", () => {
    const rows = dedupeHuvudmanRows([
      huvudman({ namn: "Alfa" }),
      huvudman({ namn: "Beta" }),
    ]);
    expect(rows).toHaveLength(2);
  });

  test("preserves input order", () => {
    const rows = dedupeHuvudmanRows([
      huvudman({ namn: "Beta" }),
      huvudman({ namn: "Alfa" }),
    ]);
    expect(rows.map((r) => r.namn)).toEqual(["Beta", "Alfa"]);
  });
});

describe("groupKoncern", () => {
  const inKoncern = (namn: string, koncernNamn: string) =>
    huvudman({
      namn,
      koncern: {
        koncernOrgNr: "556999-0000",
        koncernNamn,
        kedja: [],
        antalFöretag: 40,
      },
    });

  test("collects every huvudman sharing a koncern name", () => {
    const groups = groupKoncern([
      inKoncern("Vittra", "Academedia"),
      inKoncern("Pysslingen", "Academedia"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].slug).toBe("academedia");
    expect(groups[0].dotterbolag).toHaveLength(2);
  });

  test("keeps Bolagsverket's company count, which exceeds the units we see", () => {
    const [g] = groupKoncern([inKoncern("Vittra", "Academedia")]);
    expect(g.antalFöretag).toBe(40);
    expect(g.dotterbolag).toHaveLength(1);
  });

  test("huvudmän without a koncern are skipped entirely", () => {
    expect(groupKoncern([huvudman({ koncern: null })])).toEqual([]);
  });

  test("a koncern block with no name is skipped rather than grouped under ''", () => {
    const groups = groupKoncern([
      huvudman({
        koncern: {
          koncernOrgNr: "556999-0000",
          koncernNamn: "" as never,
          kedja: [],
          antalFöretag: 2,
        },
      }),
    ]);
    expect(groups).toEqual([]);
  });
});
