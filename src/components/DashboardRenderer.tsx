// DashboardRenderer — host-agnostic renderer for a grid of AI-generated or
// manually configured dashboard panels. Uses a 12-column CSS grid.
//
// Capabilities (theme, runQuery, removePanel) are injected by the host via
// DashboardContext — this component never imports a store or API client.
//   - studio (ui-enterprise): wires removePanel ⇒ panels show a remove button.
//   - published viewer (publish-ui): omits removePanel ⇒ read-only dashboard.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X, Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout';

import { useDashboard, useCapabilities, type PanelLayout } from '../context/DashboardContext';
import { shapeChartData, buildChartSQL, aggExpr, qIdent } from '../sqlgen';
import type { Row, ChartType, ChartField, ChartConfig, ChartFilter } from '../sqlgen';
import { withStyleDefaults } from '../chartStyle';
import type { ChartStyle } from '../chartStyle';
import {
    BarView,
    PieView,
    LineView,
    ScatterView,
    HeatmapView,
    HeatmapPlusView,
    PivotView,
    MetricView,
    InsightView,
} from './views';
import { GroupedBarChart } from './ChartBuilder';

// ─── Panel / dashboard shapes ──────────────────────────────────────────────

// PanelConfig is the per-panel config blob. The host (studio AI or chart
// builder) owns the full schema; the renderer reads the fields it dispatches on.
export interface PanelConfig {
    sql?: string;
    chartType?: ChartType | 'metric';
    style?: Partial<ChartStyle>;

    // client-side aggregation columns
    group?: string;
    value?: string;
    agg?: string;
    x?: string;
    y?: string;
    row?: string;
    col?: string;

    // grouped-bar / heatmap extras
    yFields?: ChartField[];
    rowOrder?: string;
    colOrder?: string;
    marginAgg?: string;
    showTotals?: boolean;

    // heatmap-plus extras: dual cell stats, block field, color engine, margins.
    labelStat?: string;
    colorStat?: string;
    blockField?: string;
    scope?: string;
    method?: string;
    vmin?: number;
    vmax?: number;
    showMargins?: boolean;

    // table / insight
    columns?: string[];
    text?: string;

    // metric
    label?: string;
    column?: string;

    // layout: when true the panel takes the full dashboard width + a tall height.
    fill?: boolean;

    // PRECOMPUTED result of config.sql, baked at build/refresh time. When present
    // the panel renders from it directly — no live query. refreshedAt is when it
    // was last computed (studio Refresh). Published dashboards rely on this.
    data?: Row[];
    refreshedAt?: string;

    [key: string]: unknown;
}

export interface DashboardPanel {
    id: string;
    type: string;
    title?: string;
    // Grid geometry (12-col units). width/height = span; x/y = top-left cell.
    // x/y are optional — absent ⇒ the renderer auto-packs in panel order.
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    config?: PanelConfig;
}

export interface Dashboard {
    insights?: string;
    panels?: DashboardPanel[];
}

export interface ColumnDef {
    name: string;
}

export interface DashboardRendererProps {
    dashboard?: Dashboard | null;
    records?: Row[];
    columns?: ColumnDef[];
}

// ─── Loading fallback ──────────────────────────────────────────────────────

function ViewLoading() {
    return (
        <div className="flex items-center justify-center h-full text-xs text-midnight-text-muted">Loading...</div>
    );
}

// ─── SqlPanel ──────────────────────────────────────────────────────────────

interface SqlPanelProps {
    panel: DashboardPanel;
}

// Chart types whose data buildChartSQL can compile from a panel's flat config —
// so an AI-generated / Direct-mode panel (no config.sql) is still computed,
// baked (precomputed), and refreshable, exactly like a manual SQL chart.
const SQL_CHART_TYPES = new Set<string>(['bar', 'grouped-bar', 'pie', 'line', 'scatter', 'heatmap', 'heatmap-plus']);

// Panel types that are SQL-backed but NOT compiled via buildChartSQL: table
// (row preview) and metric (single aggregate). Routing them through SqlPanel
// gives them the same Refresh + precompute (bake) path as the charts — so AI/
// Direct table & metric panels also show data on publish.
const SQL_DATA_TYPES = new Set<string>(['table', 'metric']);

// Rows fetched/baked for a table panel preview (kept small — it's a glance, and
// it inlines into the dashboard/published manifest like any precomputed result).
const TABLE_PREVIEW_ROWS = 200;

// SQL for a table panel: the chosen columns (or all) capped to a preview size.
function tableSql(config: PanelConfig): string {
    const cols = config.columns?.length ? config.columns.map(qIdent).join(', ') : '*';
    return `SELECT ${cols} FROM data LIMIT ${TABLE_PREVIEW_ROWS}`;
}

// SQL for a metric panel: a single aggregate over the full dataset.
function metricSql(config: PanelConfig): string {
    return `SELECT ${aggExpr(config.agg, config.column)} AS v FROM data`;
}

// Map a panel's flat config (group/value/agg/x/y/row/col — the AI/Direct shape)
// to the ChartConfig buildChartSQL expects.
function panelToChartConfig(chartType: ChartType, config: PanelConfig): ChartConfig {
    const cfg: ChartConfig = { chartType, xFields: [], yFields: [], filters: (config.filters as ChartFilter[]) || [] };
    switch (chartType) {
        case 'bar':
        case 'grouped-bar':
            if (config.group) cfg.xFields = [{ name: config.group }];
            cfg.yFields = config.yFields?.length
                ? config.yFields
                : config.value ? [{ name: config.value, agg: config.agg }] : [];
            break;
        case 'pie':
            if (config.group) cfg.xFields = [{ name: config.group }];
            break;
        case 'line':
        case 'scatter':
            if (config.x) cfg.xFields = [{ name: config.x }];
            if (config.y) cfg.yFields = [{ name: config.y }];
            break;
        case 'heatmap':
            if (config.row) cfg.xFields = [{ name: config.row }];
            if (config.col) cfg.yFields = [{ name: config.col }];
            if (config.value) cfg.valueField = { name: config.value, agg: config.agg };
            break;
        case 'heatmap-plus':
            if (config.row) cfg.xFields = [{ name: config.row }];
            if (config.col) cfg.yFields = [{ name: config.col }];
            if (config.value) cfg.valueField = { name: config.value, agg: config.labelStat };
            cfg.labelStat = config.labelStat;
            cfg.colorStat = config.colorStat;
            cfg.blockField = config.blockField;
            break;
    }
    return cfg;
}

// The SQL a panel runs: its explicit config.sql, else compiled from its config
// (charts), or built for table / metric panels.
function panelSql(type: string, config: PanelConfig): string {
    if (config.sql) return config.sql;
    if (type === 'table') return tableSql(config);
    if (type === 'metric') return metricSql(config);
    if (SQL_CHART_TYPES.has(type)) return buildChartSQL(panelToChartConfig(type as ChartType, config)) || '';
    return '';
}

// Format one table cell: numbers get decimal precision (floats → N dp, integers
// left whole), non-numeric strings pass through, then optional char truncation.
function formatCell(value: unknown, s: ChartStyle): string {
    if (value == null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    let str: string;
    const n = typeof value === 'number' ? value : Number(value);
    if (value !== '' && typeof value !== 'boolean' && Number.isFinite(n)) {
        str = Number.isInteger(n)
            ? n.toLocaleString()
            : n.toLocaleString(undefined, { minimumFractionDigits: s.cellPrecision, maximumFractionDigits: s.cellPrecision });
    } else {
        str = String(value);
    }
    if (s.cellTruncate > 0 && str.length > s.cellTruncate) str = `${str.slice(0, s.cellTruncate)}…`;
    return str;
}

// A compact scrollable table for table panels (and the records fallback). Cells
// wrap (default) and numbers are precision-formatted per the panel's style.
function DataTable({ rows, columns, style }: { rows: Row[]; columns?: string[]; style?: Partial<ChartStyle> }) {
    const s = withStyleDefaults(style);
    const colNames = columns?.length ? columns : rows[0] ? Object.keys(rows[0]) : [];
    const cellCls = s.cellWrap
        ? 'px-2 py-1 text-midnight-text-body align-top whitespace-normal break-words max-w-[280px]'
        : 'px-2 py-1 text-midnight-text-body truncate max-w-[200px]';
    return (
        <div className="overflow-auto h-full text-xs">
            <table className="w-full">
                <thead className="sticky top-0 bg-midnight-elevated">
                    <tr>{colNames.map((n) => <th key={n} className="px-2 py-1 text-left text-midnight-text-muted font-mono border-b border-midnight-border">{n}</th>)}</tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i} className="border-b border-dashed border-midnight-border hover:bg-midnight-raised">
                            {colNames.map((n) => (
                                <td key={n} className={cellCls}>{formatCell(r[n], s)}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/**
 * SqlPanel renders a SQL-backed panel (config.sql or a compiled chart config).
 * PRECOMPUTE model:
 *   - config.data present  → render it directly (NO live query). This is how
 *     published dashboards render — instant, no dataset download.
 *   - config.data absent + studio (canRefresh) → live-query once to compute it.
 *   - config.data absent + read-only viewer → "Chart data not available" (the
 *     viewer never live-queries a dashboard panel — that's a dataset download).
 * The studio shows a Refresh button that re-runs the query and hands the rows to
 * persistPanelData so the host stores them on the panel and saves.
 */
function SqlPanel({ panel }: SqlPanelProps) {
    const { runQuery, persistPanelData } = useDashboard();
    const { canRefresh } = useCapabilities();
    // Ref so the query effect doesn't depend on runQuery's identity (hosts pass
    // an inline runQuery → depending on it would loop). See ChartBuilder.
    const runQueryRef = useRef(runQuery);
    runQueryRef.current = runQuery;
    const config: PanelConfig = panel.config || {};
    const chartType = (config.chartType || panel.type) as string;
    // Explicit SQL, else compiled from the panel's chart/table/metric config.
    const sql = panelSql(chartType, config);
    const precomputed = config.data;

    const [rows, setRows] = useState<Row[] | null>(precomputed ?? null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(!precomputed && canRefresh);
    const [refreshing, setRefreshing] = useState(false);

    // Compute live ONLY when there's no precomputed result and the host can persist
    // (studio first-build). The published viewer relies solely on config.data.
    useEffect(() => {
        if (precomputed) { setRows(precomputed); setLoading(false); return; }
        if (!canRefresh) { setLoading(false); return; }
        let cancelled = false;
        setLoading(true);
        setError(null);
        runQueryRef.current(sql).then(
            (res) => { if (!cancelled) { setLoading(false); setRows(res?.rows || []); } },
            (err: unknown) => { if (!cancelled) { setLoading(false); setRows(null); setError(err instanceof Error ? err.message : String(err) || 'Query failed'); } },
        );
        return () => { cancelled = true; };
        // precomputed identity is intentionally excluded — a stored result is stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sql, canRefresh]);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        try {
            const res = await runQueryRef.current(sql);
            const r = res?.rows || [];
            setRows(r);
            persistPanelData?.(panel.id, r, new Date().toISOString());
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err) || 'Query failed');
        } finally {
            setRefreshing(false);
        }
    }, [sql, panel.id, persistPanelData]);

    const refreshBtn = canRefresh ? (
        <button
            onClick={refresh}
            disabled={refreshing}
            title={config.refreshedAt ? `Last computed ${new Date(config.refreshedAt).toLocaleString()} — click to refresh` : 'Compute & save this chart’s data'}
            className="absolute top-1 right-1 z-10 p-1 bg-midnight-elevated/80 border border-midnight-border text-midnight-text-muted hover:text-midnight-accent transition-colors"
        >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
    ) : null;

    if (loading && !rows) {
        return <div className="flex items-center justify-center h-full text-xs text-midnight-text-muted">Running…</div>;
    }
    // No precomputed result and read-only viewer: don't live-query — surface it.
    if (!rows && !error && !canRefresh) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-1 px-2 text-center text-xs text-midnight-text-muted">
                <AlertCircle className="w-4 h-4" />
                <span>Chart data not available</span>
                <span className="text-[10px] text-midnight-text-subdued">Download the dataset to view this chart.</span>
            </div>
        );
    }
    if (error) {
        return (
            <div className="relative flex items-center justify-center h-full px-2 text-center text-xs text-red-400">
                {refreshBtn}
                {error}
            </div>
        );
    }
    if (!rows) return null;

    let chart: ReactNode;
    if (chartType === 'metric') {
        const first = rows[0];
        const v = first ? Object.values(first)[0] : 0;
        chart = <MetricView value={Number(v) || 0} config={{ column: config.column || '', agg: config.agg, label: config.label }} />;
    } else if (chartType === 'table') {
        chart = <DataTable rows={rows} columns={config.columns} style={config.style} />;
    } else {
        const shaped = shapeChartData(chartType as ChartType, rows, { yFields: config.yFields || [] });
        switch (chartType) {
            case 'bar':
                chart = <BarView data={shaped as never} groupColumn={config.group || ''} valueColumn={config.value || ''} style={config.style} />;
                break;
            case 'grouped-bar': {
                const gb = shaped as { data: unknown[]; keys: string[] };
                chart = <GroupedBarChart data={gb.data as never} keys={gb.keys} yFields={config.yFields || []} style={config.style} />;
                break;
            }
            case 'pie':
                chart = <PieView data={shaped as never} groupColumn={config.group || ''} style={config.style} />;
                break;
            case 'line':
                chart = <LineView data={shaped as never} xColumn={config.x || ''} yColumn={config.y || ''} style={config.style} />;
                break;
            case 'scatter':
                chart = <ScatterView data={shaped as never} xColumn={config.x || ''} yColumn={config.y || ''} style={config.style} />;
                break;
            case 'heatmap':
                chart = (shaped as unknown[]).length
                    ? <HeatmapView data={shaped as never} rowColumn={config.row || ''} colColumn={config.col || ''} rowOrder={config.rowOrder as never} colOrder={config.colOrder as never} marginAgg={config.marginAgg} showTotals={config.showTotals} style={config.style} />
                    : <div className="flex items-center justify-center h-full text-xs text-midnight-text-muted">No data</div>;
                break;
            case 'heatmap-plus':
                chart = (shaped as unknown[]).length
                    ? <HeatmapPlusView data={shaped as never} rowColumn={config.row || ''} colColumn={config.col || ''} scope={config.scope as never} method={config.method as never} vmin={config.vmin} vmax={config.vmax} rowOrder={config.rowOrder as never} colOrder={config.colOrder as never} showMargins={config.showMargins} style={config.style} />
                    : <div className="flex items-center justify-center h-full text-xs text-midnight-text-muted">No data</div>;
                break;
            default:
                chart = <div className="p-4 text-xs text-midnight-text-muted">Unsupported SQL chart: {chartType}</div>;
        }
    }

    return (
        <div className="relative h-full w-full">
            {refreshBtn}
            {chart}
        </div>
    );
}

// ─── PanelContent ──────────────────────────────────────────────────────────

interface PanelContentProps {
    panel: DashboardPanel;
    records?: Row[];
    columns?: ColumnDef[];
}

/**
 * Renders a single dashboard panel based on its type and config.
 * Panels saved with a SQL query render server-side (full dataset); the rest
 * fall back to client-side aggregation over the loaded records.
 */
function PanelContent({ panel, records, columns }: PanelContentProps) {
    const { type } = panel;
    const config: PanelConfig = panel.config || {};

    // SQL-backed panels — explicit config.sql, a compilable chart type, or a
    // table/metric panel — go through SqlPanel so they compute, bake (precompute),
    // and refresh server-side over the FULL dataset (and show data on publish).
    const effType = (config.chartType || type) as string;
    if (config.sql || SQL_CHART_TYPES.has(effType) || SQL_DATA_TYPES.has(effType)) {
        return <SqlPanel panel={panel} />;
    }

    if (!records?.length && type !== 'insight') {
        return <div className="flex items-center justify-center h-full text-xs text-midnight-text-muted">No data</div>;
    }

    switch (type) {
        case 'bar':
            return config.group ? <BarView records={records} groupColumn={config.group} valueColumn={config.value || ''} aggFn={config.agg || 'count'} style={config.style} /> : null;
        case 'pie':
            return config.group ? <PieView records={records} groupColumn={config.group} style={config.style} /> : null;
        case 'line':
            return config.x && config.y ? <LineView records={records} xColumn={config.x} yColumn={config.y} style={config.style} /> : null;
        case 'scatter':
            return config.x && config.y ? <ScatterView records={records} xColumn={config.x} yColumn={config.y} style={config.style} /> : null;
        case 'heatmap':
            return config.row && config.col ? <HeatmapView records={records} rowColumn={config.row} colColumn={config.col} valueColumn={config.value} aggFn={config.agg || 'count'} rowOrder={config.rowOrder as never} colOrder={config.colOrder as never} marginAgg={config.marginAgg} showTotals={config.showTotals} style={config.style} /> : null;
        case 'heatmap-plus':
            return config.row && config.col ? <HeatmapPlusView records={records} rowColumn={config.row} colColumn={config.col} valueColumn={config.value} labelStat={config.labelStat as never} colorStat={config.colorStat as never} blockField={config.blockField} scope={config.scope as never} method={config.method as never} vmin={config.vmin} vmax={config.vmax} rowOrder={config.rowOrder as never} colOrder={config.colOrder as never} showMargins={config.showMargins} style={config.style} /> : null;
        case 'pivot':
            return <PivotView records={records} />;
        case 'metric':
            return <MetricView records={records} config={{ column: config.column || '', agg: config.agg, label: config.label }} />;
        case 'insight':
            return <InsightView config={{ text: config.text }} />;
        case 'table':
            // Records fallback (SQL-backed tables route through SqlPanel above).
            return <DataTable rows={(records || []).slice(0, 50)} columns={config.columns || columns?.map((c) => c.name)} style={config.style} />;
        default:
            return <div className="p-4 text-xs text-midnight-text-muted">Unknown panel type: {type}</div>;
    }
}

// PanelChart renders a panel's chart/table/metric BODY only — no panel frame,
// no title bar. Host-agnostic: the published viewer's single-chart embed route
// renders exactly this (so an iframe shows the chart and nothing else), and the
// studio can use it anywhere a bare chart body is needed.
export const PanelChart = PanelContent;
export type PanelChartProps = PanelContentProps;

// ─── DashboardRenderer ─────────────────────────────────────────────────────

const GRID_COLS = 12;
const ROW_HEIGHT = 80;   // px per grid row unit
const GRID_MARGIN = 10;  // px gap between panels
// A panel header drag-handle class — only the header drags (so charts stay
// interactive). react-grid-layout matches it via draggableHandle.
const DRAG_HANDLE = 'panel-drag-handle';

// react-grid-layout needs its CSS for the resize handle + drag transitions.
// Rather than make every host import a stylesheet, inject the minimal rules once
// (scoped to .react-grid-* / .react-resizable-*). Styled to match the dark theme.
const RGL_CSS = `
.react-grid-layout { position: relative; transition: height 200ms ease; }
.react-grid-item { transition: all 200ms ease; transition-property: left, top, width, height; box-sizing: border-box; }
.react-grid-item.cssTransforms { transition-property: transform, width, height; }
.react-grid-item.resizing { transition: none; z-index: 3; will-change: width, height; }
.react-grid-item.react-draggable-dragging { transition: none; z-index: 3; will-change: transform; }
.react-grid-item.react-grid-placeholder { background: rgba(99,102,241,0.18); border: 1px dashed #6366f1; border-radius: 2px; transition-duration: 100ms; z-index: 2; user-select: none; }
.react-grid-item > .react-resizable-handle { position: absolute; width: 18px; height: 18px; bottom: 0; right: 0; cursor: se-resize; }
.react-grid-item > .react-resizable-handle::after { content: ''; position: absolute; right: 4px; bottom: 4px; width: 6px; height: 6px; border-right: 2px solid rgba(148,163,184,0.7); border-bottom: 2px solid rgba(148,163,184,0.7); }
.${DRAG_HANDLE} { cursor: grab; }
.react-grid-item.react-draggable-dragging .${DRAG_HANDLE} { cursor: grabbing; }
`;

let rglCssInjected = false;
function useInjectRglCss() {
    useEffect(() => {
        if (rglCssInjected || typeof document === 'undefined') return;
        const el = document.createElement('style');
        el.setAttribute('data-rgl', 'dashboard-renderer');
        el.textContent = RGL_CSS;
        document.head.appendChild(el);
        rglCssInjected = true;
    }, []);
}

// WidthProvider sizes the grid to its container; computed once (module scope) so
// the HOC identity is stable across renders.
const GridLayoutWithWidth = WidthProvider(GridLayout);

// Build the react-grid-layout `layout` from the panels. Honors saved x/y; for
// panels without a saved position, auto-packs them left→right, top→bottom in
// panel order (so legacy dashboards — which only stored width/height — still lay
// out sensibly until the user drags them).
function buildLayout(panels: DashboardPanel[]): Layout[] {
    let cx = 0, cy = 0, rowH = 0;
    return panels.map((p) => {
        // A "fill" panel takes the full width and a tall height.
        const fill = !!p.config?.fill;
        const w = fill ? GRID_COLS : Math.min(Math.max(p.width || 6, 1), GRID_COLS);
        const h = fill ? Math.max(p.height || 8, 6) : Math.max(p.height || 4, 1);
        if (typeof p.x === 'number' && typeof p.y === 'number') {
            return { i: p.id, x: fill ? 0 : p.x, y: p.y, w, h, minW: 2, minH: 2 };
        }
        // Auto-pack: wrap to the next row when this panel won't fit.
        if (cx + w > GRID_COLS) { cx = 0; cy += rowH; rowH = 0; }
        const item = { i: p.id, x: cx, y: cy, w, h, minW: 2, minH: 2 };
        cx += w;
        rowH = Math.max(rowH, h);
        return item;
    });
}

/**
 * DashboardRenderer — renders a grid of AI-generated or manually configured
 * panels via react-grid-layout. Editing is capability-gated:
 *   - studio (persistLayout wired) ⇒ panels drag (by their header) + resize, and
 *     the new geometry is persisted back to the host.
 *   - published viewer (no persistLayout) ⇒ a static grid, rendered exactly where
 *     the studio left the panels.
 * The per-panel remove button is similarly gated behind canEditPanels.
 */
export function DashboardRenderer({ dashboard, records, columns }: DashboardRendererProps) {
    const { theme, removePanel, persistLayout, panelHeaderExtra } = useDashboard();
    const { canEditPanels, canEditLayout } = useCapabilities();
    useInjectRglCss();

    const panels = dashboard?.panels ?? [];
    // Recompute only when the panel set / geometry changes (not on every render).
    const layout = useMemo(() => buildLayout(panels), [panels]);

    const onLayoutChange = useCallback((next: Layout[]) => {
        if (!persistLayout) return;
        persistLayout(next.map((l): PanelLayout => ({ id: l.i, x: l.x, y: l.y, w: l.w, h: l.h })));
    }, [persistLayout]);

    if (!dashboard) return null;

    // One panel frame (header + content), reused by the grid and the full-bleed
    // single-panel layout. `draggable` adds the drag-handle class to the header.
    const panelFrame = (panel: DashboardPanel, draggable: boolean) => (
        <div key={panel.id} className={`border ${theme.border} bg-midnight-surface flex flex-col overflow-hidden h-full`}>
            <div className={`flex items-center justify-between px-3 py-1.5 border-b ${theme.border} bg-midnight-elevated ${draggable ? DRAG_HANDLE : ''}`}>
                <span
                    className="flex-1 text-xs font-mono text-midnight-text-body truncate px-1"
                    style={{
                        textAlign: panel.config?.style?.titleAlign || 'left',
                        fontWeight: panel.config?.style?.titleBold ? 700 : undefined,
                        background: panel.config?.style?.titleBackground || undefined,
                        color: panel.config?.style?.titleColor || undefined,
                    }}
                >{panel.title || panel.type}</span>
                {panelHeaderExtra && (
                    // Host-injected per-panel affordance (e.g. the viewer's
                    // copy-embed-link icon). Stop drag from hijacking the click.
                    <span onMouseDown={(e) => e.stopPropagation()} className="flex items-center">
                        {panelHeaderExtra(panel)}
                    </span>
                )}
                {canEditPanels && removePanel && (
                    <button
                        // Stop drag from starting when the user aims for the X.
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => removePanel(panel.id)}
                        className="p-0.5 hover:bg-midnight-raised text-midnight-text-muted hover:text-midnight-text-body transition-colors"
                    >
                        <X className="w-3 h-3" />
                    </button>
                )}
            </div>
            <div className="flex-1 min-h-0">
                <Suspense fallback={<ViewLoading />}>
                    <PanelContent panel={panel} records={records} columns={columns} />
                </Suspense>
            </div>
        </div>
    );

    const insightsBanner = dashboard.insights ? (
        <div className={`border ${theme.border} bg-midnight-elevated px-4 py-3 flex items-start gap-3`}>
            <Sparkles className="w-5 h-5 text-midnight-accent shrink-0 mt-0.5" />
            <p className={`text-sm ${theme.text} leading-relaxed`}>{dashboard.insights}</p>
        </div>
    ) : null;

    // A single-chart dashboard always maximizes — full width AND height (this is
    // the published default for one-chart shares). No grid; the panel fills.
    if (panels.length === 1) {
        return (
            <div className="flex flex-col gap-4 p-2 h-full min-h-[60vh]">
                {insightsBanner}
                <div className="flex-1 min-h-0">{panelFrame(panels[0], false)}</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 p-2">
            {insightsBanner}

            {/* Panel grid (draggable/resizable in the studio, static in the viewer) */}
            <GridLayoutWithWidth
                className="layout"
                layout={layout}
                cols={GRID_COLS}
                rowHeight={ROW_HEIGHT}
                margin={[GRID_MARGIN, GRID_MARGIN]}
                isDraggable={canEditLayout}
                isResizable={canEditLayout}
                draggableHandle={`.${DRAG_HANDLE}`}
                onDragStop={onLayoutChange}
                onResizeStop={onLayoutChange}
                // Editing → vertical-compact (no floating gaps). Viewer → null, so
                // the published dashboard renders exactly where the studio left it.
                compactType={canEditLayout ? 'vertical' : null}
            >
                {panels.map((panel) => panelFrame(panel, canEditLayout))}
            </GridLayoutWithWidth>
        </div>
    );
}

export default DashboardRenderer;
