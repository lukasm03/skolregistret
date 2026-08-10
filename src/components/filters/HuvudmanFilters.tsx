"use client";

import { site } from "@/config/site";
import { skolformer } from "@/config/skolformer";
import { toggleInList, type HuvudmanQuery } from "@/lib/query";
import type { KommunOption } from "@/lib/school-select";
import type { HuvudmanTyp, SkolformCode } from "@/lib/types";
import type { Patch } from "@/lib/use-query-params";
import {
  CheckboxControl,
  FilterGroup,
  RadioControl,
  SelectField,
  Sidebar,
  SidebarFootnote,
  Toggle,
} from "./controls";

export function HuvudmanFilters({
  query,
  counts,
  formCounts,
  kommuner,
  onChange,
}: {
  query: HuvudmanQuery;
  counts: Record<HuvudmanTyp, number>;
  formCounts: Map<SkolformCode, number>;
  kommuner: KommunOption[];
  onChange: (patch: Patch, replace?: boolean) => void;
}) {
  const selectForm = (next: SkolformCode | null) =>
    onChange({ skolform: next, sort: null, dir: null });

  return (
    <Sidebar>
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

      <FilterGroup label="Skolform">
        <div role="radiogroup" className="flex flex-col gap-[7px]">
          <RadioControl
            label={site.allaSkolformer}
            checked={!query.skolform}
            onSelect={() => selectForm(null)}
          />
          {skolformer
            .filter((f) => formCounts.has(f.code) || query.skolform === f.code)
            .map((f) => (
              <RadioControl
                key={f.code}
                label={f.label}
                count={formCounts.get(f.code) ?? 0}
                checked={query.skolform === f.code}
                onSelect={() => selectForm(f.code)}
              />
            ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Typ">
        <div className="flex flex-col gap-[7px]">
          {(["Kommunal", "Fristående"] as HuvudmanTyp[]).map((t) => (
            <CheckboxControl
              key={t}
              label={t}
              count={counts[t]}
              checked={query.typ.includes(t)}
              onToggle={() => onChange({ typ: toggleInList(query.typ, t, true) })}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Koncerntillhörighet">
        <Toggle
          label="Endast koncernbolag"
          on={query.koncernOnly}
          onToggle={() =>
            onChange({ koncern: query.koncernOnly ? null : "1" })
          }
        />
      </FilterGroup>

      <SidebarFootnote>{site.footnotes.bolagsdata}</SidebarFootnote>
    </Sidebar>
  );
}
