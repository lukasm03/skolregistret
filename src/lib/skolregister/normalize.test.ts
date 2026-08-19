import { describe, expect, test } from "bun:test";
import {
  finns,
  nyastaMatvärde,
  parseAndelString,
  skolformLabel,
  talAv,
} from "./normalize";
import type { Matvarde } from "./types";

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
