"use client";

import { site } from "@/config/site";
import { toggleInList, type HuvudmanQuery } from "@/lib/query";
import type { KommunOption } from "@/lib/school-select";
import type { HuvudmanTyp, SkolformCode } from "@/lib/types";
import type { Patch } from "@/hooks/use-query-params";
import { FilterGroup, SelectField, Sidebar, SidebarFootnote, Toggle } from "./controls";
import { HuvudmannatypCheckboxes, SkolformRadios } from "./groups";

export function HuvudmanFilters({
  query,
  counts,
  formCounts,
  kommuner,
  activeCount,
  onChange,
}: {
  query: HuvudmanQuery;
  counts: Record<HuvudmanTyp, number>;
  formCounts: Map<SkolformCode, number>;
  kommuner: KommunOption[];
  /** Active filter count, shown on the collapsed toggle below `lg`. */
  activeCount: number;
  onChange: (patch: Patch, replace?: boolean) => void;
}) {
  const selectForm = (next: SkolformCode | null) =>
    onChange({ skolform: next, sort: null, dir: null });

  return (
    <Sidebar activeCount={activeCount}>
      <FilterGroup label="Verksam i kommun">
        <SelectField
          name="kommun"
          value={query.kommun ?? ""}
          onChange={(kommun) => onChange({ kommun: kommun || null })}
          allLabel={site.allaKommuner}
          label="Filtrera på kommun"
          options={kommuner.map((k) => ({ value: k.kod, label: k.name }))}
        />
      </FilterGroup>

      <SkolformRadios
        label="Skolform"
        counts={formCounts}
        selected={query.skolform}
        onSelect={selectForm}
      />

      <HuvudmannatypCheckboxes
        label="Typ"
        counts={counts}
        selected={query.typ}
        onToggle={(t) => onChange({ typ: toggleInList(query.typ, t, true) })}
      />

      <FilterGroup label="Koncerntillhörighet">
        <Toggle
          label="Endast koncernbolag"
          on={query.koncernOnly}
          onToggle={() => onChange({ koncern: query.koncernOnly ? null : "1" })}
        />
      </FilterGroup>

      <SidebarFootnote>{site.footnotes.bolagsdata}</SidebarFootnote>
    </Sidebar>
  );
}
