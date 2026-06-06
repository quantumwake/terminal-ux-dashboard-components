# @quantumwake/terminal-ux-dashboard-components

Dashboard, chart-builder and SQL-runner React components for the Alethic ISM apps.

These components are **capability-injected**: they never import a store or an API
client. The host wires concrete functions (query / save / load / search / …) via
`<DashboardProvider>`, and the components call them through `useDashboard()`.

`alethic-ism-ui-enterprise` (the studio) is the **source of truth** for all
dashboard capability. The published viewer (`alethic-ism-publish-ui`) provides
only `theme` + `runQuery` (DuckDB-WASM), so the studio-only verbs — **save,
edit, load, search, AI analyze/refine** — are simply not wired and their
affordances disappear. One component tree, two hosts, differences injected.

## Usage

```tsx
import { DashboardProvider } from '@quantumwake/terminal-ux-dashboard-components';

// Studio (ui-enterprise): wire everything.
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

// Published viewer (publish-ui): read-only — theme + runQuery only.
<DashboardProvider theme={theme} runQuery={(sql, stateId) => runQuery(shareId, stateId!, sql)}>
  {/* same components, no save/edit/load affordances */}
</DashboardProvider>
```

`runQuery(sql, stateId)` must return `{ columns, rows }`, executing `sql` against
a view named `data` over the state's dataset (studio → statefs-node `/query`;
viewer → DuckDB-WASM `read_parquet`).

## Status

- ✅ Capability contract (`DashboardProvider` / `useDashboard` / `useCapabilities`)
- ✅ Pure utilities: `sqlgen`, `chartStyle`
- ⏳ Components (migrating from ui-enterprise, in tranches): views/, `SqlConsole`,
  `ChartBuilder`, `DashboardRenderer`, `DataExplorer`

## Build

```
npm install
npm run build   # tsup → dist (esm + cjs + d.ts)
npm run lint    # tsc --noEmit
```
# terminal-ux-dashboard-components
