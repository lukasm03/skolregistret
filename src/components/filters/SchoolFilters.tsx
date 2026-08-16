"use client";

import { site } from "@/config/site";
import { skolformer, type SkolformDef } from "@/config/skolformer";
import {
  gradeFilterFor,
  toggleInList,
  toggleStatus,
  type SchoolQuery,
} from "@/lib/query";
import type { KommunOption, ProgramOption } from "@/lib/school-select";
import type { Patch } from "@/hooks/use-query-params";
import type { HuvudmanTyp, SkolformCode, SkolStatus } from "@/lib/types";
import {
  CheckboxControl,
  Chip,
  FilterGroup,
  MultiSelectDropdown,
  RadioControl,
  RangeField,
  SelectField,
  Sidebar,
  SidebarFootnote,
} from "./controls";

export function SchoolFilters({
  query,
  counts,
  formCounts,
  statusCounts,
  kommuner,
  programmes,
  form,
  activeCount,
  onChange,
}: {
  query: SchoolQuery;
  counts: Record<HuvudmanTyp, number>;
  formCounts: Map<SkolformCode, number>;
  statusCounts: { status: SkolStatus; count: number }[];
  kommuner: KommunOption[];
  programmes: ProgramOption[];
  form: SkolformDef | undefined;
  /** Active filter count, shown on the collapsed toggle below `lg`. */
  activeCount: number;
  onChange: (patch: Patch, replace?: boolean) => void;
}) {
  // Unchecking the last remaining type drops the param, which means "all"
  // again — the list never ends up empty because of the type filter alone.
  // Årskurser only makes sense once a specific skolform narrows which grades
  // exist; "alla skolformer" mixes grade spans that aren't comparable, and
  // `gradeFilterFor` returns nothing without a form for exactly that reason.
  const grades = gradeFilterFor(form);

  // Switching skolform drops the filters that only made sense for the old
  // one: its årskurs chips and its metric sort.
  const selectForm = (next: SkolformCode | null) =>
    onChange({
      skolform: next,
      arskurs: null,
      program: null,
      sort: null,
      dir: null,
    });

  return (
    <Sidebar activeCount={activeCount}>
      <FilterGroup label="Kommun">
        <SelectField
          name="kommun"
          value={query.kommun ?? ""}
          onChange={(kommun) => onChange({ kommun: kommun || null })}
          allLabel={site.allaKommuner}
          label="Filtrera på kommun"
          options={kommuner.map((k) => ({
            value: k.kod,
            label: k.name,
            count: k.count,
          }))}
        />
      </FilterGroup>

      {/* One skolform at a time: meritvärde and betygspoäng are not the same
          column, and a median across both would not mean anything. */}
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

      <FilterGroup label="Huvudmannatyp">
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

      {grades.length > 0 && (
        <FilterGroup label="Årskurser">
          <div className="flex flex-wrap gap-[5px]">
            {grades.map((a) => (
              <Chip
                key={a}
                active={query.arskurs.includes(a)}
                onToggle={() => onChange({ arskurs: toggleInList(query.arskurs, a) })}
              >
                {a}
              </Chip>
            ))}
          </div>
        </FilterGroup>
      )}

      {/* Programmes are gymnasieskolans equivalent of årskurser: an axis that
          only means something once GY is the selected skolform. */}
      {form?.code === "GY" && programmes.length > 0 && (
        <FilterGroup label="Program">
          <MultiSelectDropdown
            label="Filtrera på program"
            placeholder="Alla program"
            selected={query.program}
            options={programmes.map((p) => ({
              value: p.name,
              label: p.name,
              count: p.count,
            }))}
            onToggle={(name) => onChange({ program: toggleInList(query.program, name) })}
          />
        </FilterGroup>
      )}

      {/* Only the statuses that occur in the data get a line, so a register
          extract without avvecklade units doesn't show a dead checkbox. */}
      <FilterGroup label="Status">
        <div className="flex flex-col gap-[7px]">
          {statusCounts.map(({ status, count }) => (
            <CheckboxControl
              key={status}
              label={status}
              count={count}
              checked={query.status.includes(status)}
              onToggle={() => onChange({ status: toggleStatus(query.status, status) })}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup
        label={form ? `Antal elever i ${form.short.toLowerCase()}` : "Antal elever"}
      >
        <RangeField
          min={query.minElever}
          max={query.maxElever}
          onChange={(bound, value) =>
            // Typing replaces the current history entry — a keystroke is
            // not a step to go back through.
            onChange({ [bound]: value === "" ? null : value }, true)
          }
          placeholderMin={site.elevRange.min}
          placeholderMax={site.elevRange.max}
        />
      </FilterGroup>

      <SidebarFootnote>{site.footnotes.elevantal}</SidebarFootnote>
    </Sidebar>
  );
}
