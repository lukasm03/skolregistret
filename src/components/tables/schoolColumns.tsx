import type { Column } from "@/components/ui/DataTable";
import { skolform } from "@/config/skolformer";
import { DASH, num } from "@/lib/format";
import { schoolSortValue, studentsOf, type ListSchool } from "@/lib/school-fields";
import type { SkolformCode } from "@/lib/types";

/**
 * Reusable column definitions for skolenhet tables. Every figure is qualified
 * by skolform, so the columns that show one take the selected form — pass
 * `undefined` for the unit-wide view.
 *
 * `sortValue` is what the column sorts on, and returning `undefined` means
 * "not reported": those rows sort last whichever way the column is pointed.
 */
export const schoolColumns = {
  name: (): Column<ListSchool> => ({
    key: "name",
    header: "Skolenhet",
    strong: true,
    truncate: true,
    cell: (s) => s.name,
    sortValue: (s) => schoolSortValue(s, "name"),
  }),
  huvudman: (width = 168): Column<ListSchool> => ({
    key: "huvudman",
    header: "Huvudman",
    width,
    muted: true,
    truncate: true,
    cell: (s) => s.huvudman,
    sortValue: (s) => schoolSortValue(s, "huvudman"),
  }),
  /** Only worth a column when the list spans more than one kommun. */
  kommun: (width = 130): Column<ListSchool> => ({
    key: "kommun",
    header: "Kommun",
    width,
    muted: true,
    truncate: true,
    cell: (s) => s.kommun ?? DASH,
    sortValue: (s) => schoolSortValue(s, "kommun"),
  }),
  status: (width = 84): Column<ListSchool> => ({
    key: "status",
    header: "Status",
    width,
    muted: true,
    cell: (s) => s.status,
    sortValue: (s) => schoolSortValue(s, "status"),
  }),
  /** What the unit runs — the orienting column when no form is selected. */
  skolformer: (width = 190): Column<ListSchool> => ({
    key: "skolformer",
    header: "Skolformer",
    width,
    muted: true,
    truncate: true,
    cell: (s) =>
      [...s.forms.map((f) => skolform(f)?.short ?? f), ...s.otherForms].join(" · ") ||
      DASH,
  }),
  elever: (form?: SkolformCode, width = 78): Column<ListSchool> => ({
    key: "elever",
    header: "Elever",
    width,
    align: "right",
    mono: true,
    cell: (s) => num(studentsOf(s, form)),
    sortValue: (s) => schoolSortValue(s, "elever", form),
    descFirst: true,
    bar: (s) => studentsOf(s, form),
  }),
};
