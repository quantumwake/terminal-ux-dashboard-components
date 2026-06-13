# @quantumwake/terminal-ux-dashboard-components — design & contract

> Repo-specific handoff. This package is host-agnostic — the host app wires its own capabilities.
> How any particular host renders this package (e.g. a published-snapshot viewer over DuckDB-WASM)
> is documented in that host's own repo.

## What this is
The dashboard UX (chart builder, dashboard renderer, SQL runner, chart views, sqlgen/chartStyle),
packaged so any number of hosts render the *same* components. A full-capability host is the source
of truth for capability; a read-only host simply omits the logged-in verbs.

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
- **Full-capability host (studio):** injects all verbs (e.g. from a store) ⇒ full CRUD.
- **Read-only host (viewer):** injects only `theme` + a `runQuery` (e.g. DuckDB-WASM) ⇒ read-only automatically.

`runQuery` runs the chart's generated SQL against a view named `data` (the state's dataset). A full
host might execute it against a SQL service `/query`; a read-only host against DuckDB-WASM over a
snapshot parquet. Same SQL, different executor.

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
  This is why hosts should depend on the published package, not a local link.
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
