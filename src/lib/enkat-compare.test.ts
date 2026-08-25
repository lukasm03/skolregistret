import { describe, expect, test } from "bun:test";
import { buildEnkätComparisons, årskursText } from "./enkat-compare";
import {
  enkätGruppKey,
  type Elevenkät,
  type EnkätGrupp,
  type Enkätfråga,
  type Skolenkät,
  type Vårdnadshavarenkät,
} from "./skolregister";

const fråga = (genomsnitt: number | null): Enkätfråga | null =>
  genomsnitt == null ? null : { fråga: "", ämne: null, genomsnitt, svarsfördelning: {} };

/** Answers in the order the page shows them: nöjdhet, trygghet, studiero, stöd, stimulans. */
function svar([nöjdhet, trygghet, studiero, stöd, stimulans]: (number | null)[]) {
  return {
    rekommendation: null,
    nöjdhet: fråga(nöjdhet),
    trygghet: fråga(trygghet),
    studiero: fråga(studiero),
    stöd: fråga(stöd),
    stimulans: fråga(stimulans),
  };
}

function elev(över: Partial<Elevenkät> & { svar: (number | null)[] }): Elevenkät {
  const { svar: värden, ...rest } = över;
  return {
    skolform: "Grundskola",
    läsår: "VT26",
    antalSvar: 59,
    årskurs: "ak5",
    antalIGruppen: 61,
    svarsfrekvens: 97,
    ...svar(värden),
    ...rest,
  };
}

function vårdnadshavare(
  över: Partial<Vårdnadshavarenkät> & { svar: (number | null)[] },
): Vårdnadshavarenkät {
  const { svar: värden, ...rest } = över;
  return {
    skolform: "Grundskola",
    läsår: "VT26",
    antalSvar: 143,
    ...svar(värden),
    ...rest,
  };
}

const enkät = (e: Partial<Skolenkät>): Skolenkät => ({
  skolenhetskod: "1",
  vårdnadshavare: [],
  elever: [],
  ...e,
});

function grupp(värden: (number | null)[]): EnkätGrupp {
  const [nöjdhet, trygghet, studiero, stöd, stimulans] = värden;
  return {
    genomsnitt: {
      rekommendation: null,
      nöjdhet: nöjdhet ?? null,
      trygghet: trygghet ?? null,
      studiero: studiero ?? null,
      stöd: stöd ?? null,
      stimulans: stimulans ?? null,
    },
    antalSvar: 50,
    läsår: "VT26",
    antalSkolor: 100,
  };
}

const riksFör = (nyckel: string, värden: (number | null)[]) =>
  new Map([[nyckel, grupp(värden)]]);

describe("årskursText", () => {
  test("tells grundskolans years from gymnasiets", () => {
    expect(årskursText("ak5")).toBe(" åk 5");
    expect(årskursText("ak8")).toBe(" åk 8");
    expect(årskursText("ar2")).toBe(" år 2");
  });

  test("a group with no årskurs adds nothing", () => {
    expect(årskursText(null)).toBe("");
  });

  test("an unrecognised code is shown as it stands rather than mislabelled", () => {
    expect(årskursText("gy3")).toBe(" gy3");
  });
});

describe("buildEnkätComparisons", () => {
  const nyckel = enkätGruppKey("Grundskola", "ak5");

  test("compares each group against the same group nationally", () => {
    const [g] = buildEnkätComparisons(
      enkät({ elever: [elev({ svar: [8.6, 8.6, 7.0, 7.5, 7.0] })] }),
      new Map(),
      riksFör(nyckel, [7.0, 8.0, 7.0, 7.5, 7.4]),
    );

    expect(g?.grupp).toBe("Elever · Grundskola åk 5");
    expect(g?.dimensioner.map((d) => d.riktning)).toEqual([
      "over",
      "over",
      "level",
      "level",
      "under",
    ]);
  });

  test("a low svarsfrekvens is carried as a caveat, not as a reason to hide the figures", () => {
    const [låg] = buildEnkätComparisons(
      enkät({ elever: [elev({ svar: [8, 8, 8, 8, 8], svarsfrekvens: 62 })] }),
      new Map(),
      new Map(),
    );
    const [hög] = buildEnkätComparisons(
      enkät({ elever: [elev({ svar: [8, 8, 8, 8, 8], svarsfrekvens: 88 })] }),
      new Map(),
      new Map(),
    );

    expect(låg?.tillförlitlighet).toBe("Lägre svarsfrekvens");
    expect(låg?.osäkert).toBe(true);
    expect(låg?.dimensioner[0]?.value).toBe("8,0");
    expect(hög?.tillförlitlighet).toBe("Gott underlag");
    expect(hög?.osäkert).toBe(false);
  });

  test("vårdnadshavarenkäten reports no response rate, so the count decides", () => {
    const [få] = buildEnkätComparisons(
      enkät({
        vårdnadshavare: [vårdnadshavare({ svar: [8, 8, 8, 8, 8], antalSvar: 12 })],
      }),
      new Map(),
      new Map(),
    );
    const [många] = buildEnkätComparisons(
      enkät({ vårdnadshavare: [vårdnadshavare({ svar: [8, 8, 8, 8, 8] })] }),
      new Map(),
      new Map(),
    );

    expect(få?.svarsfrekvens).toBeNull();
    expect(få?.tillförlitlighet).toBe("Litet underlag");
    expect(många?.tillförlitlighet).toBe("Gott underlag");
  });

  test("an unanswered question is left out of the count rather than counted as low", () => {
    const [g] = buildEnkätComparisons(
      enkät({ elever: [elev({ svar: [8.6, null, null, null, null] })] }),
      new Map(),
      riksFör(nyckel, [7.0, 8.0, 7.0, 7.5, 7.4]),
    );

    expect(g?.dimensioner[1]?.value).toBe("—");
    expect(g?.dimensioner[1]?.diff).toBeNull();
  });

  test("elevernas grupper come before vårdnadshavarnas", () => {
    const grupper = buildEnkätComparisons(
      enkät({
        vårdnadshavare: [vårdnadshavare({ svar: [8, 8, 8, 8, 8] })],
        elever: [elev({ svar: [8, 8, 8, 8, 8] })],
      }),
      new Map(),
      new Map(),
    );
    expect(grupper.map((g) => g.grupp)).toEqual([
      "Elever · Grundskola åk 5",
      "Vårdnadshavare · Grundskola",
    ]);
  });
});
