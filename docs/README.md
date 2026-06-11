# @quantumwake/terminal-ux-dashboard-components — design & contract

> Repo-specific handoff. The full cross-repo story (why we publish snapshots, the data proxy, how
> the viewer renders this package) lives in
> **alethic-ism-publish-api/docs/publish-snapshots-and-dashboards.md** — read that for context.

## What this is
The dashboard UX (chart builder, dashboard renderer, SQL runner, chart views, sqlgen/chartStyle),
**extracted from ui-enterprise** so the studio and the published viewer render the *same* components.
ui-enterprise is the source of truth for capability; the viewer simply omits the logged-in verbs.

## The core idea: capability injection
Components **never** import a store or API client. The host wires everything via `<DashboardProvider>`
and components read it with `useDashboard()` / `useCapabilities()`.

```
runQuery(sql, stateId?) => Promise<{columns: string[]; rows: Record<string,unknown>[]}>   // REQUIRED
theme: Record<string,string>                                                                // REQUIRED (Tailwind class strings)
// OPTIONAL verbs — absent ⇒ that affordance is hidden:
newDashboard, addPanel, removePanel, saveDashboard, listDashboards, searchDashboards,
loadDashboard, deleteDashboard, analyzeDataset, refineDashboard
```
- **Studio (ui-enterprise):** injects all verbs (zustand store) ⇒ full CRUD.
- **Viewer (publish-ui):** injects only `theme` + a DuckDB-WASM `runQuery` ⇒ read-only automatically.

`runQuery` runs the chart's generated SQL against a view named `data` (the state's dataset). Studio →
statefs-node `/query`; viewer → DuckDB-WASM over the snapshot parquet. Same SQL, different executor.

## Non-obvious things that will bite you
- **`runQuery` via `useRef` in effects.** Hosts pass an inline `runQuery` (new identity each render).
  ChartBuilder/DashboardRenderer hold it in a ref so their query effects depend only on the SQL — do
  **not** add `runQuery` back to those dep arrays (infinite `setState` loop; shipped in `0.1.1`).
- **Consuming apps must Tailwind-scan the dist.** Add
  `./node_modules/@quantumwake/terminal-ux-dashboard-components/dist/**/*.{js,cjs}` to the app's
  `tailwind.config` `content`, or the `midnight-*` / `grid-cols-3` classes are never generated
  (unstyled / 1-column chart icons).
- **`react-pivottable` / nivo** are required peers; nivo pinned to `^0.99.0`. With a local `file:`
  link these mis-resolve (optional-peer stub, nivo version skew) — consume from the **npm registry**.
- **Add-to-Dashboard / Save flow:** `addPanel` creates the dashboard on first add (host action);
  DataExplorer switches to the Dashboard view after adding so it's visible. Without `newDashboard`/
  `addPanel` wired, the studio can't build a dashboard.

## Release
`make version` → bump patch → `gh release create v{X.Y.Z}` → CI (`publish.yml`) runs lint+build+
`npm publish`. Local `make version` also lints+builds as a guard. Current: **0.1.3**.

## Components
`DashboardProvider`/`useDashboard`/`useCapabilities`; `sqlgen`, `chartStyle`, `dataShape`; views
(`Bar/Pie/Line/Scatter/Heatmap/Metric/Insight/Pivot`); `ChartBuilder` (+ exported `GroupedBarChart`),
`DashboardRenderer`, `SqlConsole`, `ChartStyleControls`, `DataExplorer`.
