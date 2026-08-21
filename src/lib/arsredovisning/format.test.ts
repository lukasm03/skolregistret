import { describe, expect, test } from "bun:test";
import { formateraOrgnr, parsePaketNamn, räkenskapsårEtikett } from "./format";

describe("parsePaketNamn", () => {
  test("reads the period end and the package id", () => {
    expect(
      parsePaketNamn("2025-12-31-4f3ff71e-7deb-4380-82b6-02a780196ae3_paket.zip"),
    ).toEqual({
      räkenskapsårSlut: "2025-12-31",
      id: "4f3ff71e-7deb-4380-82b6-02a780196ae3",
    });
  });

  test("rejects anything that is not a package", () => {
    // `.DS_Store` really does sit in these directories.
    expect(parsePaketNamn(".DS_Store")).toBeNull();
    expect(parsePaketNamn("2025-12-31_paket.zip")).toBeNull();
    expect(
      parsePaketNamn("2025-12-31-4f3ff71e-7deb-4380-82b6-02a780196ae3.xhtml"),
    ).toBeNull();
  });
});

describe("räkenskapsårEtikett", () => {
  test("a calendar year is named by its year", () => {
    expect(räkenskapsårEtikett("2025-12-31")).toBe("2025");
  });

  test("a brutet räkenskapsår spans two", () => {
    expect(räkenskapsårEtikett("2025-06-30")).toBe("2024/25");
    expect(räkenskapsårEtikett("2021-04-30")).toBe("2020/21");
  });

  test("spanning a century still reads as two years", () => {
    expect(räkenskapsårEtikett("2100-06-30")).toBe("2099/00");
  });
});

test("formateraOrgnr writes the hyphen, and leaves anything else alone", () => {
  expect(formateraOrgnr("5560335837")).toBe("556033-5837");
  expect(formateraOrgnr("namn:Vallåkra")).toBe("namn:Vallåkra");
});
