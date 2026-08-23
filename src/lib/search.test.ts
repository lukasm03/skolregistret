import { describe, expect, test } from "bun:test";
import { fold, matches, needle } from "./search";
import { sortRows } from "./sort-rows";

describe("fold", () => {
  test("folds the three Swedish letters onto their base", () => {
    expect(fold("Mälardalen")).toBe("malardalen");
    expect(fold("Ängelholm")).toBe("angelholm");
    expect(fold("Högalidsskolan")).toBe("hogalidsskolan");
  });

  test("folds accented spellings that turn up in huvudman names", () => {
    expect(fold("Académie")).toBe("academie");
    expect(fold("Lycée Français")).toBe("lycee francais");
  });

  test("leaves text with nothing to fold alone", () => {
    expect(fold("Vasaskolan 3")).toBe("vasaskolan 3");
    expect(fold("556036-0793")).toBe("556036-0793");
  });

  test("is stable when applied twice", () => {
    expect(fold(fold("Mälardalen"))).toBe("malardalen");
  });
});

describe("needle", () => {
  test("trims, so a term of only spaces is not a filter", () => {
    expect(needle("   ")).toBe("");
    expect(needle("  Mälar ")).toBe("malar");
  });

  test("keeps the space between two words", () => {
    expect(needle("norra real")).toBe("norra real");
  });
});

describe("matches", () => {
  test("finds a name typed without its å, ä or ö", () => {
    expect(matches("Mälardalens högstadium", needle("malardalen"))).toBe(true);
    expect(matches("Mälardalens högstadium", needle("hogstadium"))).toBe(true);
  });

  test("still finds a name typed with them", () => {
    expect(matches("Mälardalens högstadium", needle("mälardalen"))).toBe(true);
  });

  test("does not match something that is not there", () => {
    expect(matches("Vasaskolan", needle("mälardalen"))).toBe(false);
  });
});

/**
 * The half of this that must not change. Å, Ä and Ö are letters of the Swedish
 * alphabet and sort after Z; folding them is a widening of what counts as a
 * *hit*, and it has no business reaching the order rows are displayed in.
 */
describe("folding does not reach sorting", () => {
  test("Ö still sorts after Z, not with O", () => {
    const rows = ["Östra", "Zenit", "Oxelö"];
    const sorted = sortRows(
      rows,
      (r) => r,
      false,
      (a, b) => a.localeCompare(b, "sv"),
    );
    expect(sorted).toEqual(["Oxelö", "Zenit", "Östra"]);
  });
});
