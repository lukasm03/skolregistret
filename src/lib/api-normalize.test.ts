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

  /**
   * The API carries no grade spans. `selectSchools` guards on the empty string
   * before calling `spansOverlap`, so today an årskurs filter matches nothing
   * — see the note in the README.
   */
  test("grade spans come back empty, because the API reports none", () => {
    expect(normalizeApiSchool(skola()).gradeSpan).toBe("");
    expect(normalizeApiSchool(skola()).stats.GR?.gradeSpan).toBe("");
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
