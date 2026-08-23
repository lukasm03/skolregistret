"use client";

import { site } from "@/config/site";
import { skolformer } from "@/config/skolformer";
import { HUVUDMANTYP_ORDER, type HuvudmanTyp, type SkolformCode } from "@/lib/types";
import { CheckboxControl, FilterGroup, RadioControl } from "./controls";

/**
 * The two filter groups all three list pages ask the same question with.
 *
 * `controls.tsx` next door holds the generic controls — a checkbox, a radio, a
 * chip — and knows nothing about the register. These do: they are a particular
 * question about skolformer and huvudmannatyper, and each of the three filter
 * panels had its own byte-identical copy, comments included. The only thing
 * that ever differed between them is the heading, so that is the only thing
 * they take.
 */

/**
 * One skolform at a time. Only the forms the current selection can still
 * produce get a line, plus whichever one is selected — a form that would empty
 * the list is a control that looks like it works and does not.
 *
 * `label` differs per page because the heading has to read back what the page
 * is about: the koncern list asks about "skolformer i koncernen", which is a
 * different question from a unit's own form.
 */
export function SkolformRadios({
  label,
  counts,
  selected,
  onSelect,
}: {
  label: string;
  /** How many rows each form would give you under the rest of the filter. */
  counts: Map<SkolformCode, number>;
  selected: SkolformCode | undefined;
  onSelect: (next: SkolformCode | null) => void;
}) {
  return (
    <FilterGroup label={label}>
      {/* Native radios sharing one name are already a group to the platform;
          the role names it for a screen reader. */}
      <div role="radiogroup" aria-label="Skolform" className="flex flex-col gap-[7px]">
        <RadioControl
          name="skolform"
          label={site.allaSkolformer}
          checked={!selected}
          onSelect={() => onSelect(null)}
        />
        {skolformer
          .filter((f) => counts.has(f.code) || selected === f.code)
          .map((f) => (
            <RadioControl
              key={f.code}
              name="skolform"
              label={f.label}
              count={counts.get(f.code) ?? 0}
              checked={selected === f.code}
              onSelect={() => onSelect(f.code)}
            />
          ))}
      </div>
    </FilterGroup>
  );
}

/**
 * Kommunal or fristående, either or both.
 *
 * `label` differs for the reason `active-filters.ts` gives where it reads
 * these back: the skolenhet list says "Huvudmannatyp" to keep it apart from
 * skolform, while a page already about huvudmän needs only "Typ".
 */
export function HuvudmannatypCheckboxes({
  label,
  counts,
  selected,
  onToggle,
}: {
  label: string;
  counts: Record<HuvudmanTyp, number>;
  selected: HuvudmanTyp[];
  onToggle: (typ: HuvudmanTyp) => void;
}) {
  return (
    <FilterGroup label={label}>
      <div className="flex flex-col gap-[7px]">
        {HUVUDMANTYP_ORDER.filter((t) => counts[t] > 0 || selected.includes(t)).map(
          (t) => (
            <CheckboxControl
              key={t}
              label={t}
              count={counts[t]}
              checked={selected.includes(t)}
              onToggle={() => onToggle(t)}
            />
          ),
        )}
      </div>
    </FilterGroup>
  );
}
