/**
 * Which side of an average a figure falls on, and where it sits on a scale.
 *
 * Three tables on the skolenhet page ask the same two questions of different
 * data — nyckeltal against kommun and riket, gymnasieprogram against riket,
 * enkätsvar against both — so the answer is computed in one place rather than
 * three. The colour that stands for each answer lives with the components, in
 * `src/components/detail/tone.ts`; this file only decides which answer it is.
 */

/** Below this the figure reads as level — it rounds to ±0 anyway. */
export const LEVEL = 0.05;

/**
 * `none` is not "no data": it is a measure with no better direction. A large
 * programme is not a good one, and a low lägsta antagningspoäng is not a bad
 * one, so neither is ever drawn as over or under.
 */
export type Direction = "over" | "under" | "level" | "none";

export function direction(
  diff: number | null | undefined,
  higherIsBetter: boolean | null | undefined,
): Direction {
  if (higherIsBetter == null || diff == null) return "none";
  if (Math.abs(diff) <= LEVEL) return "level";
  return (higherIsBetter ? diff > 0 : diff < 0) ? "over" : "under";
}

/** Reads back as a sentence fragment beside the figure. */
export function omdöme(dir: Direction): string {
  return dir === "over"
    ? "Bättre än riket"
    : dir === "under"
      ? "Sämre än riket"
      : dir === "level"
        ? "I nivå med riket"
        : "Utan riktning";
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Where `v` sits along `[min, max]`, as a percentage for a CSS offset. Values
 * outside the domain pin to its ends rather than overflowing the track — the
 * domains are chosen to hold the ordinary range, not every outlier.
 */
export function positionPct(v: number, [min, max]: [number, number]): number | null {
  if (max <= min) return null;
  // Two decimals is finer than a pixel on any track this app draws, and it
  // keeps the markup from carrying "70.00866425992783%".
  return round2(clamp(((v - min) / (max - min)) * 100, 0, 100));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
