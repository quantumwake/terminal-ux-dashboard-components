// DashboardRenderer — host-agnostic renderer for a grid of AI-generated or
// manually configured dashboard panels. Uses a 12-column CSS grid.
//
// Capabilities (theme, runQuery, removePanel) are injected by the host via
// DashboardContext — this component never imports a store or API client.
//   - studio (ui-enterprise): wires removePanel ⇒ panels show a remove button.
//   - published viewer (publish-ui): omits removePanel ⇒ read-only dashboard.

import { Suspense, useEffect, useRef, useState } from 'react';
import { X, Sparkles } from 'lucide-react';

import { useDashboard, useCapabilities } from '../context/DashboardContext';
import { shapeChartData } from '../sqlgen';
import type { Row, ChartType, ChartField } from '../sqlgen';
import type { ChartStyle } from '../chartStyle';
import {
    BarView,
    PieView,
    LineView,
    ScatterView,
    HeatmapView,
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

    // table / insight
    columns?: string[];
    text?: string;

    // metric
    label?: string;
    column?: string;

    [key: string]: unknown;
}

export interface DashboardPanel {
    id: string;
    type: string;
    title?: string;
    width?: number;
    height?: number;
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

/**
 * SqlPanel renders a panel whose config carries a server-side SQL query
 * (config.sql), running it against the full dataset (via the host's runQuery)
 * and shaping the result for the chart view. Query errors are kept in LOCAL
 * state (the host's runQuery just resolves/rejects).
 */
function SqlPanel({ panel }: SqlPanelProps) {
    const { runQuery } = useDashboard();
    // Ref so the query effect doesn't depend on runQuery's identity (hosts pass
    // an inline runQuery → depending on it would loop). See ChartBuilder.
    const runQueryRef = useRef(runQuery);
    runQueryRef.current = runQuery;
    const config: PanelConfig = panel.config || {};
    const chartType = config.chartType || (panel.type as ChartType | 'metric');

    const [rows, setRows] = useState<Row[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        const sql = config.sql || '';
        runQueryRef.current(sql).then(
            (res) => {
                if (cancelled) return;
                setLoading(false);
                setRows(res?.rows || []);
            },
            (err: unknown) => {
                if (cancelled) return;
                setLoading(false);
                setRows(null);
                setError(err instanceof Error ? err.message : String(err) || 'Query failed');
            },
        );
        return () => { cancelled = true; };
    }, [config.sql]);

    if (loading && !rows) {
        return <div className="flex items-center justify-center h-full text-xs text-midnight-text-muted">Running…</div>;
    }
    if (error) {
        return <div className="flex items-center justify-center h-full text-xs text-red-400 px-2 text-center">{error}</div>;
    }
    if (!rows) return null;

    if (chartType === 'metric') {
        const first = rows[0];
        const v = first ? Object.values(first)[0] : 0;
        return <MetricView value={Number(v) || 0} config={{ column: config.column || '', agg: config.agg, label: config.label }} />;
    }

    const shaped = shapeChartData(chartType, rows, { yFields: config.yFields || [] });
    switch (chartType) {
        case 'bar':
            return <BarView data={shaped as never} groupColumn={config.group || ''} valueColumn={config.value || ''} style={config.style} />;
        case 'grouped-bar': {
            // Preset data + keys from the SQL result; groupField is only used for
            // the client-side computation path, so it is irrelevant here.
            const gb = shaped as { data: unknown[]; keys: string[] };
            return <GroupedBarChart data={gb.data as never} keys={gb.keys} yFields={config.yFields || []} style={config.style} />;
        }
        case 'pie':
            return <PieView data={shaped as never} groupColumn={config.group || ''} style={config.style} />;
        case 'line':
            return <LineView data={shaped as never} xColumn={config.x || ''} yColumn={config.y || ''} style={config.style} />;
        case 'scatter':
            return <ScatterView data={shaped as never} xColumn={config.x || ''} yColumn={config.y || ''} style={config.style} />;
        case 'heatmap':
            return (shaped as unknown[]).length
                ? <HeatmapView data={shaped as never} rowColumn={config.row || ''} colColumn={config.col || ''} rowOrder={config.rowOrder as never} colOrder={config.colOrder as never} marginAgg={config.marginAgg} showTotals={config.showTotals} style={config.style} />
                : <div className="flex items-center justify-center h-full text-xs text-midnight-text-muted">No data</div>;
        default:
            return <div className="p-4 text-xs text-midnight-text-muted">Unsupported SQL chart: {chartType}</div>;
    }
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

    // SQL-backed panels fetch their own (full-dataset) data via runQuery.
    if (config.sql) {
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
        case 'pivot':
            return <PivotView records={records} />;
        case 'metric':
            return <MetricView records={records} config={{ column: config.column || '', agg: config.agg, label: config.label }} />;
        case 'insight':
            return <InsightView config={{ text: config.text }} />;
        case 'table': {
            const cols = config.columns
                ? config.columns.map((c) => ({ name: c }))
                : columns;
            // Inline simple table for dashboard panels.
            const colNames = cols?.map((c) => c.name) || (records && records[0] ? Object.keys(records[0]) : []);
            return (
                <div className="overflow-auto h-full text-xs">
                    <table className="w-full">
                        <thead className="sticky top-0 bg-midnight-elevated">
                            <tr>{colNames.map((n) => <th key={n} className="px-2 py-1 text-left text-midnight-text-muted font-mono border-b border-midnight-border">{n}</th>)}</tr>
                        </thead>
                        <tbody>
                            {(records || []).slice(0, 50).map((r, i) => (
                                <tr key={i} className="border-b border-dashed border-midnight-border hover:bg-midnight-raised">
                                    {colNames.map((n) => {
                                        const cellValue = r[n];
                                        return (
                                            <td key={n} className="px-2 py-1 text-midnight-text-body truncate max-w-[200px]">
                                                {cellValue == null ? '' : typeof cellValue === 'object' ? JSON.stringify(cellValue) : String(cellValue)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }
        default:
            return <div className="p-4 text-xs text-midnight-text-muted">Unknown panel type: {type}</div>;
    }
}

// ─── DashboardRenderer ─────────────────────────────────────────────────────

const ROW_HEIGHT = 180; // px per grid row

/**
 * DashboardRenderer — renders a grid of AI-generated or manually configured
 * panels. The per-panel remove button is gated behind canEditPanels: the
 * published viewer (no removePanel) renders the dashboard READ-ONLY.
 */
export function DashboardRenderer({ dashboard, records, columns }: DashboardRendererProps) {
    const { theme, removePanel } = useDashboard();
    const { canEditPanels } = useCapabilities();

    if (!dashboard) return null;

    return (
        <div className="flex flex-col gap-4 p-2">
            {/* Insights banner */}
            {dashboard.insights && (
                <div className={`border ${theme.border} bg-midnight-elevated px-4 py-3 flex items-start gap-3`}>
                    <Sparkles className="w-5 h-5 text-midnight-accent shrink-0 mt-0.5" />
                    <p className={`text-sm ${theme.text} leading-relaxed`}>{dashboard.insights}</p>
                </div>
            )}

            {/* Panel grid */}
            <div className="grid grid-cols-12 gap-3">
                {dashboard.panels?.map((panel) => {
                    const colSpan = Math.min(Math.max(panel.width || 6, 1), 12);
                    const rowSpan = Math.min(Math.max(panel.height || 2, 1), 4);

                    return (
                        <div
                            key={panel.id}
                            className={`border ${theme.border} bg-midnight-surface flex flex-col`}
                            style={{
                                gridColumn: `span ${colSpan}`,
                                minHeight: `${rowSpan * ROW_HEIGHT}px`,
                            }}
                        >
                            {/* Panel header */}
                            <div className={`flex items-center justify-between px-3 py-1.5 border-b ${theme.border} bg-midnight-elevated`}>
                                <span className="flex-1 text-xs font-mono text-midnight-text-body truncate" style={{ textAlign: panel.config?.style?.titleAlign || 'left' }}>{panel.title || panel.type}</span>
                                {canEditPanels && removePanel && (
                                    <button
                                        onClick={() => removePanel(panel.id)}
                                        className="p-0.5 hover:bg-midnight-raised text-midnight-text-muted hover:text-midnight-text-body transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                            {/* Panel content */}
                            <div className="flex-1 min-h-0">
                                <Suspense fallback={<ViewLoading />}>
                                    <PanelContent panel={panel} records={records} columns={columns} />
                                </Suspense>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default DashboardRenderer;
