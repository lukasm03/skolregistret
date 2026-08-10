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
   * Regression: `Number("")` is 0 and "F" is also level 0, so an empty span
   * used to parse as förskoleklass and match the "F" chip. It now yields no
   * levels at all. Callers no longer have to guard, though
   * `src/lib/school-select.ts` still does — cheaper than expanding a string
   * to discover it is empty.
   */
  test("an empty span matches nothing — not even F", () => {
    expect(spansOverlap("", "F")).toBe(false);
    expect(spansOverlap("", "1–9")).toBe(false);
    expect(spansOverlap("F", "")).toBe(false);
  });

  test("whitespace-only and ragged spans are treated the same way", () => {
    expect(spansOverlap("   ", "F")).toBe(false);
    // A trailing separator leaves an empty part, which must not become F.
    expect(spansOverlap("1–3,", "F")).toBe(false);
    expect(spansOverlap("1–3,", "1–3")).toBe(true);
  });
});
