import { describe, expect, test } from "bun:test";
import {
  DASH,
  bytes,
  dec,
  kommunLong,
  median,
  num,
  plural,
  signed,
  slugify,
} from "./format";

describe("num", () => {
  test("groups thousands the Swedish way (non-breaking space)", () => {
    expect(num(1234567)).toBe((1234567).toLocaleString("sv-SE"));
  });

  test("renders a dash for missing values rather than 0", () => {
    expect(num(null)).toBe(DASH);
    expect(num(undefined)).toBe(DASH);
    // 0 is a real figure and must survive.
    expect(num(0)).toBe("0");
  });
});

describe("dec", () => {
  test("always one decimal, comma-separated", () => {
    expect(dec(12)).toBe("12,0");
    expect(dec(12.34)).toBe("12,3");
    expect(dec(0)).toBe("0,0");
  });

  test("dashes on missing", () => {
    expect(dec(null)).toBe(DASH);
  });
});

describe("signed", () => {
  test("spells the direction out, both ways", () => {
    expect(signed(2.34)).toBe("+2,3");
    expect(signed(-1.4)).toBe("−1,4");
  });

  test("uses a typographic minus, not a hyphen", () => {
    // The column is mono and right-aligned; a hyphen is narrower than a digit
    // and leaves the figures ragged.
    expect(signed(-1)[0]).toBe("\u2212");
  });

  test("no difference reads as none, not as a positive zero", () => {
    expect(signed(0)).toBe("±0");
    // Rounds to the shown precision first, so +0,04 is not reported as "+0,0".
    expect(signed(0.04)).toBe("±0");
  });

  test("dashes on missing", () => {
    expect(signed(null)).toBe(DASH);
    expect(signed(undefined)).toBe(DASH);
  });
});

describe("bytes", () => {
  test("switches unit at each 1024 boundary", () => {
    expect(bytes(512)).toBe("512\u00A0B");
    expect(bytes(1023)).toBe("1023\u00A0B");
    expect(bytes(1024)).toBe("1\u00A0kB");
    expect(bytes(1024 * 1024)).toBe("1,0\u00A0MB");
  });

  test("dashes on missing", () => {
    expect(bytes(null)).toBe(DASH);
  });
});

describe("plural", () => {
  test("picks the singular only at exactly one", () => {
    expect(plural(1, "skolenhet", "skolenheter")).toBe("1 skolenhet");
    expect(plural(0, "skolenhet", "skolenheter")).toBe("0 skolenheter");
    expect(plural(2, "skolenhet", "skolenheter")).toBe("2 skolenheter");
  });
});

describe("kommunLong", () => {
  test("adds the genitive -s", () => {
    expect(kommunLong("Båstad")).toBe("Båstads kommun");
  });

  test("drops it after s, x and z, as the kommuner spell themselves", () => {
    expect(kommunLong("Vännäs")).toBe("Vännäs kommun");
    expect(kommunLong("Borås")).toBe("Borås kommun");
    expect(kommunLong("Lux")).toBe("Lux kommun");
    expect(kommunLong("Linz")).toBe("Linz kommun");
  });

  test("only the final letter decides — Växjö ends in ö, so it takes the -s", () => {
    expect(kommunLong("Växjö")).toBe("Växjös kommun");
  });
});

describe("median", () => {
  test("averages the middle pair on an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  test("takes the middle value on an odd count", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  test("does not mutate the input", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });

  test("null on empty rather than 0 or NaN", () => {
    expect(median([])).toBeNull();
  });
});

/**
 * slugify is load-bearing beyond formatting: `/huvudman/[slug]` and
 * `/koncern/[slug]` build `generateStaticParams` from it, and
 * `src/lib/api-normalize.ts` derives the huvudman slug the same way. A change
 * here silently 404s detail pages rather than failing loudly, so the exact
 * mapping is pinned.
 */
describe("slugify", () => {
  test("folds Swedish vowels rather than stripping them", () => {
    expect(slugify("Åsa Ängen Öholm")).toBe("asa-angen-oholm");
  });

  test("collapses runs of punctuation into a single hyphen", () => {
    expect(slugify("Kunskapsskolan i Sverige AB")).toBe("kunskapsskolan-i-sverige-ab");
    expect(slugify("A / B  &  C")).toBe("a-b-c");
  });

  test("trims leading and trailing hyphens", () => {
    expect(slugify("  Stockholm!  ")).toBe("stockholm");
    expect(slugify("(AB)")).toBe("ab");
  });

  test("is idempotent — slugifying a slug changes nothing", () => {
    const once = slugify("Fridaskolorna AB");
    expect(slugify(once)).toBe(once);
  });

  test("distinct names can collide, which is why callers dedupe", () => {
    // Documented behaviour, not an accident: see dedupeHuvudmanRows.
    expect(slugify("Vittra AB")).toBe(slugify("Vittra, AB"));
  });
});
