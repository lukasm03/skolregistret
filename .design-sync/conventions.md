## Skolregistret UI — conventions

This is a Tailwind v4 utility-class system extracted from a live Next.js
data app (skolregistret). There is **no root provider or theme wrapper** —
every component is a plain function that reads Tailwind classes; nothing
here consumes React context. Import and use components directly:

```tsx
import { AppShell, DataGrid, Stat, StatGrid } from "skolregistret-ui";

<AppShell section="/skolor" searchPlaceholder="Sök skolenhetsnamn" searchAction="/skolor">
  <StatGrid>
    <Stat label="Elever" value="412" unit="st" />
    <Stat label="Meritvärde" value="228,4" />
  </StatGrid>
</AppShell>;
```

### Styling idiom: Tailwind utilities over named CSS custom properties

No component ever hardcodes a color, radius, or shadow — every visual value
is a `--token` from `styles.css`, consumed through ordinary Tailwind
utilities (`bg-surface`, `text-ink-muted`, `border-line`), never inline
`style` for anything static. When composing new layout around these
components, match that idiom — reach for the same utility families rather
than introducing raw hex or one-off pixel values:

| Family        | Examples                                                                                                                 | Use for                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Surface       | `bg-surface`, `bg-surface-subtle`, `bg-surface-head`, `bg-surface-panel`, `bg-surface-segment`                           | panel/card backgrounds, layered by elevation                                                                                             |
| Ink           | `text-ink`, `text-ink-muted`, `text-ink-subtle`, `text-ink-faint`, `text-ink-ghost`, `text-ink-inverse`                  | body text down to disabled/decorative, darkest → lightest                                                                                |
| Line          | `border-line`, `border-line-soft`, `border-line-softer`, `border-line-row`, `border-line-control`, `border-line-overlay` | dividers and borders, by how strong the separation should read                                                                           |
| Accent        | `bg-accent`, `text-accent`, `border-accent-line`, `bg-accent-bg`, `text-accent-ink`, `text-accent-soft`                  | the one brand color — selection, links, primary emphasis                                                                                 |
| Semantic      | `over`/`under` (better/worse a metric compares), `ok`/`warn` (status), each with a `-bg`/`-line` pair                    | comparison and status coloring — never reach for accent here                                                                             |
| Type scale    | `text-micro`, `text-sm`, `text-base`, `text-lg`; `font-mono`                                                             | `font-mono` is for aligned figures (nyckeltal, IDs) — everything else inherits the page's default sans body font, so it needs no utility |
| Radius/shadow | `rounded-xs`/`sm`/`md`/`lg`; `shadow-raised`/`shadow-overlay`                                                            | never a bare `rounded` or `shadow`                                                                                                       |

Dark mode follows `prefers-color-scheme` automatically — every token above
has a dark value baked into `styles.css`. Never branch on a manual dark
class; there isn't one.

### Where the truth lives

Read `styles.css` (and its `@import`ed `_ds_bundle.css`) before introducing
any new color or spacing value — it is the complete, current token set, and
every class above resolves there. Per-component usage lives in each
`components/<group>/<Name>/<Name>.prompt.md`.

### Composition notes

- **No provider, no config.** Components are self-contained; the only setup
  is having `styles.css` on the page.
- **Data tables** (`DataTable`, `DataGrid`) take a `columns: Column<T>[]`
  array (`key`, `header`, `cell(row)`, plus optional `align`/`width`/`mono`)
  and a `rows: T[]` array — never pass pre-rendered `<tr>`s. `DataTable` is
  for static/server-rendered lists; `DataGrid` adds client-side sort and
  pagination via its `sort`/`onSortChange`/`pageIndex`/`onPageChange` props.
- **Controlled, not internal state** for every control that has a value
  (`CheckboxControl`, `RadioControl`, `Toggle`, `SelectField`, `RangeField`,
  `MultiSelectDropdown`) — they take `checked`/`value`/`selected` plus an
  `onToggle`/`onChange` callback and hold no state of their own. Only the
  two overlay controls (`MultiSelectDropdown`'s panel, `PerPageControl`'s
  popup) manage their own open/closed state internally.
- **`Sidebar` is responsive by itself** — a mobile disclosure below the
  `lg` breakpoint, an always-open rail at `lg` and above. Don't wrap it in
  your own responsive logic.
