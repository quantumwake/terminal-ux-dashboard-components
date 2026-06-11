# Activities / Backlog — terminal-ux-dashboard-components

Deferred improvements and follow-ups. Not blockers — captured so they aren't lost.

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
