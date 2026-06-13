ct# Activities / Backlog — terminal-ux-dashboard-components

Deferred improvements and follow-ups. Not blockers — captured so they aren't lost.

## DONE — Heatmap+ (`heatmap-plus`) advanced heatmap (2026-06-13)

New chart type alongside `heatmap` (existing heatmap untouched → zero regression
to baked data). Files: `heatmapColor.ts` (pure color engine), `views/HeatmapPlusView.tsx`,
`sqlgen.ts` (`heatmap-plus` GROUPING-SETS query + shaper, `median` in `aggExpr`),
`dataShape.ts` (`median`), `DashboardRenderer.tsx` + `ChartBuilder.tsx` wiring.

- **Dual stats per cell:** independent `labelStat` (cell label) + `colorStat`
  (drives color); each is min|max|avg|sum|median|count.
- **Margins** (row / col / grand) computed over the UNDERLYING rows — SQL via
  `GROUP BY GROUPING SETS` (one pass), direct path via group+aggregate — so
  median/avg margins are correct, not a stat of aggregated cells. Rendered as
  own-scope colored Σ row/column. Rows/cols sortable by margin.
- **Color engine** = cmap(method(colorValue, scope)): scope global|row|column|block,
  method linear|rank (Hazen percentile), fixed vmin/vmax, RdYlGn default,
  auto-contrast labels. nivo gets a precomputed-`t` colors FUNCTION (its built-in
  scales are global-only). `d3-scale-chromatic` added (inlined by tsup).
- Block scope reuses the builder's color-field zone.

**Open:** browser verification (builds + typecheck pass; not yet eyeballed).
Not released to npm yet.

## Precomputed chart results: back large results with a result parquet (not inline JSON)

**Area:** `ChartBuilder` (bake), `DashboardRenderer`/`SqlPanel` (render), and the
`PanelConfig.data` field.

**Current model (shipped, v0.1.9):** a SQL-backed panel stores its computed
result **inline** on `panel.config.data` (rows), baked by `ChartBuilder` at save
and refreshable in the studio via `persistPanelData`. Both hosts render from it
(no live query): the studio computes on build/refresh against statefs-node
`/query`; the published viewer renders the stored rows. A **row cap**
(`MAX_PRECOMPUTE_ROWS = 5000`) keeps the inlined JSON small — above it the panel
stays live/Refresh-only.

**Why it matters:** inlining rows bloats the dashboard metadata / published
`manifest.json`. Aggregations are tiny, but some charts (e.g. a scatter over many
rows) hold a lot of data. The 5000-row cap covers most cases; it is not a real
solution for large results, and inline JSON is not database-backed.

**Proposed improvement:** for results above the inline threshold, write the chart
output to a small **result PARQUET** next to the snapshot (e.g.
`snapshot/<share>/dashboards/<panelId>.parquet`) and reference it from the panel
(e.g. `config.dataKey`) instead of `config.data`. The renderer loads that small
parquet on demand via DuckDB-WASM (or a fetch) and feeds it down the same
preset-`data` render path. Keeps the manifest small and the result backed by a
real columnar file rather than a JSON metadata blob.

**Status:** deferred (future improvement). The inline model + 5000-row cap is the
shipped behavior; this is the scale-up path for large precomputed results.

## Adopt `@quantumwake/terminal-ux-components` for all form controls

**Area:** every raw form control in the package — `ChartStyleControls`
(slider/switch/color/select), `ChartBuilder` (`SelectControl`, `DropZone`
pickers, `FiltersSection`, title input), `SqlConsole` chips, `DataExplorer` tabs.

**Current state:** the package hand-rolls its controls with raw
`<select>/<input>/<button>` styled with Tailwind to approximate the terminal
look. A historical comment ("the package can't import the host's TerminalDropdown")
predates the existence of the published **`@quantumwake/terminal-ux-components`**
design system — which the hosts already depend on. So the coupling concern is
moot: the package can depend on the design system directly.

**Why it matters:** the hand-rolled controls drift from the rest of the ISM UI —
spacing, toggles, and inputs look "jammed in" and off-brand (user feedback,
2026-06-11). Consuming the shared primitives keeps the chart authoring UI visually
identical to the Studio.

**Proposed:** add `@quantumwake/terminal-ux-components` as a (peer?) dependency and
replace the local `ColorControl/SliderControl/Switch/TextControl/Choice` +
`SelectControl` with its primitives. Audit which primitives exist there first
(dropdown, toggle, slider, color, text). Keep the package host-agnostic by relying
only on the published design-system package, not on host-local components.

**Status:** deferred — flagged by the user as the right direction but a big lift
("revisit later"). Interim: `ChartStyleControls` was rebuilt with consistent
rows + real sliders/switches (v0.1.14) so it's presentable until the migration.
DONE in v0.1.16: `ChartStyleControls` now consumes the design system
(TerminalToggle/Slider/Select/Input from `@quantumwake/terminal-ux-components`).

## Full, per-chart-type chart options (expose what Nivo supports)

**Area:** `ChartStyle` (today a curated, chart-agnostic subset) + `ChartStyleControls`.

**Idea (user, 2026-06-11):** "expose whatever the charts support… fully fledged
chart options." Instead of a fixed `ChartStyle`, drive the appearance panel from a
**per-chart-type option schema** describing the Nivo props each chart actually
supports: colors / color scheme, margins, padding, inner radius (pie),
curve + enableArea + point size (line), node size (scatter), grid x/y, axis
formats, legends (position/size/spacing), borders, animation, etc.

**Shape:** a declarative schema per chart type — `{ key, label, control:
'slider'|'toggle'|'select'|'color', min/max/options, default }` — rendered
generically into the same Terminal* controls, and merged into the Nivo props at
render time. Common options (axis titles/ticks/legend/title — the current
`ChartStyle`) stay shared; type-specific options come from the schema.

**Why a separate phase:** Nivo's options differ per chart, so this is a real
design + mapping effort (schema authoring + a generic schema→controls renderer +
a per-type props merger). Worth doing, but scoped on its own.

**Status:** planned next phase (after the v0.1.16 appearance/axis/table/fill work
lands and is tested). Current `ChartStyle` is the shared common-options layer it
will build on.

## More chart types (boxplot, 3D surface/heatmap, …)

**Idea (user, 2026-06-11):** add chart types beyond the current bar / grouped-bar
/ pie / line / scatter / heatmap / metric / table — specifically **boxplots** and
**3D surfaces / heatmaps**.

**Two tiers, by renderer:**
1. **Nivo-native (fits today's stack):** `@nivo/boxplot` (distributions/quartiles),
   and others like `@nivo/radar`, `@nivo/funnel`, `@nivo/sankey`, `@nivo/bump`,
   `@nivo/calendar`, `@nivo/treemap`. Each needs: a `ChartType` entry, a
   `buildChartSQL` shape (e.g. boxplot wants raw per-group values, not an
   aggregate), a `shapeChartData` case, a `*View`, and ChartBuilder wiring. Boxplot
   SQL ≈ `SELECT group AS g, TRY_CAST(value AS DOUBLE) AS v FROM data` (Nivo computes
   the quartiles client-side).
2. **3D (NOT Nivo — different renderer):** Nivo is 2D SVG/Canvas only. 3D surfaces /
   3D heatmaps need a separate engine — **plotly.js** (`surface`, `mesh3d`,
   built-in WebGL), echarts-gl, or three.js. This means a second chart-render path
   alongside Nivo (heavier bundle; WebGL). Scope as its own sub-phase; plotly.js is
   the least-effort path (declarative, has surface/3d-heatmap out of the box).

**Dependency note:** new Nivo packages are peerDependencies (like the existing
`@nivo/*`); the hosts must install them. A 3D lib (plotly) is a larger add — gate
it so non-3D charts don't pull the WebGL bundle.

**Status:** planned — pairs with the per-chart-type options schema above (each new
type registers its own option schema). Nivo-native types first (cheap, same stack);
3D as a separate, opt-in renderer sub-phase.

## Searchable column picker when adding to an axis

**Idea (user, 2026-06-11):** in `ChartBuilder`'s DropZone "Add" picker (X/Y/value/
group field selectors), make the column list **searchable** — type to filter. For
wide datasets the flat list is unwieldy. Likely a `TerminalAutocomplete` (design
system) or a small filter input atop the existing dropdown.

**Status:** future enhancement.
