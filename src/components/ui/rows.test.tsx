import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DataGrid } from "./DataGrid";
import { DataTable, type Column } from "./DataTable";

/**
 * The shape of a clickable row, pinned for both renderers at once.
 *
 * `DataTable` and `DataGrid` hold separate copies of this markup — one for
 * the server-rendered detail tables, one for the sorted and paged list
 * grids — so the invariant worth stating is that they agree. Every case below
 * runs against both.
 *
 * What it is guarding: every cell used to carry its own copy of the row's
 * link, with all but the first `aria-hidden` so a screen reader would not
 * read six links per row. That hid each cell's *contents* along with the link
 * semantics, so a row announced its name and then a run of empty cells, and
 * every figure on the site was unreachable to assistive technology. No type
 * and no lint rule catches that.
 *
 * Static markup rather than a DOM: what is being checked is what the server
 * sends, and checking it needs no browser.
 */

interface Rad {
  namn: string;
  kommun: string;
  elever: number;
}

const columns: Column<Rad>[] = [
  { key: "namn", header: "Skolenhet", strong: true, truncate: true, cell: (r) => r.namn },
  { key: "kommun", header: "Kommun", width: 130, muted: true, cell: (r) => r.kommun },
  {
    key: "elever",
    header: "Elever",
    width: 78,
    align: "right",
    mono: true,
    cell: (r) => String(r.elever),
  },
];

const rows: Rad[] = [{ namn: "Mälardalens skola", kommun: "Nacka", elever: 412 }];

const shared = {
  columns,
  rows,
  rowKey: (r: Rad) => r.namn,
  label: "Skolenheter",
};

const linked = {
  rowHref: (r: Rad) => `/skolor/${r.namn}`,
  rowLabel: (r: Rad) => `Visa ${r.namn}`,
};

/** The two renderers, each as "markup for these rows, clickable or not". */
const renderers: [string, (clickable: boolean) => string][] = [
  [
    "DataTable",
    (clickable) =>
      renderToStaticMarkup(<DataTable {...shared} {...(clickable ? linked : {})} />),
  ],
  [
    "DataGrid",
    (clickable) =>
      renderToStaticMarkup(
        <DataGrid
          {...shared}
          {...(clickable ? linked : {})}
          sort={{ id: "namn", desc: false }}
          onSortChange={() => {}}
          pageIndex={0}
          pageSize={20}
          onPageChange={() => {}}
        />,
      ),
  ],
];

for (const [name, render] of renderers) {
  describe(`${name}: a clickable row`, () => {
    test("carries exactly one link, however many columns it has", () => {
      expect(render(true).match(/<a\b/g) ?? []).toHaveLength(1);
    });

    test("names that link with the row's subject", () => {
      expect(render(true)).toContain('aria-label="Visa Mälardalens skola"');
    });

    test("leaves every other cell readable", () => {
      const html = render(true);
      // The figures are the point of the table. A cell that only ever appears
      // inside an `aria-hidden` link is a cell nobody on a screen reader has.
      expect(html).toContain(">Nacka</td>");
      expect(html).toContain(">412</td>");
    });

    test("hides nothing that has content in it", () => {
      const html = render(true);
      // The only `aria-hidden` cell in a row is the trailing spacer, which is
      // empty by construction.
      expect(/<td[^>]*aria-hidden[^>]*>(?!<\/td>)/.test(html)).toBe(false);
      expect(html).not.toMatch(/<a[^>]*aria-hidden/);
    });

    test("anchors the stretched hit area on the row", () => {
      const html = render(true);
      // `relative` on the `<tr>` is what the link's `after:inset-0` resolves
      // against; without it the hit area collapses to the first cell.
      expect(html).toMatch(/<tr[^>]*class="[^"]*\brelative\b/);
      expect(html).toContain("after:absolute after:inset-0");
    });

    test("does not clip that hit area with the name column's truncation", () => {
      const html = render(true);
      // `truncate` is `overflow: hidden`, which would cut the stretched link
      // back to its own cell — the span inside the link truncates instead.
      expect(html.match(/<td[^>]*>(?=<a)/)?.[0] ?? "").not.toContain("truncate");
      expect(html).toContain('<span class="min-w-0 truncate">');
    });
  });

  describe(`${name}: a row with nowhere to go`, () => {
    test("has no link at all", () => {
      expect(render(false)).not.toContain("<a ");
    });

    test("still renders every cell", () => {
      const html = render(false);
      expect(html).toContain("Mälardalens skola");
      expect(html).toContain("Nacka");
      expect(html).toContain("412");
    });
  });
}
