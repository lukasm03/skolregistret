"use client";

import { site } from "@/config/site";
import { skolformer } from "@/config/skolformer";
import type { KoncernQuery } from "@/lib/query";
import type { SkolformCode } from "@/lib/types";
import type { Patch } from "@/hooks/use-query-params";
import {
  FilterGroup,
  RadioControl,
  RangeField,
  Sidebar,
  SidebarFootnote,
} from "./controls";

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
      <FilterGroup label="Skolformer i koncernen">
        {/* Native radios sharing one name are already a group to the
            platform; the role names it for a screen reader. */}
        <div role="radiogroup" aria-label="Skolform" className="flex flex-col gap-[7px]">
          <RadioControl
            name="skolform"
            label={site.allaSkolformer}
            checked={!query.skolform}
            onSelect={() => selectForm(null)}
          />
          {skolformer
            .filter((f) => formCounts.has(f.code) || query.skolform === f.code)
            .map((f) => (
              <RadioControl
                key={f.code}
                name="skolform"
                label={f.label}
                count={formCounts.get(f.code) ?? 0}
                checked={query.skolform === f.code}
                onSelect={() => selectForm(f.code)}
              />
            ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Antal skolenheter">
        <RangeField
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
        />
      </FilterGroup>

      <FilterGroup label="Antal elever">
        <RangeField
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
        />
      </FilterGroup>

      <SidebarFootnote>
        En koncern räknas samman ur alla huvudmän under samma koncernmoder.{" "}
        {site.footnotes.bolagsdata}
      </SidebarFootnote>
    </Sidebar>
  );
}
