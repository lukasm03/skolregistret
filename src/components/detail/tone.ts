import type { Direction } from "@/lib/compare";

/**
 * The one place a direction becomes a colour.
 *
 * `lib/compare.ts` decides which side of an average a figure falls on; these
 * maps decide what that looks like. Splitting them is what lets the nyckeltal
 * cards, the programtabell and the enkätkort agree without importing each
 * other, and what keeps `src/lib` free of anything visual.
 *
 * Colour is never the only carrier: every figure it applies to has the signed
 * difference printed beside it, and every band has its markers labelled.
 */

/** The figure itself. `none` is plain ink — the measure has no better side. */
export const valueTone: Record<Direction, string> = {
  over: "text-over",
  under: "text-under",
  level: "text-ink-muted",
  none: "text-ink",
};

/** A deviation bar or a rank marker. */
export const barTone: Record<Direction, string> = {
  over: "bg-over",
  under: "bg-under",
  level: "bg-ink-faint",
  none: "bg-ink-faint",
};

/** The filled part of a comparison band, behind the markers. */
export const bandTone: Record<Direction, string> = {
  over: "bg-over-bg",
  under: "bg-under-bg",
  level: "bg-line-softer",
  none: "bg-line-softer",
};

/**
 * The verdict pill. Amber rather than red on the under side: the pill is a
 * label to weigh, and the register grades nothing — the figure beside it
 * already carries the colour that says which way it went.
 */
export const pillTone: Record<Direction, string> = {
  over: "border-ok-line bg-ok-bg text-over",
  under: "border-warn-line bg-warn-bg text-under",
  level: "border-line-softer bg-surface-subtle text-ink-muted",
  none: "border-line-softer bg-surface-subtle text-ink-muted",
};
