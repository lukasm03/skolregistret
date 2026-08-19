# design-sync notes — skolregistret

## This repo is not a design-system package

`skolregistret` is a private Next.js 16 app: no `dist/`, no library build, no
`exports` field, no Storybook, no `*.stories.*`. A straight package-shape sync
is impossible. The agreed approach (user decision, 2026-08-19) is to **extract a
UI kit** from the app first, then sync that kit — `shape: "package"`.

## Settled decisions (do not re-ask)

- **Scope: all 45 exported components** across 8 files:
  - Primitives — `src/components/ui/primitives.tsx` (15): Label, SectionTitle,
    Stat, StatFacts, MetaField, StatGrid, StatusPill, KoncernPill, Dot,
    FactList, RailSection, Note, EmptyBox, ButtonLink, BackLink
  - Controls — `src/components/filters/controls.tsx` (10): FilterGroup,
    CheckboxControl, RadioControl, Chip, Toggle, SelectField, RangeField,
    MultiSelectDropdown, SidebarFootnote, Sidebar
  - Icons — `src/components/ui/icons.tsx` (7): CaretRight, ChevronDown,
    ChevronLeft, ChevronRight, Check, Close, SortArrow
  - List — `src/components/list/ListChrome.tsx` (6): ListToolbar,
    FilterSummary, NoMatches, ListFooter, Pagination, PerPageControl
  - Data — `src/components/ui/DataTable.tsx`, `DataGrid.tsx` (3): DataTable,
    TableScroller, DataGrid
  - Navigation — `src/components/ui/Tabs.tsx` (1): Tabs
  - Detail — `src/components/detail/ComparisonBand.tsx` (2): ComparisonBand,
    BandLegend
  - Layout — `src/components/layout/AppShell.tsx` (1): AppShell
- **Excluded**: everything bound to `allt.json` shapes — NyckeltalCards,
  EnkatCards, SalsaCards, KoncernTree, DokumentList, ArsredovisningList, the
  `views/` compositions, and the `tables/` column definitions. They can't
  render standalone.
- **Non-component exports to exclude** via `componentSrcMap: null` —
  `cellClass`, `headerClass`, `tableMinWidth` (DataTable.tsx), `ROW_HEIGHT`,
  `HEADER_HEIGHT` (DataGrid.tsx).
- **Preview scope: author rich previews for all 45** (user picked (b) "author
  everything" in the §2.5 slider).
- **Target project**: create a NEW one named **"Skolregistret UI"** (name
  confirmed by the user). It did not exist as of 2026-08-19 — the account had
  only "Modernist" and "Design System", neither related to this repo.

## Build gotchas found during exploration

- **`next/link`** is imported by `primitives.tsx` (ButtonLink, BackLink),
  `DataTable.tsx`, `DataGrid.tsx` and `AppShell.tsx`. There is no Next router in
  a preview — alias `next/link` to a plain `<a>` shim at bundle time.
- **Tailwind v4**: `src/app/globals.css` is `@import "tailwindcss"` plus the
  token block. It must be **compiled** (`@tailwindcss/cli`, scanning the kit
  sources) into a static stylesheet before it can serve as `cfg.cssEntry` — the
  raw file resolves no utilities.
- **Tokens** live on `:root` in `src/app/globals.css` and are mapped into
  Tailwind via `@theme inline` (l.161) and `@theme` (l.207). The file carries
  extensive comments on WCAG-measured ink steps — read it before touching
  colours; several values are at their contrast floor.
- **Fonts**: Instrument Sans + IBM Plex Mono, loaded by `next/font/google` in
  `src/app/layout.tsx` as `--font-instrument-sans` / `--font-plex-mono`.
  `next/font` ships nothing the bundle can carry, so expect `[FONT_MISSING]`.
  Plan: fetch the woff2 files from Google Fonts (both are OFL) and wire them
  via `cfg.extraFonts`. User was told this and did not object.
- **`@/` path alias** resolves via `tsconfig.json` — set `cfg.tsconfig` so
  esbuild picks up `compilerOptions.paths`.
- Package manager is **bun** (`bun.lockb`/`bun.lock`, `packageManager` pinned).
  Per the user's global preference, use bun, not npm, for repo-level commands.
  (The converter's own `.ds-sync/` deps still install with npm — that dir is
  deliberately isolated from the repo's lockfile.)
- Do **not** run `bun run build` — the user runs the full build themselves.
- **Kit build implementation** (`.design-sync/kit/`): `entry.tsx` is a barrel
  re-exporting exactly the 45 scoped names via relative imports (no `@/`) so
  the emitted `.d.ts` (via `tsconfig.json`'s declaration-only build) never
  picks up unrelated exports. `bundle-tsconfig.json` maps `@/*` and aliases
  `next/link` → `next-link-shim.tsx`, and is passed as `cfg.tsconfig` so the
  **converter's own** esbuild pass does the bundling — do NOT pre-bundle the
  JS yourself with an external `react`/`react-dom`: a nested CJS dependency
  (`@tanstack/react-table`'s `use-sync-external-store` shim) calls
  `require("react")` internally, and marking react external produces a
  runtime `Dynamic require of "react" is not supported` crash that empties
  `window.<globalName>` entirely (all components fail `[BUNDLE_EXPORT]`). Let
  the converter's own `reactShim` redirect handle every react import site,
  including nested ones — that's what makes it work. `build.mjs` in that
  directory now only compiles CSS (via `postcss` + `@tailwindcss/postcss`,
  both already in the app's `node_modules`) — nothing bundles the JS.
- **CSS must be recompiled after previews are authored, not before.**
  `kit/build.mjs`'s Tailwind content scan only sees classes that exist
  somewhere in `REPO` when it runs. An arbitrary-value class used only inside
  a `.design-sync/previews/<Name>.tsx` file (e.g. `pt-[180px]`) is invisible
  to a stylesheet compiled earlier — the class renders inert, not missing
  outright, so it's easy to miss in a quick look. Re-run `node
  .design-sync/kit/build.mjs` any time a preview introduces a class that
  isn't already used in `src/`, then rebuild the bundle.
- **Grouping**: primitives/icons/`DataTable`/`DataGrid`/`TableScroller`/`Tabs`
  all live under `src/components/ui/`, which is a generic dir name the
  package adapter filters out — they'd all default to one "general" group.
  Fixed via `docsMap` stub files (`.design-sync/kit/docs-stubs/<Name>.md`,
  frontmatter `category: Primitives|Icons|Data|Navigation`) that only exist to
  set `c.group`; they carry no real documentation. `filters`/`list`/`detail`/
  `layout` components get correct groups automatically from their real
  directory name.
- **Overlay/wide components** need `cfg.overrides`: `DataTable`, `DataGrid`,
  `TableScroller`, `AppShell` are `cardMode: "column"` (full-width). "Wide"
  components (data tables, full-width bars — exports wider than a
  multi-column grid cell): `{"cardMode": "column"}` keeps every export at
  full card width, one per row.
  `MultiSelectDropdown` and `PerPageControl` are `cardMode: "single"` with an
  explicit `viewport` **and `primaryStory` pinned to the "Open" export** — a
  bare `cardMode: "single"` with no `primaryStory` silently shows the
  *first* alphabetical export, which was the boring "Closed" state for both;
  the popover the override exists to show never appeared until pinned.
  `PerPageControl`'s panel opens **upward** (`bottom-[calc(100%+4px)]`), so
  its preview wraps the demo in `pt-[180px]` to leave headroom above the
  button — without it the open panel renders off the top of the card,
  invisible in the screenshot even though the state is genuinely open.
  `Sidebar` needed no click-simulation trick: at its `1100x320` viewport
  (≥ the `lg` breakpoint) the component's own responsive classes always show
  the desktop rail, ignoring the internal mobile-disclosure `open` state.
- **Known render warns**: `CaretRight`, `Check`, `ChevronDown`, `ChevronLeft`,
  `ChevronRight`, `Close`, `SortArrow` all trip `[RENDER_THIN]` ("mounts have
  no text and paint nothing") on every re-run — false positive, confirmed
  visually against their screenshots each time. They're pure-SVG icons with
  `aria-hidden` (no text content is exactly correct, not a bug) at 20px, and
  the heuristic looks for mounted text. Not a new warn to chase on future
  syncs.

## Re-sync risks

- The kit barrel and its build step are scaffolding this sync introduces; if
  someone edits `src/components/**` without re-running the kit build, the synced
  bundle goes stale silently.
- The Google-Fonts woff2 files are network-fetched at sync time, not vendored
  from the repo — a future run needs network, or the files must be committed.
