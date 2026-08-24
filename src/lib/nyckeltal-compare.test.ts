import { describe, expect, test } from "bun:test";
import { buildNyckeltalComparisons, type RiksNyckeltal } from "./nyckeltal-compare";
import type { KommunNyckeltalStat, Nyckeltal, NyckeltalVärde } from "./skolregister";

const finns = (tal: number, text = String(tal).replace(".", ",")): NyckeltalVärde => ({
  status: "finns",
  text,
  tal,
  läsår: "2024/25",
});

const saknas: NyckeltalVärde = {
  status: "saknas",
  förklaring: "Uppgiften saknas",
  läsår: null,
};

function nyckeltal(over: Partial<Nyckeltal> = {}): Nyckeltal {
  return {
    meritvärdeÅrskurs9: saknas,
    andelGodkändaÅrskurs9: saknas,
    andelBehörigaLärare: saknas,
    eleverPerLärare: saknas,
    ...over,
  };
}

function stat(
  key: keyof Nyckeltal,
  over: Partial<KommunNyckeltalStat> = {},
): KommunNyckeltalStat {
  return {
    key,
    genomsnitt: null,
    antalMedVärde: 0,
    rank: null,
    antalRankade: 0,
    ...over,
  };
}

const riks = (tal: number | null, beräknat = false): RiksNyckeltal => ({
  tal,
  beräknat,
  skolform: "grundskola",
});

/** The row for one key, which is all any single assertion here cares about. */
function rad(
  key: keyof Nyckeltal,
  n: Nyckeltal,
  stats: KommunNyckeltalStat[] = [],
  riksPerKey: Partial<Record<keyof Nyckeltal, RiksNyckeltal>> = {},
) {
  const row = buildNyckeltalComparisons(n, stats, riksPerKey).find((r) => r.key === key);
  if (!row) throw new Error(`ingen rad för ${key}`);
  return row;
}

describe("buildNyckeltalComparisons", () => {
  test("keeps the register's own text and appends the metric's suffix", () => {
    const r = rad(
      "andelGodkändaÅrskurs9",
      nyckeltal({ andelGodkändaÅrskurs9: finns(91.5, "cirka 91,5") }),
    );
    expect(r.value).toBe("cirka 91,5%");
    // The comparison is taken from `tal`, never from the rendered string.
    expect(r.tal).toBe(91.5);
  });

  test("higher is better: above riket reads as better", () => {
    const r = rad(
      "meritvärdeÅrskurs9",
      nyckeltal({ meritvärdeÅrskurs9: finns(257.2) }),
      [],
      { meritvärdeÅrskurs9: riks(228.5) },
    );
    expect(r.diffRiks).toBeCloseTo(28.7);
    expect(r.riktning).toBe("over");
    expect(r.omdöme).toBe("Bättre än riket");
  });

  test("lower is better: below riket also reads as better", () => {
    const r = rad("eleverPerLärare", nyckeltal({ eleverPerLärare: finns(9.6) }), [], {
      eleverPerLärare: riks(11.9),
    });
    expect(r.diffRiks).toBeCloseTo(-2.3);
    expect(r.riktning).toBe("over");
    expect(r.riktningsText).toBe("lägre brukar tolkas som bättre");
  });

  test("a difference that rounds to zero is level, not a direction", () => {
    const r = rad("eleverPerLärare", nyckeltal({ eleverPerLärare: finns(11.92) }), [], {
      eleverPerLärare: riks(11.9),
    });
    expect(r.riktning).toBe("level");
  });

  test("a beräknat rikstal is flagged and explained, not passed off as official", () => {
    const officiell = rad(
      "andelBehörigaLärare",
      nyckeltal({ andelBehörigaLärare: finns(76.6) }),
      [],
      { andelBehörigaLärare: riks(73.4) },
    );
    const beräknat = rad(
      "andelBehörigaLärare",
      nyckeltal({ andelBehörigaLärare: finns(76.6) }),
      [],
      { andelBehörigaLärare: riks(78.3, true) },
    );

    expect(officiell.beräknatRiks).toBe(false);
    expect(officiell.källa).toContainEqual({
      k: "Riksgenomsnitt",
      v: "Skolverkets officiella tal",
    });
    expect(beräknat.beräknatRiks).toBe(true);
    expect(beräknat.källa).toContainEqual({
      k: "Riksgenomsnitt",
      v: "beräknat av oss ur enheternas egna tal",
    });
    expect(beräknat.förklaring).toContain("räknat av oss");
  });

  test("a missing figure keeps the register's reason and draws no band for itself", () => {
    const r = rad("eleverPerLärare", nyckeltal(), [], { eleverPerLärare: riks(11.9) });
    expect(r.value).toBe("—");
    expect(r.saknas).toBe("Uppgiften saknas");
    expect(r.egenPct).toBeNull();
    expect(r.diffRiks).toBeNull();
    expect(r.riktning).toBe("none");
    // The averages are still worth showing — they are what the unit would be
    // compared against if it reported anything.
    expect(r.riksPct).not.toBeNull();
  });

  test("figures outside the domain pin to its ends rather than overflowing", () => {
    const r = rad("meritvärdeÅrskurs9", nyckeltal({ meritvärdeÅrskurs9: finns(82.5) }));
    expect(r.egenPct).toBe(0);
    expect(r.skala).toBe("150–320");
  });

  test("placing runs from best at 0% to last at 100%", () => {
    const best = rad(
      "meritvärdeÅrskurs9",
      nyckeltal({ meritvärdeÅrskurs9: finns(300) }),
      [stat("meritvärdeÅrskurs9", { rank: 1, antalRankade: 15, antalMedVärde: 15 })],
    );
    const last = rad(
      "meritvärdeÅrskurs9",
      nyckeltal({ meritvärdeÅrskurs9: finns(180) }),
      [stat("meritvärdeÅrskurs9", { rank: 15, antalRankade: 15, antalMedVärde: 15 })],
    );
    expect(best.placering).toBe("1 av 15");
    expect(best.rankPct).toBe(0);
    expect(last.rankPct).toBe(100);
  });

  test("the only ranked unit in its kommun gets a placing but no marker", () => {
    const r = rad("meritvärdeÅrskurs9", nyckeltal({ meritvärdeÅrskurs9: finns(240) }), [
      stat("meritvärdeÅrskurs9", { rank: 1, antalRankade: 1, antalMedVärde: 1 }),
    ]);
    expect(r.placering).toBe("1 av 1");
    expect(r.rankPct).toBeNull();
  });

  test("a figure averaged from the programmes says so, and says how many", () => {
    // A gymnasieskola's lärartal: the register reports it per program only,
    // so the unit's own figure is ours. It has to reach the page marked as
    // such — the row colours it like any other.
    const r = rad(
      "andelBehörigaLärare",
      nyckeltal({
        andelBehörigaLärare: {
          status: "finns",
          text: "61,3",
          tal: 61.3,
          läsår: "2025/26",
          härlett: { från: "gymnasieprogram", antalProgram: 3, elevviktat: true },
        },
      }),
    );
    expect(r.härlett?.antalProgram).toBe(3);
    expect(r.källa).toContainEqual({
      k: "Enhetens tal",
      v: "elevviktat snitt av enhetens 3 gymnasieprogram",
    });
    expect(r.förklaring).toContain("bara per program");
  });

  test("a figure the register reports itself is not marked as ours", () => {
    const r = rad("andelBehörigaLärare", nyckeltal({ andelBehörigaLärare: finns(76.6) }));
    expect(r.härlett).toBeNull();
    expect(r.källa.map((k) => k.k)).not.toContain("Enhetens tal");
  });

  test("the kommunsnitt row appears only when some unit in the kommun reports the metric", () => {
    const utan = rad("meritvärdeÅrskurs9", nyckeltal({ meritvärdeÅrskurs9: finns(240) }));
    const med = rad("meritvärdeÅrskurs9", nyckeltal({ meritvärdeÅrskurs9: finns(240) }), [
      stat("meritvärdeÅrskurs9", { genomsnitt: 220.9, antalMedVärde: 15 }),
    ]);
    expect(utan.källa.map((k) => k.k)).not.toContain("Kommunsnitt");
    expect(med.kommun).toBe("220,9");
    expect(med.källa).toContainEqual({
      k: "Kommunsnitt",
      v: "15 enheter i kommunen redovisar talet",
    });
  });
});
