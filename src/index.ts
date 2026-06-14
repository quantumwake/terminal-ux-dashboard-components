// @quantumwake/terminal-ux-dashboard-components
//
// Capability-injected dashboard / chart-builder / SQL-runner components shared by
// any host: a full-capability host (the studio, source of truth) and a read-only
// host (a published viewer). The host wires the query/save/load/search fns via
// <DashboardProvider>; a read-only host omits the logged-in-only verbs and renders
// read-only.

// Capability contract
export {
    DashboardProvider,
    useDashboard,
    useCapabilities,
} from './context/DashboardContext';
export type {
    DashboardTheme,
    DashboardCapabilities,
    DashboardContextValue,
    DashboardProviderProps,
    QueryResult,
    SavedDashboard,
    PanelInput,
    PanelLayout,
    PanelRef,
} from './context/DashboardContext';

// SQL generation + result shaping (pure)
export {
    qIdent,
    qLit,
    aggExpr,
    compileWhere,
    buildChartSQL,
    shapeChartData,
} from './sqlgen';
export type {
    ChartType,
    ChartField,
    ChartFilter,
    ChartConfig,
    Row,
} from './sqlgen';

// Chart appearance model (pure)
export {
    DEFAULT_CHART_STYLE,
    LEGEND_ANCHORS,
    withStyleDefaults,
    buildNivoTheme,
    legendConfig,
    axisLegend,
} from './chartStyle';
export type {
    ChartStyle,
    LegendAnchor,
    LegendPosition,
    TitleAlign,
} from './chartStyle';

// Client-side grouping/aggregation helpers (pure)
export { groupBy, aggregate } from './dataShape';
export type { AggFn } from './dataShape';

// Heatmap-plus color engine (pure)
export { normalizeCells, heatColor, heatLabelColor, HEAT_STATS } from './heatmapColor';
export type { HeatStat, ColorScope, ColorMethod, HeatCell, ColorOptions } from './heatmapColor';

// Chart views (Nivo + pivot)
export * from './components/views';

// Higher-level components
export { ChartStyleControls } from './components/ChartStyleControls';
export type { ChartStyleControlsProps } from './components/ChartStyleControls';

export { SqlConsole } from './components/SqlConsole';
export type { SqlConsoleProps, SqlConsoleColumn } from './components/SqlConsole';

export { DashboardRenderer, PanelChart } from './components/DashboardRenderer';
export type { DashboardRendererProps, Dashboard, DashboardPanel, PanelChartProps } from './components/DashboardRenderer';

export { ChartBuilder } from './components/ChartBuilder';
export type { ChartBuilderProps, ChartBuilderColumn, ChartPanel } from './components/ChartBuilder';

export { DataExplorer } from './components/DataExplorer';
export type { DataExplorerProps } from './components/DataExplorer';
