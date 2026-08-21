import { describe, expect, test } from "bun:test";
import { compareValues, sortRows } from "./sort-rows";

interface Rad {
  kod: string;
  namn: string;
  v?: string | number;
}

const rad = (kod: string, namn: string, v?: string | number): Rad => ({ kod, namn, v });
const byName = (a: Rad, b: Rad) => a.namn.localeCompare(b.namn, "sv");
const koder = (rader: Rad[]) => rader.map((r) => r.kod);

describe("sortRows", () => {
  test("sorts numbers ascending and flips with desc", () => {
    const rows = [rad("a", "A", 30), rad("b", "B", 10), rad("c", "C", 20)];
    expect(koder(sortRows(rows, (r) => r.v))).toEqual(["b", "c", "a"]);
    expect(koder(sortRows(rows, (r) => r.v, true))).toEqual(["a", "c", "b"]);
  });

  test("sorts text with Swedish collation", () => {
    const rows = [rad("ö", "Örebro"), rad("a", "Abc"), rad("ä", "Ängelholm")];
    expect(koder(sortRows(rows, (r) => r.namn))).toEqual(["a", "ä", "ö"]);
  });

  test("a blank sorts last in both directions — a blank is not a low score", () => {
    const rows = [rad("saknar", "Saknar"), rad("låg", "Låg", 5), rad("hög", "Hög", 9)];
    expect(koder(sortRows(rows, (r) => r.v))).toEqual(["låg", "hög", "saknar"]);
    expect(koder(sortRows(rows, (r) => r.v, true))).toEqual(["hög", "låg", "saknar"]);
  });

  test("two blanks keep input order unless a tiebreak says otherwise", () => {
    const rows = [rad("z", "Z"), rad("a", "A")];
    expect(koder(sortRows(rows, (r) => r.v))).toEqual(["z", "a"]);
    expect(koder(sortRows(rows, (r) => r.v, false, byName))).toEqual(["a", "z"]);
    expect(koder(sortRows(rows, (r) => r.v, true, byName))).toEqual(["a", "z"]);
  });

  test("equal values fall through to the tiebreak", () => {
    const rows = [rad("z", "Zeta", 7), rad("a", "Alfa", 7)];
    expect(koder(sortRows(rows, (r) => r.v, false, byName))).toEqual(["a", "z"]);
    expect(koder(sortRows(rows, (r) => r.v, true, byName))).toEqual(["a", "z"]);
  });

  test("does not mutate the input", () => {
    const rows = [rad("b", "B", 2), rad("a", "A", 1)];
    sortRows(rows, (r) => r.v);
    expect(koder(rows)).toEqual(["b", "a"]);
  });

  test("mixed numbers and strings compare without throwing", () => {
    const rows = [rad("t", "Text", "abc"), rad("n", "Nummer", 3)];
    expect(koder(sortRows(rows, (r) => r.v))).toHaveLength(2);
  });
});

describe("compareValues", () => {
  test("numbers numerically, strings by sv collation", () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
    expect(compareValues("ä", "z")).toBeGreaterThan(0);
  });
});
