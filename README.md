# Skolregistret

A browser for the Swedish school register: **skolenheter** (school units) and
**huvudmän** (the organisations that run them), across the whole country, with
filtering, sorting and detail views that compare each unit against its kommun
and against riket.

Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript · Bun.

---

## Getting started

```bash
bun install
bun dev
```

You also need `data/allt.json` — the app's data source, 200+MB, produced by a
separate collector tool outside this repo and never committed here. Without
it, `bun dev`/`bun run build` fail with a clear error naming the missing
file. Copy `.env.example` to `.env.local` only if you want to read it from
somewhere other than `data/allt.json`.

## Commands

| Command                           |                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| `bun dev`                         | Development server                                                                           |
| `bun run build`                   | Production build. Prerenders **every** skolenhet, huvudman and koncern, so it takes a while. |
| `bun start`                       | Serve the build                                                                              |
| `bun run check`                   | **typecheck + lint + test** — run this before committing                                     |
| `bun run typecheck`               | `tsc --noEmit`                                                                               |
| `bun run lint` / `lint:fix`       | ESLint (flat config; Next 16 removed `next lint`)                                            |
| `bun run format` / `format:check` | Prettier                                                                                     |
| `bun test` / `test:watch`         | 254 tests over the pure logic                                                                |

## The data

| Path             |                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `data/allt.json` | The register the app renders — skolenheter, huvudmän, the koncern ownership tree, Bolagsverket data, SALSA. Gitignored, never committed. |

`allt.json` carries no bulk official riksgenomsnitt outside five
gymnasieprogram measures, so nearly every nyckeltal card on `/skolor/[kod]`
now reads "(beräknat)" — self-computed from every unit's own reported
figures, not Skolverket's own average. That's expected with this source, not
a bug.

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

| Path                                             |                                                                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config/site.ts`                             | Brand, läsår, pagination, nav, footnotes                                                                                                                       |
| `src/config/skolformer.ts`                       | **The skolform registry.** Chips, columns, stat tiles, sort options and comparisons are generated from it — adding a skolform means adding an entry here       |
| `src/lib/skolregister/`                          | Data layer — `types` · `normalize` · `client` · `resources` · `huvudman` · `koncern` · `statistics` · `skolform`. Import from the barrel, `@/lib/skolregister` |
| `src/lib/api-normalize.ts`                       | API shapes → the app's own view models                                                                                                                         |
| `src/lib/query.ts`                               | URL ⇄ typed query, plus the href/patch helpers                                                                                                                 |
| `src/lib/school-select.ts`, `huvudman-select.ts` | Filtering, counting, aggregation — pure                                                                                                                        |
| `src/lib/school-fields.ts`                       | Skolform-qualified accessors and sorting                                                                                                                       |
| `src/lib/format.ts`                              | Swedish number/date/slug formatting                                                                                                                            |
| `src/hooks/use-query-params.ts`                  | The URL-state hook (the only one)                                                                                                                              |
| `src/components/tables/`                         | Column definitions, one file per table                                                                                                                         |
| `src/components/filters/`                        | Filter sidebar and controls                                                                                                                                    |
| `src/data/kommuner.ts`                           | All 290 kommunkoder → names                                                                                                                                    |

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
- **Årskurser are strings, and `"0"` is förskoleklass** — not a year zero.
  Render it as "F"; `formatYears` does. The register reports years only for
  förskoleklass, grundskola and anpassad grundskola, so **empty means "not
  reported", never "no årskurser"** — show a dash rather than "0 årskurser".
- **A unit's years may have gaps.** `formatYears` writes them as separate runs
  (`"F, 4–6"`) rather than flattening to a misleading `"F–6"`.
- **Årskurs chips exist only per skolform**, and only where the register
  reports years for that form. Gymnasieskola, specialskola and sameskola
  declare none, and with "alla skolformer" selected there are none either —
  `gradeFilterFor` returns an empty list without a skolform, so a hand-written
  `?arskurs=` is dropped rather than filtering invisibly. Förskoleklass years
  are keyed under `fsk` → `FKLASS`, never under `GR`, so filtering on them is
  the Förskoleklass skolform's job and grundskolan has no "F" chip.

## Known quirks

There are no open TODOs in the code. `allt.json` reports a real
organisationsnummer on every unit, so huvudmän are joined to their units by
that — the old register's export had no such key and forced a name-based
join instead; `slugify(namn)` is still what the URL uses to identify a
huvudman, so two organisations that happen to share a name still collapse
onto one route (`dedupeHuvudmanRows` in `src/lib/api-normalize.ts`), pinned
by a test.

- **A skolform is recovered from its årskurser.** `skolformer` and
  `årskurserPerSkolform` are maintained separately in hand-entered public data
  and do disagree. When a unit reports years for a form its `skolformer` omits,
  the years win and the form is added — the alternative leaves the unit
  unfindable under a form it demonstrably teaches. An empty year list is "not
  reported" and recovers nothing.

## Testing

`bun test`. Tests live next to the code as `*.test.ts` and cover the pure
logic — URL parsing, filtering, sorting, aggregation, formatting. Fixtures are
plain literals; there is no network or filesystem access, and the transport
layer (`skolregister/client.ts`, `resources.ts`) is intentionally not covered.

`slugify` is tested hardest: the detail routes build `generateStaticParams`
from it, so a change there silently 404s pages instead of failing loudly.
