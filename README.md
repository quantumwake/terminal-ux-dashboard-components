# @quantumwake/terminal-ux-dashboard-components

Dashboard, chart-builder and SQL-runner React components for the Alethic ISM apps.

These components are **capability-injected**: they never import a store or an API
client. The host wires concrete functions (query / save / load / search / …) via
`<DashboardProvider>`, and the components call them through `useDashboard()`.

A **full-capability host** (the studio) wires every verb and gets full CRUD. A
**read-only host** (a published viewer) provides only `theme` + `runQuery`
(e.g. DuckDB-WASM), so the logged-in-only verbs — **save, edit, load, search,
AI analyze/refine** — are simply not wired and their affordances disappear. One
component tree, any number of hosts, differences injected.

## Usage

```tsx
import { DashboardProvider } from '@quantumwake/terminal-ux-dashboard-components';

// Full-capability host (studio): wire everything.
<DashboardProvider
  theme={theme}
  runQuery={(sql, stateId) => store.runStateFsQuery(sql, undefined, stateId)}
  saveDashboard={store.saveDashboard}
  listDashboards={store.listSavedDashboards}
  loadDashboard={store.loadDashboard}
  deleteDashboard={store.deleteSavedDashboard}
  analyzeDataset={store.analyzeStateFsDataset}
  refineDashboard={store.refineDashboard}
  removePanel={store.removeDashboardPanel}
>
  {/* ChartBuilder, DashboardRenderer, SqlConsole, DataExplorer */}
</DashboardProvider>

// Read-only host (viewer): theme + runQuery only.
<DashboardProvider theme={theme} runQuery={(sql, stateId) => runQuery(shareId, stateId!, sql)}>
  {/* same components, no save/edit/load affordances */}
</DashboardProvider>
```

`runQuery(sql, stateId)` must return `{ columns, rows }`, executing `sql` against
a view named `data` over the state's dataset (a full host might run it against a
SQL service `/query`; a read-only host against DuckDB-WASM `read_parquet`).

## Status

- ✅ Capability contract (`DashboardProvider` / `useDashboard` / `useCapabilities`)
- ✅ Pure utilities: `sqlgen`, `chartStyle`
- ⏳ Components (landing in tranches): views/, `SqlConsole`,
  `ChartBuilder`, `DashboardRenderer`, `DataExplorer`

## Value formatting (`yFormat`, `formatBytes`)

`LineView`, `BarView` and `SparklineView` accept a `yFormat?: (value: number) =>
string` prop that formats every numeric value rendered for the user — y-axis
tick labels, hover/tooltip values, in-bar labels (`BarView`), and the
latest-value readout (`SparklineView`). It's unset by default, so nothing
changes for existing callers: ticks keep `Number(value).toLocaleString()` and
the tooltip/label keep Nivo's own default formatting.

`BarView`'s value axis follows `layout` — vertical puts it on the left,
horizontal on the bottom — `yFormat` applies to whichever axis that is.

```tsx
import { LineView, BarView, formatBytes } from '@quantumwake/terminal-ux-dashboard-components';

<LineView records={records} xColumn="t" yColumn="bytes_per_sec" yFormat={(v) => formatBytes(v, true)} />
<BarView records={records} groupColumn="host" valueColumn="bytes" yFormat={formatBytes} />
```

`formatBytes(value, perSecond?)` is the shared unit rule for byte-ish series:
B under 1024, then KB/MB/GB/TB with one decimal place (`"1.5 MB"`), capped at
TB. Pass `perSecond: true` to append `/s` for a throughput series
(`"2.0 GB/s"`).

## Build

```
npm install
npm run build   # tsup → dist (esm + cjs + d.ts)
npm run lint    # tsc --noEmit
npm run test    # vitest run
```
