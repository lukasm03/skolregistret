import { describe, expect, test } from "bun:test";
import {
  finns,
  nyastaMatvärde,
  parseAndelString,
  programsnitt,
  skolformLabel,
  talAv,
} from "./normalize";
import type { Matvarde, Statistik } from "./types";

const m = (över: Partial<Matvarde> = {}): Matvarde => ({
  varde: "1",
  typ: "EXISTS",
  period: "2024/25",
  tal: 1,
  ...över,
});

describe("nyastaMatvärde", () => {
  test("picks the newest period, not array position", () => {
    const serie = [m({ period: "2022/23", tal: 1 }), m({ period: "2024/25", tal: 3 })];
    expect(nyastaMatvärde(serie)?.tal).toBe(3);
  });

  test("falls back to array position when no period is set", () => {
    const serie = [m({ period: null, tal: 1 }), m({ period: null, tal: 2 })];
    expect(nyastaMatvärde(serie)?.tal).toBe(1);
  });

  test("empty and undefined series both resolve to null", () => {
    expect(nyastaMatvärde([])).toBeNull();
    expect(nyastaMatvärde(undefined)).toBeNull();
  });
});

describe("finns / talAv", () => {
  test("only EXISTS with a number counts as present", () => {
    expect(finns(m())).toBe(true);
    expect(talAv(m())).toBe(1);
  });

  test("a masked value has no number even if typ says EXISTS by mistake", () => {
    expect(talAv(m({ tal: null }))).toBeNull();
  });

  test("MISSING/other typer never yield a number", () => {
    expect(talAv(m({ typ: "MISSING", tal: null }))).toBeNull();
    expect(talAv(null)).toBeNull();
  });
});

describe("skolformLabel", () => {
  test("maps the source's lowercase kod onto config/skolformer.ts's label", () => {
    expect(skolformLabel("gr")).toBe("Grundskola");
    expect(skolformLabel("fsk")).toBe("Förskoleklass");
  });

  test("is case-insensitive, for karta/enskilda's uppercase spelling", () => {
    expect(skolformLabel("GR")).toBe("Grundskola");
  });

  test("an unknown kod falls back to itself rather than throwing", () => {
    expect(skolformLabel("okänd-kod")).toBe("okänd-kod");
  });
});

describe("parseAndelString", () => {
  test("a real share parses to a number", () => {
    expect(parseAndelString("57%")).toBe(57);
  });

  test('masked ("-") and not-asked (null) both resolve to null', () => {
    expect(parseAndelString("-")).toBeNull();
    expect(parseAndelString(null)).toBeNull();
    expect(parseAndelString(undefined)).toBeNull();
  });
});

/**
 * `programsnitt` is what gives a gymnasieskola a lärartal at all: the
 * skolform-level `matt` is empty in every gy-record the register serves, so
 * without this the unit's own andel behöriga lärare and elever per lärare are
 * a dash while the figures sit one level down the same response.
 */
describe("programsnitt", () => {
  const program = (
    ...poster: Array<{ kod: string; tal?: number | null; elever?: number | null }>
  ): Statistik["program"] =>
    poster.map((p) => ({
      programkod: p.kod,
      text: {},
      matt: {
        certifiedTeachersQuota: [
          p.tal == null
            ? m({ typ: "MISSING", varde: null, tal: null })
            : m({ varde: String(p.tal).replace(".", ","), tal: p.tal }),
        ],
        ...(p.elever == null
          ? {}
          : {
              totalNumberOfPupils: [m({ varde: `cirka ${p.elever}`, tal: p.elever })],
            }),
      },
    }));

  test("weights each programme by its elevantal", () => {
    const snitt = programsnitt(
      program(
        { kod: "EK25", tal: 60, elever: 300 },
        { kod: "FS25", tal: 80, elever: 100 },
      ),
      "certifiedTeachersQuota",
    );
    expect(snitt).toEqual({
      tal: 65,
      period: "2024/25",
      antalProgram: 2,
      elevviktat: true,
    });
  });

  test("the figure every programme repeats comes back unchanged, not as float noise", () => {
    // What today's export actually looks like: one lärartal for the unit,
    // written once per programme. An unrounded weighted mean of it prints as
    // 61,300000000000004.
    const snitt = programsnitt(
      program(
        { kod: "EK25", tal: 61.3, elever: 130 },
        { kod: "FS25", tal: 61.3, elever: 60 },
        { kod: "SA25", tal: 61.3, elever: 70 },
      ),
      "certifiedTeachersQuota",
    );
    expect(snitt?.tal).toBe(61.3);
    expect(snitt?.antalProgram).toBe(3);
  });

  test("falls back to an unweighted mean rather than dropping a programme without an elevantal", () => {
    const snitt = programsnitt(
      program({ kod: "EK25", tal: 60, elever: 300 }, { kod: "FS25", tal: 80 }),
      "certifiedTeachersQuota",
    );
    expect(snitt?.tal).toBe(70);
    expect(snitt?.elevviktat).toBe(false);
  });

  test("programmes without a figure are skipped, not counted as zero", () => {
    const snitt = programsnitt(
      program(
        { kod: "EK25", tal: 60, elever: 100 },
        { kod: "FS25", tal: null, elever: 100 },
      ),
      "certifiedTeachersQuota",
    );
    expect(snitt?.tal).toBe(60);
    expect(snitt?.antalProgram).toBe(1);
  });

  test("no programme with a figure means no snitt at all", () => {
    expect(programsnitt([], "certifiedTeachersQuota")).toBeNull();
    expect(
      programsnitt(program({ kod: "EK25", tal: null }), "certifiedTeachersQuota"),
    ).toBeNull();
  });
});
