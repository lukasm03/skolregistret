import { describe, expect, test } from "bun:test";
import { expandSpan, formatYears, yearsOverlap } from "./parse";

/**
 * The filter chips are spans ("1–3"); the register reports individual years
 * ("1", "2", "3") with "0" for förskoleklass. `expandSpan` is what lets the
 * two be compared.
 */
describe("expandSpan", () => {
  test("expands a range into every year it covers", () => {
    expect(expandSpan("1–3")).toEqual(["1", "2", "3"]);
    expect(expandSpan("7–9")).toEqual(["7", "8", "9"]);
  });

  test("F is year 0, not a letter", () => {
    expect(expandSpan("F")).toEqual(["0"]);
    expect(expandSpan("F–3")).toEqual(["0", "1", "2", "3"]);
    expect(expandSpan("f")).toEqual(["0"]);
  });

  test("a single year expands to itself", () => {
    expect(expandSpan("5")).toEqual(["5"]);
  });

  test("comma-separated parts are all expanded", () => {
    expect(expandSpan("F, 4–6")).toEqual(["0", "4", "5", "6"]);
  });

  test("accepts a plain hyphen as well as an en dash", () => {
    expect(expandSpan("1-3")).toEqual(["1", "2", "3"]);
  });

  test("returns strings, matching how the register writes years", () => {
    expect(expandSpan("1–2")).toEqual(["1", "2"]);
    expect(expandSpan("1–2").every((y) => typeof y === "string")).toBe(true);
  });

  test("does not assume the range stops at 9", () => {
    expect(expandSpan("9–11")).toEqual(["9", "10", "11"]);
  });

  /**
   * `Number("")` is 0, which is also förskoleklass, so an empty token must be
   * rejected explicitly or a ragged span would grow a phantom F.
   */
  test("unreadable and empty parts are skipped, never read as F", () => {
    expect(expandSpan("")).toEqual([]);
    expect(expandSpan("   ")).toEqual([]);
    expect(expandSpan("okänd")).toEqual([]);
    expect(expandSpan("1–3,")).toEqual(["1", "2", "3"]);
  });
});

describe("yearsOverlap", () => {
  test("true when the lists share at least one year", () => {
    expect(yearsOverlap(["1", "2", "3"], ["3", "4"])).toBe(true);
  });

  test("false when they are disjoint", () => {
    expect(yearsOverlap(["1", "2", "3"], ["4", "5"])).toBe(false);
  });

  test("förskoleklass only matches förskoleklass", () => {
    expect(yearsOverlap(["0"], ["0"])).toBe(true);
    expect(yearsOverlap(["0"], ["1"])).toBe(false);
    expect(yearsOverlap(["1", "2"], ["0"])).toBe(false);
  });

  /**
   * The gymnasieskola case. Skolverket reports no years for gy, so its units
   * arrive with an empty list and match no year filter at all.
   */
  test("a unit with no reported years matches nothing", () => {
    expect(yearsOverlap([], ["1", "2"])).toBe(false);
    expect(yearsOverlap([], [])).toBe(false);
  });

  test("selecting nothing is handled by the caller, not here", () => {
    expect(yearsOverlap(["1"], [])).toBe(false);
  });

  test("is symmetric", () => {
    expect(yearsOverlap(["1", "2"], ["2", "3"])).toBe(
      yearsOverlap(["2", "3"], ["1", "2"]),
    );
  });

  /**
   * Matching is normalised the same way display is: `formatYears` parses
   * tokens through `level`, so a raw string comparison here would render a
   * non-canonical year correctly on the detail page while silently matching
   * no chip in the list. Defensive — the register writes "1" and "0" today.
   */
  test("a non-canonical year token still matches its chip", () => {
    expect(yearsOverlap(["01", " 2 "], ["1"])).toBe(true);
    expect(yearsOverlap(["F"], ["0"])).toBe(true);
    expect(yearsOverlap(["0"], ["F"])).toBe(true);
  });

  test("unreadable tokens match nothing rather than colliding", () => {
    // `Number("")` is 0, which is förskoleklass — `level` returns NaN instead.
    expect(yearsOverlap([""], ["0"])).toBe(false);
    expect(yearsOverlap(["tolv"], ["12"])).toBe(false);
  });
});

describe("formatYears", () => {
  test("a contiguous run becomes a single span", () => {
    expect(formatYears(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"])).toBe("F–9");
    expect(formatYears(["1", "2", "3"])).toBe("1–3");
  });

  test("a single year is not written as a range", () => {
    expect(formatYears(["0"])).toBe("F");
    expect(formatYears(["5"])).toBe("5");
  });

  /** Gaps stay visible — "F, 4–6" must not be flattened to a false "F–6". */
  test("non-contiguous years keep their gaps", () => {
    expect(formatYears(["0", "4", "5", "6"])).toBe("F, 4–6");
    expect(formatYears(["1", "2", "7", "8", "9"])).toBe("1–2, 7–9");
    expect(formatYears(["1", "3", "5"])).toBe("1, 3, 5");
  });

  test("empty years give an empty string, not '0 årskurser'", () => {
    expect(formatYears([])).toBe("");
  });

  /**
   * The detail page renders `school.årskurser` straight from JSON that is cast
   * to `SkolaDetalj` without validation — from the live API, or from an export
   * file old enough to predate the field. A missing field must render a dash,
   * not throw and take the whole page down with a 500.
   */
  test("a missing field is an empty string, not a crash", () => {
    expect(formatYears(undefined)).toBe("");
    expect(formatYears(null)).toBe("");
  });

  test("sorts numerically, so 10 follows 9 rather than 1", () => {
    expect(formatYears(["10", "9"])).toBe("9–10");
  });

  test("tolerates duplicates and unreadable entries", () => {
    expect(formatYears(["1", "1", "2"])).toBe("1–2");
    expect(formatYears(["1", "okänd", "2"])).toBe("1–2");
  });

  test("round-trips with expandSpan for a contiguous span", () => {
    expect(formatYears(expandSpan("F–9"))).toBe("F–9");
    expect(formatYears(expandSpan("4–6"))).toBe("4–6");
  });
});
