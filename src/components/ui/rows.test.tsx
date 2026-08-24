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
    test("reaches the accessibility tree as exactly one link", () => {
      // Not one anchor: the row's hit area is one empty anchor per cell,
      // because Safari will not position a `<tr>` and the pseudo-element that
      // used to stretch over the row escaped it. What has to stay singular is
      // what a reader hears, which is the anchors that are not `aria-hidden`.
      const anchors = render(true).match(/<a\b[^>]*>/g) ?? [];
      expect(anchors.filter((a) => !a.includes("aria-hidden"))).toHaveLength(1);
    });

    test("puts a piece of the hit area over every cell", () => {
      const html = render(true);
      // Three columns and the trailing spacer: the real link covers the first,
      // an overlay covers the other three. A gap here is a dead stripe in a
      // row that highlights as though all of it were clickable.
      expect(html.match(/<a\b[^>]*aria-hidden/g) ?? []).toHaveLength(3);
    });

    test("names that link with the row's subject", () => {
      expect(render(true)).toContain('aria-label="Visa Mälardalens skola"');
    });

    test("leaves every other cell readable", () => {
      const html = render(true);
      // The figures are the point of the table. A cell that only ever appears
      // inside an `aria-hidden` link is a cell nobody on a screen reader has,
      // so each one has to open directly on its own text — the overlay anchor
      // is a sibling that follows it, never a wrapper around it.
      expect(html).toMatch(/<td[^>]*>Nacka</);
      expect(html).toMatch(/<td[^>]*>412</);
    });

    test("hides nothing that has content in it", () => {
      const html = render(true);
      // This is the regression the whole file exists for: an `aria-hidden`
      // anchor is fine, an `aria-hidden` anchor with something inside it is a
      // figure nobody can read. Every overlay has to close immediately.
      expect(html).not.toMatch(/<a\b[^>]*aria-hidden[^>]*>(?!<\/a>)/);
      // The trailing spacer holds an overlay and nothing else — no text of its
      // own ever goes into an `aria-hidden` cell.
      expect(html).not.toMatch(/<td[^>]*aria-hidden[^>]*>[^<]/);
    });

    test("anchors every piece of the hit area on a cell, never on the row", () => {
      const html = render(true);
      // The bug this replaced: `relative` was on the `<tr>`, and Safari does
      // not position table rows — `getComputedStyle(tr).position` reads
      // `static` there whatever the rule says. The overlays resolved against
      // `TableScroller`'s wrapper instead, each became the size of the whole
      // table, and the last row of the page collected every click in it.
      //
      // So the row must not be what anything is anchored on, and each cell
      // must be positioned. `relative` as a class of its own, not as the tail
      // of `[&>td]:relative` — which is the one that has to be there.
      expect(html).not.toMatch(/<tr[^>]*class="[^"]*\srelative[\s"]/);
      expect(html).toMatch(/<tr[^>]*class="[^"]*\[&amp;&gt;td\]:relative/);
      expect(html).toContain("after:absolute after:inset-0");
    });

    test("keeps the table in the border model those cells can be anchored in", () => {
      // Under `border-collapse: collapse` a cell's borders belong to the table
      // rather than to the cell, which is not a box to hang a hit area off.
      //
      // What can be asserted here is the class that produces the geometry,
      // never the geometry — `renderToStaticMarkup` has no layout. Clicking
      // the first row of `/skolor` and landing on it is the real check.
      expect(render(true)).toMatch(/<table[^>]*class="[^"]*\bborder-separate\b/);
    });

    test("draws the row's rule on its cells, where the model can see it", () => {
      // The separated model ignores `border` on rows (CSS 2.1 §17.6.1), so a
      // `border-b` on the `<tr>` would paint nothing and every row separator
      // in the app would quietly vanish.
      //
      // Matched in its escaped form: the class is `[&>td]:border-b`, and both
      // of those characters are written as entities inside an attribute.
      expect(render(true)).toMatch(/<tr[^>]*class="[^"]*\[&amp;&gt;td\]:border-b/);
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
      // Including no overlays: a row with no `rowHref` has nothing to cover.
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
