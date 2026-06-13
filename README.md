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

## Build

```
npm install
npm run build   # tsup → dist (esm + cjs + d.ts)
npm run lint    # tsc --noEmit
```
