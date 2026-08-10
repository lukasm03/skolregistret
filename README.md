# Skolregistret

Next.js (App Router) implementation of the Skoldata design: skolenheter and
huvudmän for one kommun, across **all skolformer** in Skolverkets
skolenhetsregister, with filters, sorting, pagination and two detail views.

```bash
bun install
bun run dev     # http://localhost:3000 → /skolor
bun run build
```

## Views

| Route              | What it shows                                                            |
| ------------------ | ------------------------------------------------------------------------ |
| `/skolor`          | Filterable list of skolenheter                                            |
| `/skolor/[kod]`    | One unit: nyckeltal vs kommunmedian, närmaste enheter, registeruppgifter  |
| `/huvudman`        | List of huvudmän, aggregated from the units                               |
| `/huvudman/[slug]` | One huvudman: koncernstruktur, årsredovisningar, enheter                  |

All list state lives in the URL (`?skolform=`, `?typ=`, `?arskurs=`, `?sort=`,
`?page=` …), so every view is server-rendered, shareable and back-button
friendly. There are no client components — the filters are links and the
range/search inputs are plain GET forms.

## Pointing at a real API

The app reads the register through the seam in `src/lib/data-source.ts`. With
no environment set it serves the seed data in `src/data/sample-units.ts`.

```bash
SCHOOL_API_URL=https://your-server.example/school-units
SCHOOL_API_KOMMUN_PARAM=municipalityCode   # optional; empty if already scoped
```

The endpoint must return school-unit records in Skolverkets shape — either a
bare array or wrapped in `items` / `results` / `data`. Both the seed and the
live path run through the same normalizer, so the seed exercises the parsing
rather than bypassing it.

### What the normalizer handles

`src/lib/skolverket/` is the only place that knows the API's field names.

- **Swedish decimal strings.** `"209,0"` → `209.0` for sorting and medians,
  while the API's own string is kept on `MetricValue.raw` and is what gets
  rendered — `"cirka 360"` stays "cirka 360" instead of becoming an exact 360.
- **Missing-value sentinels.** `"."` (MISSING) and `".."`
  (OMITTED_DUE_TO_BASED_ON_FEW_PUPILS) become `null` with the reason kept, never
  `0` — a withheld figure must not drag a kommunmedian down.
- **Unaligned time series.** Betygsbaserade mått lag a year behind
  personalstatistik, so each figure carries the läsår it actually refers to and
  the detail table shows it per row.
- **Skolform-scoped statistics.** `statistics.gr`, `statistics.fsk`,
  `statistics.gy` … are kept apart; nothing is compared across skolformer.
- **SHOUTED organizer names.** `"HELSINGBORGS KOMMUN"` → `"Helsingborgs kommun"`.

## Skolformer

`src/config/skolformer.ts` is the registry that makes the app work for more than
grundskolan. Each entry declares the form's statistics key, its årskurs chips
and its measures; from that the app generates the filter list, the table
columns, the stat tiles, the sort options, kommunmedianerna and the detail
comparison.

Because only one skolform's measures are comparable at a time, skolform is a
single-select filter. With **Alla skolformer** selected the list shows what each
unit runs and its total elevantal, and drops the metric columns rather than
showing empty ones.

> The gymnasium field names (`averageGradesPoints`,
> `ratioOfPupilsWithDegreeWithin3Years`,
> `ratioOfPupilsWithBasicEligibilityForUniversity`) are marked `unverified` in
> the registry — they are not in the sample payload. Confirm them against a live
> `gy` response. An unverified field that is wrong renders as "—"; it does not
> break the page.

## Where to change things

| I want to…                              | Edit                                            |
| --------------------------------------- | ----------------------------------------------- |
| Change kommun, läsår, labels             | `src/config/site.ts`                            |
| Add a skolform or a measure              | `src/config/skolformer.ts`                      |
| Point at a real API                      | `SCHOOL_API_URL`, `src/lib/data-source.ts`      |
| Change how the API payload is read       | `src/lib/skolverket/`                           |
| Change the seed data                     | `src/data/sample-units.ts`                      |
| Change Bolagsverket facts                | `src/data/bolagsdata.ts`                        |
| Restyle anything (colors, type scale)    | `@theme` block in `src/app/globals.css`         |
| Change filtering / aggregation rules     | `src/lib/loaders/`                              |
| Add a column to a skolenhet table        | `src/components/tables/schoolColumns.tsx`       |
| Change number/date formatting            | `src/lib/format.ts`                             |

### Layers

```
src/config/site.ts        scope, labels, page sizes
src/config/skolformer.ts  skolformer and their measures — drives the whole UI
src/data/*                seed data (raw register records) + Bolagsverket facts
src/lib/skolverket/*      raw types, value parsing, normalizer
src/lib/data-source.ts    the one seam to swap for a real backend
src/lib/loaders/*         filtering, sorting, aggregation, derived stats
src/lib/query.ts          search-param parsing + href building
src/components/           layout shell, filter controls, DataTable, primitives
src/app/                  routes; they compose loaders + components only
```

`DataTable` takes declarative column definitions (`width`, `align`, `mono`,
`truncate`, `cell`) and an optional `rowHref` that turns each row into a
keyboard-accessible link, so tables stay one-liners at the call site.

## Data notes

Two things are derived rather than sourced, and are marked in code:

- `buildAnnualReports()` in `src/lib/loaders/huvudman.ts` synthesises the
  årsredovisning series from the last known margin — replace with real
  Bolagsverket data.
- Kommunmedianer, ranking and "närmaste enheter" are computed from the loaded
  units in `src/lib/loaders/schools.ts`, always within one skolform.

The school register call is scoped to one kommun, so it cannot answer
riket-wide questions. `Huvudman.riket` is only set for org numbers present in
`src/data/bolagsdata.ts`; without it the huvudman view says so instead of
presenting kommun figures as national ones.

Fritidshem is excluded from a unit's total elevantal — its elever are already
counted in grundskolan.
