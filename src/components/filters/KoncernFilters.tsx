"use client";

import { site } from "@/config/site";
import type { KoncernQuery } from "@/lib/query";
import type { SkolformCode } from "@/lib/types";
import type { Patch } from "@/hooks/use-query-params";
import { FilterGroup, RangeField, Sidebar, SidebarFootnote } from "./controls";
import { SkolformRadios } from "./groups";

export function KoncernFilters({
  query,
  formCounts,
  activeCount,
  onChange,
}: {
  query: KoncernQuery;
  formCounts: Map<SkolformCode, number>;
  /** Active filter count, shown on the collapsed toggle below `lg`. */
  activeCount: number;
  onChange: (patch: Patch, replace?: boolean) => void;
}) {
  const selectForm = (next: SkolformCode | null) =>
    onChange({ skolform: next, sort: null, dir: null });

  return (
    <Sidebar activeCount={activeCount}>
      <SkolformRadios
        label="Skolformer i koncernen"
        counts={formCounts}
        selected={query.skolform}
        onSelect={selectForm}
      />

      <FilterGroup label="Antal skolenheter">
        <RangeField
          name="enheter"
          min={query.minEnheter}
          max={query.maxEnheter}
          onChange={(bound, value) =>
            onChange(
              {
                [bound === "min" ? "minEnheter" : "maxEnheter"]:
                  value === "" ? null : value,
              },
              true,
            )
          }
          placeholderMin={0}
          placeholderMax={320}
          minLabel="Minsta antal skolenheter"
          maxLabel="Största antal skolenheter"
        />
      </FilterGroup>

      <FilterGroup label="Antal elever">
        <RangeField
          name="elever"
          min={query.minElever}
          max={query.maxElever}
          onChange={(bound, value) =>
            onChange(
              {
                [bound === "min" ? "minElever" : "maxElever"]:
                  value === "" ? null : value,
              },
              true,
            )
          }
          placeholderMin={site.elevRange.min}
          placeholderMax={90000}
          minLabel="Minsta antal elever"
          maxLabel="Största antal elever"
        />
      </FilterGroup>

      <SidebarFootnote>
        En koncern räknas samman ur alla huvudmän under samma koncernmoder.{" "}
        {site.footnotes.bolagsdata}
      </SidebarFootnote>
    </Sidebar>
  );
}
