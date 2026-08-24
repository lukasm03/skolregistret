import type { Direction } from "@/lib/compare";

/**
 * The one place a direction becomes a colour.
 *
 * `lib/compare.ts` decides which side of an average a figure falls on; this
 * map decides what that looks like. Splitting them is what lets the nyckeltal
 * table, the programtabell and the enkättabell agree without importing each
 * other, and what keeps `src/lib` free of anything visual.
 *
 * Colour is never the only carrier: every figure it applies to has the signed
 * difference printed beside it, in the same cell.
 */

/** The figure itself. `none` is plain ink — the measure has no better side. */
export const valueTone: Record<Direction, string> = {
  over: "text-over",
  under: "text-under",
  level: "text-ink-muted",
  none: "text-ink",
};
