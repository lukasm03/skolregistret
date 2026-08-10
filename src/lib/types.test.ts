import { describe, expect, test } from "bun:test";
import { DEFAULT_STATUS, SKOLSTATUS_ORDER, isSkolStatus, isSkolformCode } from "./types";

describe("isSkolStatus", () => {
  test("accepts every status the order list declares", () => {
    for (const s of SKOLSTATUS_ORDER) expect(isSkolStatus(s)).toBe(true);
  });

  test("rejects unknown or differently-cased values", () => {
    expect(isSkolStatus("aktiv")).toBe(false);
    expect(isSkolStatus("Nedlagd")).toBe(false);
    expect(isSkolStatus("")).toBe(false);
  });
});

describe("status defaults", () => {
  test("only running units are shown when nothing is selected", () => {
    expect(DEFAULT_STATUS).toEqual(["Aktiv"]);
  });

  test('"Okänd" sorts last — it is our catch-all, not a register value', () => {
    expect(SKOLSTATUS_ORDER.at(-1)).toBe("Okänd");
  });

  test("the default status is itself a valid status", () => {
    for (const s of DEFAULT_STATUS) expect(SKOLSTATUS_ORDER).toContain(s);
  });
});

describe("isSkolformCode", () => {
  test("accepts the register's own codes", () => {
    for (const code of ["FKLASS", "GR", "GRS", "SP", "SAM", "FTH", "GY", "GYS", "VUX"]) {
      expect(isSkolformCode(code)).toBe(true);
    }
  });

  test("rejects codes we have no metric definitions for", () => {
    // Units may carry these; they land on ListSchool.otherForms instead.
    expect(isSkolformCode("gr")).toBe(false);
    expect(isSkolformCode("KOMVUX")).toBe(false);
    expect(isSkolformCode("")).toBe(false);
  });
});
