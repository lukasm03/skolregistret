# Skolregistret

A browser for the Swedish school register: **skolenheter** (school units) and
**huvudmän** (the organisations that run them), across the whole country, with
filtering, sorting and detail views that compare each unit against its kommun
and against riket.

Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript · Bun.

---

## Getting started

> **This app does not contain its own API.** There are no route handlers
> anywhere in `src/app`. It reads either a separate API server or a local
> register export file. Pick one before you start, or every list will be empty.

```bash
bun install
cp .env.example .env.local     # then edit it — see below
bun dev
```

`.env.example` documents both options in full. In short:

| Variable                 | What it does                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SKOLREGISTER_DATA_FILE` | Absolute path to a register export JSON. **Easiest path — works offline.** When set, it takes priority over the API for every read.                                            |
| `NEXT_PUBLIC_APP_URL`    | Base URL of the API server. Defaults to `http://localhost:3000`, which is also where this app serves — so the default only works if a separate API happens to be on that port. |

With an older export file, some sections (nationella genomsnitt, enkäter,
dokument, per-unit detail) are simply absent and render as _saknas_ rather than
failing.

## Commands

| Command                           |                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `bun dev`                         | Development server                                                                                          |
| `bun run build`                   | Production build. Prerenders **every** skolenhet, huvudman and koncern, so it needs data and takes a while. |
| `bun start`                       | Serve the build                                                                                             |
| `bun run check`                   | **typecheck + lint + test** — run this before committing                                                    |
| `bun run typecheck`               | `tsc --noEmit`                                                                                              |
| `bun run lint` / `lint:fix`       | ESLint (flat config; Next 16 removed `next lint`)                                                           |
| `bun run format` / `format:check` | Prettier                                                                                                    |
| `bun test` / `test:watch`         | 148 tests over the pure logic                                                                               |

## Routes

| Route              |                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `/`                | Redirects to `/skolor`                                                                                               |
| `/skolor`          | The skolenhet list: filters, sorting, pagination                                                                     |
| `/skolor/[kod]`    | One unit — nyckeltal, gymnasieprogram, skolenkät, Skolinspektionen documents, each compared against kommun and riket |
| `/huvudman`        | Huvudmän, aggregated from the unit list                                                                              |
| `/huvudman/[slug]` | One huvudman and its units                                                                                           |
| `/koncern/[slug]`  | One corporate group and its huvudmän                                                                                 |

All three detail routes are statically generated via `generateStaticParams`.
`dynamicParams` stays at its default, so a unit added after the build still
resolves — it is just rendered on first visit.

## How it fits together

**Data flows one way.** A server component fetches the register once, hands it
to a client view, and the view does all filtering and sorting in the browser:

```
src/app/skolor/page.tsx          server: listSkolor()
  └── SchoolsView                client: owns filter state
        ├── useQueryParams       reads/writes the URL (pushState + popstate)
        ├── parseSchoolQuery     URL → typed query
        ├── normalizeApiSchool   API shape → view model
        └── selectSchools        filter + count + sort, in one pass
```

**Filter state lives in the URL**, so every view is linkable and shareable.
Changing a filter never round-trips to the server — `useQueryParams` pushes
history and re-runs the selection locally.

**The same selection code runs on both sides.** `selectSchools` and
`selectHuvudman` are pure and free of I/O, so the server-rendered first paint
and every later filter change agree by construction.

## Where things live

| Path                                             |                                                                                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config/site.ts`                             | Brand, läsår, pagination, nav, footnotes                                                                                                                 |
| `src/config/skolformer.ts`                       | **The skolform registry.** Chips, columns, stat tiles, sort options and comparisons are generated from it — adding a skolform means adding an entry here |
| `src/lib/skolregister/`                          | API client — `types` · `client` · `resources` · `statistics` · `skolform`. Import from the barrel, `@/lib/skolregister`                                  |
| `src/lib/api-normalize.ts`                       | API shapes → the app's own view models                                                                                                                   |
| `src/lib/query.ts`                               | URL ⇄ typed query, plus the href/patch helpers                                                                                                           |
| `src/lib/school-select.ts`, `huvudman-select.ts` | Filtering, counting, aggregation — pure                                                                                                                  |
| `src/lib/school-fields.ts`                       | Skolform-qualified accessors and sorting                                                                                                                 |
| `src/lib/format.ts`                              | Swedish number/date/slug formatting                                                                                                                      |
| `src/hooks/use-query-params.ts`                  | The URL-state hook (the only one)                                                                                                                        |
| `src/components/tables/`                         | Column definitions, one file per table                                                                                                                   |
| `src/components/filters/`                        | Filter sidebar and controls                                                                                                                              |
| `src/data/kommuner.ts`                           | All 290 kommunkoder → names                                                                                                                              |

`src/lib/` is server-safe by rule — `skolregister/client.ts` reads the
filesystem. Anything `"use client"` belongs in `src/hooks/`.

## Domain notes

Things that look like bugs but are not:

- **Missing figures are explicit.** The register distinguishes _not collected_
  from _withheld because too few pupils_; a `NyckeltalVärde` is either
  `{status: "finns"}` or `{status: "saknas", förklaring}`. Never infer a
  missing value — and never render one as `0`.
- **Numbers are rendered as the register spells them.** "cirka 360" is a
  rounded figure and stays that string. `format.metric` deliberately does not
  reformat the parsed number.
- **Every figure is qualified by skolform.** "Elever" at a unit running both
  grundskola and gymnasium is two different numbers; comparing across forms is
  meaningless. That is why all reads go through `school-fields.ts`.
- **Fritidshem is excluded from elevantal** — those pupils are already counted
  in grundskolan.
- **A blank sorts last, never first**, in both directions. It means "not
  reported", not a low score.
- **Gymnasieskola has no national average endpoint**, only per-programme ones.
  `getBeräknatRiksGenomsnitt` computes a fallback from every unit's own
  reported values.

## Known quirks

Open items, each pinned by a test or a TODO so they stay visible:

- **The årskurs filter currently matches nothing.** The API supplies no grade
  spans, so `normalizeApiSchool` sets them empty and `selectSchools` filters
  every unit out. Pinned in `src/lib/school-select.test.ts`.
- **`spansOverlap("")` parses as förskoleklass**, because `Number("")` is `0`
  and "F" is level 0. Unreachable today — the one caller guards on the empty
  string. Pinned in `src/lib/skolverket/parse.test.ts`.
- **Huvudmän are joined to units by name alone.** The API offers no other
  shared key, so two organisations sharing a name collapse into one row and
  the second organisationsnummer is lost. Deliberate, and consistent between
  the list and the detail page. Pinned in `src/lib/api-normalize.test.ts`.
- **`AppShell` never renders the `crumbs` prop** although all five call sites
  build breadcrumbs for it. See the TODO in `src/components/layout/AppShell.tsx`.
- **TODO — `src/config/site.ts` contradicts itself on scope.** `scope.kommun`
  says `"Stockholm"` while `riket` says `"Hela riket"` and the list genuinely
  covers the whole country. In practice `scope.kommun` survives in exactly one
  place — a fallback label at `src/app/skolor/[kod]/page.tsx:81` for a unit
  with no kommun — and `scope.kommunkod` is not read anywhere at all, despite
  its comment claiming it is "the filter sent to the API". Leftover from when
  the build was scoped to one kommun; decide whether to delete it or honour it.

## Testing

`bun test`. Tests live next to the code as `*.test.ts` and cover the pure
logic — URL parsing, filtering, sorting, aggregation, formatting. Fixtures are
plain literals; there is no network or filesystem access, and the transport
layer (`skolregister/client.ts`, `resources.ts`) is intentionally not covered.

`slugify` is tested hardest: the detail routes build `generateStaticParams`
from it, so a change there silently 404s pages instead of failing loudly.
