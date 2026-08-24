import { describe, expect, test } from "bun:test";
import type { HuvudmanRad } from "@/lib/skolregister";
import { dedupeHuvudmanRows, huvudmanRadFörSlug, huvudmanSlugar } from "./huvudman-slugs";

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
  // No collector addresses in a hand-written fixture; the sources these
  // point at are the Källor section's business, not this file's.
  källor: { koncern: null, bolagsuppgifter: null, årsredovisningar: null },
  ...over,
});

/**
 * Huvudmän are joined to units by *name* alone — `aggregateHuvudman` compares
 * `s.huvudman === h.name`, and the source offers no other key both sides
 * share. Two rows under one name therefore aggregate the identical unit set
 * and would render as duplicate lines, so the list collapses them.
 *
 * Only exact names collapse. Rows that merely *slugify* alike are two
 * huvudmän with two unit sets; dropping one of those is what made
 * `HABO KOMMUN` unreachable behind `HÅBO KOMMUN`. They keep their rows, and
 * `huvudmanSlugar` gives them separate addresses.
 */
describe("dedupeHuvudmanRows", () => {
  test("distinct organisationsnummer under one name are LOST, by design", () => {
    const rows = dedupeHuvudmanRows([
      huvudman({ namn: "Thoren", organisationsnummer: "556000-1111" }),
      huvudman({ namn: "Thoren", organisationsnummer: "556000-9999" }),
    ]);
    expect(rows).toHaveLength(1);
  });

  test("keeps both rows when two different names merely slugify alike", () => {
    const rows = dedupeHuvudmanRows([
      huvudman({ namn: "HÅBO KOMMUN", organisationsnummer: "2120000241" }),
      huvudman({ namn: "HABO KOMMUN", organisationsnummer: "2120001611" }),
    ]);
    expect(rows.map((r) => r.namn)).toEqual(["HÅBO KOMMUN", "HABO KOMMUN"]);
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

/**
 * The register really does carry two kommuner that slug alike — Håbo in
 * Uppsala län and Habo in Jönköpings län — and before these addresses were
 * assigned centrally, `/huvudman/habo-kommun` rendered one of them while
 * `/skolor?huvudman=habo-kommun` filtered on the other's name.
 */
describe("huvudmanSlugar", () => {
  const håboHabo = [
    huvudman({ namn: "HÅBO KOMMUN", organisationsnummer: "2120000241" }),
    huvudman({ namn: "HABO KOMMUN", organisationsnummer: "2120001611" }),
  ];

  test("gives colliding names separate addresses", () => {
    const slugar = huvudmanSlugar(håboHabo);
    expect(slugar.get("HÅBO KOMMUN")).toBe("habo-kommun");
    expect(slugar.get("HABO KOMMUN")).toBe("habo-kommun-2120001611");
  });

  test("breaks the tie on orgnr, not on list order", () => {
    const framlänges = huvudmanSlugar(håboHabo);
    const baklänges = huvudmanSlugar([...håboHabo].reverse());
    expect(baklänges.get("HÅBO KOMMUN")).toBe(framlänges.get("HÅBO KOMMUN"));
    expect(baklänges.get("HABO KOMMUN")).toBe(framlänges.get("HABO KOMMUN"));
  });

  test("leaves an uncontested name its bare slug", () => {
    const slugar = huvudmanSlugar([huvudman({ namn: "Fridaskolorna AB" })]);
    expect(slugar.get("Fridaskolorna AB")).toBe("fridaskolorna-ab");
  });

  test("rows sharing a name share one address", () => {
    const slugar = huvudmanSlugar([
      huvudman({ namn: "Thoren", organisationsnummer: "556000-1111" }),
      huvudman({ namn: "Thoren", organisationsnummer: "556000-9999" }),
    ]);
    expect(slugar.size).toBe(1);
    expect(slugar.get("Thoren")).toBe("thoren");
  });
});

describe("huvudmanRadFörSlug", () => {
  test("resolves each colliding kommun back to its own row", () => {
    const index = huvudmanRadFörSlug([
      huvudman({ namn: "HÅBO KOMMUN", organisationsnummer: "2120000241" }),
      huvudman({ namn: "HABO KOMMUN", organisationsnummer: "2120001611" }),
    ]);
    expect(index.get("habo-kommun")?.organisationsnummer).toBe("2120000241");
    expect(index.get("habo-kommun-2120001611")?.organisationsnummer).toBe("2120001611");
  });
});
