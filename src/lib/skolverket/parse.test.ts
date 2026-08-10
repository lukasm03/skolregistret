import { describe, expect, test } from "bun:test";
import { spansOverlap } from "./parse";

/**
 * The årskurs filter compares a unit's display span ("F–9", "F, 4–6") against
 * a chip ("4–6"), so both sides go through the same expansion. "F" is level 0.
 */
describe("spansOverlap", () => {
  test("a range contains the grades between its ends", () => {
    expect(spansOverlap("F–9", "4–6")).toBe(true);
    expect(spansOverlap("1–3", "3–5")).toBe(true);
  });

  test("adjacent but disjoint ranges do not overlap", () => {
    expect(spansOverlap("1–3", "4–6")).toBe(false);
    expect(spansOverlap("7–9", "F")).toBe(false);
  });

  test("F is its own level, below 1", () => {
    expect(spansOverlap("F–9", "F")).toBe(true);
    expect(spansOverlap("1–9", "F")).toBe(false);
    expect(spansOverlap("F", "F")).toBe(true);
  });

  test("comma-separated parts are all considered", () => {
    expect(spansOverlap("F, 4–6", "4–6")).toBe(true);
    expect(spansOverlap("F, 4–6", "1–3")).toBe(false);
    expect(spansOverlap("F, 7–9", "F")).toBe(true);
  });

  test("accepts a hyphen as well as an en dash", () => {
    expect(spansOverlap("1-3", "2–2")).toBe(true);
  });

  test("a single grade is treated as a one-wide range", () => {
    expect(spansOverlap("5", "4–6")).toBe(true);
    expect(spansOverlap("5", "1–3")).toBe(false);
  });

  test("is symmetric", () => {
    expect(spansOverlap("F–3", "3–6")).toBe(spansOverlap("3–6", "F–3"));
  });

  test("an unparseable span matches nothing instead of throwing", () => {
    expect(spansOverlap("okänd", "F–9")).toBe(false);
    expect(spansOverlap("okänd", "F")).toBe(false);
  });

  /**
   * Pinning a sharp edge rather than endorsing it: `Number("")` is 0 and "F"
   * is level 0, so an empty span parses as förskoleklass instead of as "no
   * grades". Not reachable today — the only caller
   * (`src/lib/school-select.ts`) guards with `span ? … : false` — but anyone
   * calling this directly with a unit's raw span would get a false match.
   */
  test("KNOWN EDGE: an empty span parses as F, so it must be guarded by callers", () => {
    expect(spansOverlap("", "F")).toBe(true);
    expect(spansOverlap("", "1–9")).toBe(false);
  });
});
