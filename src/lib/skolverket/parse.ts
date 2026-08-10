/**
 * Grade-span reading for the register. Spans arrive as display strings
 * ("F–9", "F, 4–6") rather than structured levels, so matching an årskurs
 * filter against one means expanding the string back into levels.
 */

const GRADE_ORDER = (g: string): number =>
  g.toUpperCase() === "F" ? 0 : Number(g);

/** True when two grade spans share at least one årskurs. */
export function spansOverlap(a: string, b: string): boolean {
  const levels = (span: string): number[] => {
    const out: number[] = [];
    for (const part of span.split(",")) {
      const [from, to] = part.split(/[–-]/).map((p) => GRADE_ORDER(p.trim()));
      if (!Number.isFinite(from)) continue;
      const end = Number.isFinite(to) ? to : from;
      for (let i = from; i <= end; i++) out.push(i);
    }
    return out;
  };
  const set = new Set(levels(b));
  return levels(a).some((l) => set.has(l));
}
