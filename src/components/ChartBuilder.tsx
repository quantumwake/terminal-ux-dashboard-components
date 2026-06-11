import { useState, useMemo, useEffect, useRef, Suspense } from 'react';
import { ResponsiveBar } from '@nivo/bar';
import {
    BarChart3, PieChart, TrendingUp, ScatterChart, LayoutGrid,
    Plus, X, GripVertical, ChevronDown, Filter, Code, Loader2, AlertCircle,
} from 'lucide-react';

import { useDashboard } from '../context/DashboardContext';
import { buildChartSQL, shapeChartData } from '../sqlgen';
import type { ChartType, ChartConfig, ChartField, ChartFilter, Row } from '../sqlgen';
import { buildNivoTheme, legendConfig, DEFAULT_CHART_STYLE } from '../chartStyle';
import type { ChartStyle } from '../chartStyle';
import { groupBy, aggregate } from '../dataShape';
import {
    BarView, PieView, LineView, ScatterView, HeatmapView,
    type BarDatum, type PieDatum, type LineSerie, type ScatterSerie, type HeatmapSerie,
} from './views';
import { ChartStyleControls } from './ChartStyleControls';

// ─── Public types ─────────────────────────────────────────────────

// A schema column descriptor (name + statefs type tag used for the pill color).
export interface ChartBuilderColumn {
    name: string;
    type?: string;
}

// The panel descriptor handed to onSave when the user clicks "Add to Dashboard".
// Mirrors the legacy stateFsSlice.addDashboardPanel payload (the host assigns the
// panel id). config is intentionally loose — it carries both the legacy
// client-side fields and the SQL-mode fields, exactly as the studio persists.
export interface ChartPanel {
    title: string;
    type: ChartType | 'bar';
    config: Record<string, unknown>;
    width: number;
    height: number;
}

export interface ChartBuilderProps {
    // Loaded sample records, used by the 'direct' (client-side) engine mode and
    // forwarded to the views for local aggregation.
    records?: Row[];
    // Schema columns offered in the field pickers / available-fields list.
    columns: ChartBuilderColumn[];
    // Optional state selector forwarded to runQuery (host may be multi-state).
    stateId?: string;
    // Optional persistence hook. Absent ⇒ the "Add to Dashboard" button is hidden
    // (read-only viewer). Called with the assembled panel descriptor.
    onSave?: (panel: ChartPanel) => void;
}

// ─── Chart Types ──────────────────────────────────────────────────

interface ChartTypeOption {
    id: ChartType;
    icon: typeof BarChart3;
    label: string;
}

const CHART_TYPES: ChartTypeOption[] = [
    { id: 'bar', icon: BarChart3, label: 'Bar' },
    { id: 'pie', icon: PieChart, label: 'Pie' },
    { id: 'line', icon: TrendingUp, label: 'Line' },
    { id: 'scatter', icon: ScatterChart, label: 'Scatter' },
    { id: 'heatmap', icon: LayoutGrid, label: 'Heatmap' },
    { id: 'grouped-bar', icon: BarChart3, label: 'Grouped Bar' },
];

const AGG_OPTIONS = ['count', 'distinct', 'sum', 'avg', 'min', 'max'];

const FILTER_OPS = ['=', '!=', '<', '<=', '>', '>=', 'IN', 'NOT IN', 'LIKE', 'BETWEEN', 'IS NULL', 'IS NOT NULL'];
const OPS_NO_VALUE = new Set(['IS NULL', 'IS NOT NULL']);

interface IdLabel {
    id: string;
    label: string;
}

// Themed select. The package can't import the host's TerminalDropdown, so this is
// a raw <select> styled to match the surrounding Appearance/filter controls.
interface SelectControlProps {
    value: string;
    options: IdLabel[];
    onChange: (id: string) => void;
    className?: string;
}

const SelectControl = ({ value, options, onChange, className = 'w-28' }: SelectControlProps) => (
    <div className={className}>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-2 py-1 text-xs font-mono bg-midnight-surface border border-midnight-border text-midnight-text-body outline-none focus:border-midnight-accent transition-colors"
        >
            {options.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
            ))}
        </select>
    </div>
);

const ORDER_OPTIONS: IdLabel[] = [
    { id: 'alpha', label: 'A → Z' },
    { id: 'total-desc', label: 'Total ↓' },
    { id: 'total-asc', label: 'Total ↑' },
];
const MARGIN_AGGS: IdLabel[] = ['sum', 'avg', 'min', 'max', 'count'].map((a) => ({ id: a, label: a }));
const FILTER_OP_OPTIONS: IdLabel[] = FILTER_OPS.map((o) => ({ id: o, label: o }));

// ─── Field Pill ───────────────────────────────────────────────────

interface FieldPillProps {
    name: string;
    type?: string;
    onRemove?: () => void;
    onChangeAgg?: (agg: string) => void;
    agg?: string;
    showAgg?: boolean;
}

const FieldPill = ({ name, type, onRemove, onChangeAgg, agg, showAgg }: FieldPillProps) => {
    const typeColor = ({
        string: 'border-green-500/50 text-green-400',
        int64: 'border-blue-500/50 text-blue-400',
        float64: 'border-purple-500/50 text-purple-400',
        bool: 'border-orange-500/50 text-orange-400',
    } as Record<string, string>)[type ?? ''] || 'border-midnight-border text-midnight-text-body';

    return (
        <div className={`flex items-center gap-1 px-2 py-1 border ${typeColor} bg-midnight-surface text-xs font-mono`}>
            <GripVertical className="w-3 h-3 opacity-40" />
            <span>{name}</span>
            {showAgg && (
                <select value={agg} onChange={(e) => onChangeAgg?.(e.target.value)}
                    className="bg-transparent border-none text-xs outline-none ml-1 text-midnight-text-muted">
                    {AGG_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
            )}
            {onRemove && (
                <button onClick={onRemove} className="ml-1 hover:text-red-400"><X className="w-3 h-3" /></button>
            )}
        </div>
    );
};

// ─── Drop Zone ────────────────────────────────────────────────────

interface DropZoneProps {
    label: string;
    fields: ChartField[];
    onAdd: (field: ChartField) => void;
    onRemove: (idx: number) => void;
    onChangeAgg: (idx: number, agg: string) => void;
    columns: ChartBuilderColumn[];
    showAgg?: boolean;
    maxFields?: number;
}

const DropZone = ({ label, fields, onAdd, onRemove, onChangeAgg, columns, showAgg = false, maxFields = 5 }: DropZoneProps) => {
    const [showPicker, setShowPicker] = useState(false);
    const usedNames = new Set(fields.map((f) => f.name));
    const available = columns.filter((c) => !usedNames.has(c.name));

    return (
        <div>
            <div className="text-xs uppercase text-midnight-text-muted mb-1 font-mono">{label}</div>
            <div className="flex flex-wrap gap-1 min-h-[32px] p-1.5 border border-dashed border-midnight-border bg-midnight-surface/50">
                {fields.map((f, i) => (
                    <FieldPill
                        key={f.name}
                        name={f.name}
                        type={(f as ChartField & { type?: string }).type}
                        agg={f.agg}
                        showAgg={showAgg}
                        onRemove={() => onRemove(i)}
                        onChangeAgg={(agg) => onChangeAgg(i, agg)}
                    />
                ))}
                {fields.length < maxFields && available.length > 0 && (
                    <div className="relative">
                        <button onClick={() => setShowPicker(!showPicker)}
                            className="flex items-center gap-1 px-2 py-1 border border-dashed border-midnight-border text-xs text-midnight-text-muted hover:bg-midnight-raised transition-colors">
                            <Plus className="w-3 h-3" /> Add
                        </button>
                        {showPicker && (
                            <div className="absolute top-full left-0 mt-1 z-20 bg-midnight-elevated border border-midnight-border shadow-lg max-h-[200px] overflow-auto min-w-[150px]">
                                {available.map((col) => (
                                    <button key={col.name}
                                        onClick={() => { onAdd({ name: col.name, type: col.type, agg: 'count' } as ChartField); setShowPicker(false); }}
                                        className="block w-full text-left px-3 py-1.5 text-xs font-mono text-midnight-text-body hover:bg-midnight-raised transition-colors">
                                        <span>{col.name}</span>
                                        <span className="text-midnight-text-muted ml-2">({col.type})</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Filters (compile to a WHERE clause) ─────────────────────────

interface FiltersSectionProps {
    filters: ChartFilter[];
    columns: ChartBuilderColumn[];
    onChange: (filters: ChartFilter[]) => void;
}

const FiltersSection = ({ filters, columns, onChange }: FiltersSectionProps) => {
    const addFilter = () => onChange([...filters, { column: columns[0]?.name || '', op: '=', value: '' }]);
    const updateFilter = (i: number, patch: Partial<ChartFilter>) => onChange(filters.map((f, idx) => idx === i ? { ...f, ...patch } : f));
    const removeFilter = (i: number) => onChange(filters.filter((_, idx) => idx !== i));

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase text-midnight-text-muted font-mono flex items-center gap-1"><Filter className="w-3 h-3" /> Filters</div>
                <button onClick={addFilter} disabled={!columns.length}
                    className="flex items-center gap-1 px-1.5 py-0.5 border border-dashed border-midnight-border text-xs text-midnight-text-muted hover:bg-midnight-raised transition-colors">
                    <Plus className="w-3 h-3" /> Add
                </button>
            </div>
            <div className="space-y-1">
                {filters.map((f, i) => (
                    <div key={i} className="flex items-center gap-1">
                        <SelectControl
                            value={f.column}
                            options={columns.map((c) => ({ id: c.name, label: c.name }))}
                            onChange={(colId) => updateFilter(i, { column: colId })}
                            className="flex-1 min-w-0"
                        />
                        <SelectControl
                            value={f.op}
                            options={FILTER_OP_OPTIONS}
                            onChange={(op) => updateFilter(i, { op })}
                            className="w-24 shrink-0"
                        />
                        {!OPS_NO_VALUE.has(f.op) && (
                            <div className="w-20 shrink-0">
                                <input
                                    value={f.value ?? ''}
                                    onChange={(e) => updateFilter(i, { value: e.target.value })}
                                    placeholder={f.op === 'IN' || f.op === 'NOT IN' ? 'a,b,c' : f.op === 'BETWEEN' ? 'lo,hi' : 'value'}
                                    className="w-full px-2 py-1 text-xs font-mono bg-midnight-surface border border-midnight-border text-midnight-text-body outline-none focus:border-midnight-accent transition-colors"
                                />
                            </div>
                        )}
                        <button onClick={() => removeFilter(i)} className="text-midnight-text-muted hover:text-red-400"><X className="w-3 h-3" /></button>
                    </div>
                ))}
                {!filters.length && <div className="text-xs text-midnight-text-muted font-mono px-1">No filters</div>}
            </div>
        </div>
    );
};

// ─── Multi-Series Bar Chart (built inline for grouped data) ──────

interface GroupedBarRow {
    group: string;
    [key: string]: string | number;
}

export interface GroupedBarChartProps {
    records?: Row[];
    xFields?: ChartField[];
    yFields?: ChartField[];
    groupField?: ChartField | null;
    data?: GroupedBarRow[];
    keys?: string[];
    style?: Partial<ChartStyle>;
}

export const GroupedBarChart = ({ records, xFields = [], yFields = [], groupField, data: presetData, keys: presetKeys, style }: GroupedBarChartProps) => {
    const computed = useMemo<GroupedBarRow[]>(() => {
        if (presetData || !records || !xFields.length || !yFields.length) return [];
        const xCol = xFields[0].name;
        const groups = groupBy(records, xCol);

        return Object.entries(groups)
            .map(([key, recs]) => {
                const row: GroupedBarRow = { group: key };
                yFields.forEach((yf) => {
                    row[`${yf.agg}(${yf.name})`] = aggregate(recs, yf.name, yf.agg ?? 'count');
                });
                return row;
            })
            .sort((a, b) => {
                const firstKey = `${yFields[0].agg}(${yFields[0].name})`;
                return (Number(b[firstKey]) || 0) - (Number(a[firstKey]) || 0);
            })
            .slice(0, 50);
    }, [records, xFields, yFields, presetData]);

    const data = presetData || computed;
    if (!data.length) return null;

    const keys = presetKeys || yFields.map((yf) => `${yf.agg}(${yf.name})`);
    const colors = ['rgba(74,222,128,0.8)', 'rgba(96,165,250,0.8)', 'rgba(251,146,60,0.8)', 'rgba(167,139,250,0.8)', 'rgba(248,113,113,0.8)'];

    const legend = legendConfig(style);
    return (
        <div className="h-full min-h-[400px]">
            <ResponsiveBar
                data={data as never}
                keys={keys}
                indexBy="group"
                groupMode={groupField ? 'grouped' : 'stacked'}
                margin={{ top: 20, right: 120, bottom: 60, left: 60 }}
                padding={0.3}
                colors={colors.slice(0, keys.length)}
                axisBottom={{ tickSize: 5, tickPadding: 5, tickRotation: -35 }}
                axisLeft={{ tickSize: 5, tickPadding: 5, format: (v) => Number(v).toLocaleString() }}
                labelSkipWidth={12}
                labelSkipHeight={12}
                labelTextColor={{ from: 'color', modifiers: [['darker', 3]] } as never}
                legends={legend ? [{ dataFrom: 'keys', ...legend } as never] : []}
                theme={buildNivoTheme(style)}
            />
        </div>
    );
};

// ─── Chart Preview ────────────────────────────────────────────────

interface HeatmapOpts {
    rowOrder?: 'alpha' | 'total-asc' | 'total-desc';
    colOrder?: 'alpha' | 'total-asc' | 'total-desc';
    marginAgg?: string;
    showTotals?: boolean;
}

interface ChartPreviewProps {
    chartType: ChartType;
    records?: Row[];
    xFields: ChartField[];
    yFields: ChartField[];
    valueField: ChartField | null;
    groupField: ChartField | null;
    colorField: ChartField | null;
    engineMode: 'sql' | 'direct';
    sqlRows: Row[] | null;
    sqlLoading: boolean;
    sqlError: string | null;
    heatmapOpts?: HeatmapOpts;
    style: ChartStyle;
}

const ChartPreview = ({
    chartType, records, xFields, yFields, valueField, groupField, engineMode,
    sqlRows, sqlLoading, sqlError, heatmapOpts = {}, style,
}: ChartPreviewProps) => {
    const xCol = xFields[0]?.name;
    const yCol = yFields[0]?.name;
    const yAgg = yFields[0]?.agg || 'count';

    // ─── SQL mode: render from server-side query results ──────────────
    if (engineMode === 'sql') {
        if (sqlError) {
            return <div className="flex items-center justify-center h-full text-sm text-red-400 gap-2 px-4 text-center"><AlertCircle className="w-4 h-4 shrink-0" /> {sqlError}</div>;
        }
        if (sqlLoading && !sqlRows) {
            return <div className="flex items-center justify-center h-full text-sm text-midnight-text-muted gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Running query…</div>;
        }
        if (!sqlRows) {
            return <div className="flex items-center justify-center h-full text-sm text-midnight-text-muted">Configure the chart to run a query</div>;
        }
        if (chartType === 'grouped-bar' || (chartType === 'bar' && (yFields.length > 1 || groupField))) {
            const { data, keys } = shapeChartData('grouped-bar', sqlRows, { yFields }) as { data: GroupedBarRow[]; keys: string[] };
            return <GroupedBarChart data={data} keys={keys} yFields={yFields} groupField={groupField} style={style} />;
        }
        const shaped = shapeChartData(chartType, sqlRows, { yFields });
        switch (chartType) {
            case 'bar': return <Suspense fallback={null}><BarView data={shaped as BarDatum[]} groupColumn={xCol} valueColumn={yCol} style={style} /></Suspense>;
            case 'pie': return <Suspense fallback={null}><PieView data={shaped as PieDatum[]} groupColumn={xCol} style={style} /></Suspense>;
            case 'line': return <Suspense fallback={null}><LineView data={shaped as LineSerie[]} xColumn={xCol} yColumn={yCol} style={style} /></Suspense>;
            case 'scatter': return <Suspense fallback={null}><ScatterView data={shaped as ScatterSerie[]} xColumn={xCol} yColumn={yCol} style={style} /></Suspense>;
            case 'heatmap': return (shaped as HeatmapSerie[]).length ? <Suspense fallback={null}><HeatmapView data={shaped as HeatmapSerie[]} rowColumn={xCol} colColumn={yCol} {...heatmapOpts} style={style} /></Suspense>
                : <div className="flex items-center justify-center h-full text-sm text-midnight-text-muted">No data</div>;
            default: return <div className="flex items-center justify-center h-full text-sm text-midnight-text-muted">Select a chart type</div>;
        }
    }

    // ─── Direct mode: client-side aggregation over the loaded sample ──
    if (!records?.length) return <div className="flex items-center justify-center h-full text-sm text-midnight-text-muted">No data</div>;

    switch (chartType) {
        case 'bar':
            if (yFields.length > 1 || groupField) {
                return <GroupedBarChart records={records} xFields={xFields} yFields={yFields} groupField={groupField} style={style} />;
            }
            return xCol ? <Suspense fallback={null}><BarView records={records} groupColumn={xCol} valueColumn={yCol} aggFn={yAgg} style={style} /></Suspense> : null;

        case 'grouped-bar':
            return <GroupedBarChart records={records} xFields={xFields} yFields={yFields} groupField={groupField} style={style} />;

        case 'pie':
            return xCol ? <Suspense fallback={null}><PieView records={records} groupColumn={xCol} style={style} /></Suspense> : null;

        case 'line':
            return xCol && yCol ? <Suspense fallback={null}><LineView records={records} xColumn={xCol} yColumn={yCol} style={style} /></Suspense> : null;

        case 'scatter':
            return xCol && yCol ? <Suspense fallback={null}><ScatterView records={records} xColumn={xCol} yColumn={yCol} style={style} /></Suspense> : null;

        case 'heatmap':
            return xCol && yCol ? <Suspense fallback={null}><HeatmapView records={records} rowColumn={xCol} colColumn={yCol} valueColumn={valueField?.name} aggFn={valueField?.agg || 'count'} {...heatmapOpts} style={style} /></Suspense> : null;

        default:
            return <div className="flex items-center justify-center h-full text-sm text-midnight-text-muted">Select a chart type</div>;
    }
};

// ─── Main ChartBuilder ────────────────────────────────────────────

type Zone = 'x' | 'y' | 'value' | 'group' | 'color';

/**
 * ChartBuilder — visual chart authoring over a state's dataset. Generates DuckDB
 * SQL from the visual config (SQL engine mode, exact over the full dataset) or
 * aggregates the loaded sample client-side (Direct mode). The host injects
 * runQuery + theme via <DashboardProvider>; an optional onSave persists the
 * assembled panel (absent ⇒ the save affordance is hidden / read-only).
 */
// Cap on rows baked onto a panel as precomputed data (config.data, inlined into
// the dashboard JSON / published manifest). Aggregations are tiny; this guards
// against baking a scatter-of-everything (those stay live/Refresh-only).
// TODO(precompute-parquet): for larger results, back the precomputed output with
// a small RESULT PARQUET (written next to the snapshot) referenced by the panel
// (e.g. config.dataKey) and loaded via DuckDB-WASM, instead of inlining rows in
// the metadata JSON — keeps the manifest small and the result database-backed.
// See docs/activities.md.
const MAX_PRECOMPUTE_ROWS = 5000;

export function ChartBuilder({ records, columns, stateId, onSave }: ChartBuilderProps) {
    const { theme, runQuery } = useDashboard();
    // Hold runQuery in a ref so effects don't depend on its identity — hosts
    // commonly pass an inline runQuery (new each render); depending on it would
    // re-fire the query effect every render → infinite setState loop.
    const runQueryRef = useRef(runQuery);
    runQueryRef.current = runQuery;

    const [chartType, setChartType] = useState<ChartType>('bar');
    const [xFields, setXFields] = useState<ChartField[]>([]);
    const [yFields, setYFields] = useState<ChartField[]>([]);
    const [valueField, setValueField] = useState<ChartField | null>(null);
    const [groupField, setGroupField] = useState<ChartField | null>(null);
    const [colorField, setColorField] = useState<ChartField | null>(null);
    const [title, setTitle] = useState('');

    // Query engine: 'sql' = exact, server-side over the full dataset (default);
    // 'direct' = client-side aggregation over the loaded sample (fallback).
    const [engineMode, setEngineMode] = useState<'sql' | 'direct'>('sql');
    const [filters, setFilters] = useState<ChartFilter[]>([]);
    const [showSql, setShowSql] = useState(false);

    // Heatmap axis ordering + marginal totals.
    const [rowOrder, setRowOrder] = useState<'alpha' | 'total-asc' | 'total-desc'>('alpha');
    const [colOrder, setColOrder] = useState<'alpha' | 'total-asc' | 'total-desc'>('alpha');
    const [marginAgg, setMarginAgg] = useState('sum');
    const [showTotals, setShowTotals] = useState(false);

    // Standardized chart appearance (see chartStyle.ts).
    const [style, setStyle] = useState<ChartStyle>(DEFAULT_CHART_STYLE);
    const [showStyle, setShowStyle] = useState(false);

    // SQL preview state (driven by runQuery when engineMode === 'sql').
    const [sqlRows, setSqlRows] = useState<Row[] | null>(null);
    const [sqlLoading, setSqlLoading] = useState(false);
    const [sqlError, setSqlError] = useState<string | null>(null);

    // The SQL generated from the current visual config.
    const generatedSql = useMemo(
        () => buildChartSQL({ chartType, xFields, yFields, valueField, filters } as ChartConfig),
        [chartType, xFields, yFields, valueField, filters],
    );

    // Run the generated query whenever it changes (SQL mode only).
    useEffect(() => {
        if (engineMode !== 'sql') return undefined;
        if (!generatedSql) { setSqlRows(null); setSqlError(null); return undefined; }
        let cancelled = false;
        setSqlLoading(true);
        setSqlError(null);
        runQueryRef.current(generatedSql, stateId).then((res) => {
            if (cancelled) return;
            setSqlLoading(false);
            setSqlRows(res.rows || []);
        }).catch((err: unknown) => {
            if (cancelled) return;
            setSqlLoading(false);
            setSqlRows(null);
            setSqlError(err instanceof Error ? err.message : String(err) || 'Query failed');
        });
        return () => { cancelled = true; };
    }, [engineMode, generatedSql, stateId]);

    const addField = (zone: Zone, field: ChartField) => {
        switch (zone) {
            case 'x': setXFields((f) => [...f, field]); break;
            case 'y': setYFields((f) => [...f, field]); break;
            case 'value': setValueField(field); break;
            case 'group': setGroupField(field); break;
            case 'color': setColorField(field); break;
        }
    };

    const removeField = (zone: Zone, idx?: number) => {
        switch (zone) {
            case 'x': setXFields((f) => f.filter((_, i) => i !== idx)); break;
            case 'y': setYFields((f) => f.filter((_, i) => i !== idx)); break;
            case 'value': setValueField(null); break;
            case 'group': setGroupField(null); break;
            case 'color': setColorField(null); break;
        }
    };

    const changeAgg = (zone: Zone, idx: number, agg: string) => {
        if (zone === 'y') {
            setYFields((f) => f.map((field, i) => i === idx ? { ...field, agg } : field));
        } else if (zone === 'value') {
            setValueField((f) => f ? { ...f, agg } : f);
        }
    };

    // Save current chart config as a dashboard panel.
    const handleSaveToDashboard = () => {
        if (!onSave) return;
        const config: Record<string, unknown> = {};
        if (xFields.length) config.group = xFields[0].name;
        if (yFields.length) { config.value = yFields[0].name; config.agg = yFields[0].agg; }
        if (chartType === 'line' || chartType === 'scatter') {
            config.x = xFields[0]?.name;
            config.y = yFields[0]?.name;
        }
        if (chartType === 'heatmap') {
            config.row = xFields[0]?.name;
            config.col = yFields[0]?.name;
            // Value column is optional; absence means cell value = count.
            if (valueField) {
                config.value = valueField.name;
                config.agg = valueField.agg || 'count';
            } else {
                delete config.value;
                delete config.agg;
            }
            // Axis ordering + marginal totals.
            config.rowOrder = rowOrder;
            config.colOrder = colOrder;
            config.marginAgg = marginAgg;
            config.showTotals = showTotals;
        }

        // In SQL mode persist the generated query + filters so the saved panel
        // renders server-side (exact, full dataset). Legacy fields above remain
        // for backward-compatible client-side rendering when the endpoint is absent.
        if (engineMode === 'sql' && generatedSql) {
            config.sql = generatedSql;
            config.chartType = chartType; // shaping hint for the renderer
            if (filters.length) config.filters = filters;
            if (yFields.length) config.yFields = yFields.map((f) => ({ name: f.name, agg: f.agg }));
            // PRECOMPUTE: bake the current preview result onto the panel so it
            // renders without a live query (instant in the studio, and carried into
            // published dashboards verbatim). Skip oversized results (e.g. a
            // scatter of every row) — those stay live/Refresh-only.
            if (sqlRows && sqlRows.length <= MAX_PRECOMPUTE_ROWS) {
                config.data = sqlRows;
                config.refreshedAt = new Date().toISOString();
            }
        }

        // Standardized appearance travels with the panel.
        config.style = style;

        onSave({
            title: title || `${chartType} chart`,
            type: chartType === 'grouped-bar' ? 'bar' : chartType,
            config,
            width: 6,
            height: 2,
        });
    };

    return (
        <div className="flex h-full">
            {/* Left: Config Panel */}
            <div className={`w-[280px] shrink-0 border-r ${theme.border} bg-midnight-elevated overflow-y-auto p-3 space-y-4`}>
                {/* Chart Type */}
                <div>
                    <div className="text-xs uppercase text-midnight-text-muted mb-2 font-mono">Chart Type</div>
                    <div className="grid grid-cols-3 gap-1">
                        {CHART_TYPES.map((ct) => (
                            <button key={ct.id} onClick={() => setChartType(ct.id)}
                                className={`flex flex-col items-center gap-1 p-2 border text-xs font-mono transition-colors ${
                                    chartType === ct.id
                                        ? 'border-midnight-accent text-midnight-accent bg-midnight-accent/10'
                                        : 'border-midnight-border text-midnight-text-muted hover:bg-midnight-raised'
                                }`}>
                                <ct.icon className="w-4 h-4" />
                                {ct.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Query engine toggle */}
                <div>
                    <div className="text-xs uppercase text-midnight-text-muted mb-1 font-mono">Query Engine</div>
                    <div className="flex border border-midnight-border">
                        {([
                            { id: 'sql', label: 'SQL (full data)' },
                            { id: 'direct', label: 'Direct (sample)' },
                        ] as { id: 'sql' | 'direct'; label: string }[]).map((m) => (
                            <button key={m.id} onClick={() => setEngineMode(m.id)}
                                className={`flex-1 px-2 py-1 text-xs font-mono transition-colors ${
                                    engineMode === m.id ? 'bg-midnight-accent/10 text-midnight-accent' : 'text-midnight-text-muted hover:bg-midnight-raised'
                                }`}>
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Drop Zones */}
                <DropZone
                    label={chartType === 'heatmap' ? 'Rows' : 'X Axis / Group By'}
                    fields={xFields}
                    columns={columns}
                    onAdd={(f) => addField('x', f)}
                    onRemove={(i) => removeField('x', i)}
                    onChangeAgg={() => {}}
                    maxFields={chartType === 'pie' || chartType === 'heatmap' ? 1 : 3}
                />

                <DropZone
                    label={chartType === 'heatmap' ? 'Columns' : 'Y Axis / Values'}
                    fields={yFields}
                    columns={columns}
                    onAdd={(f) => addField('y', f)}
                    onRemove={(i) => removeField('y', i)}
                    onChangeAgg={(i, agg) => changeAgg('y', i, agg)}
                    showAgg={chartType !== 'heatmap'}
                    maxFields={chartType === 'heatmap' ? 1 : 5}
                />

                {chartType === 'heatmap' && (
                    <DropZone
                        label="Cell Value (optional — defaults to count)"
                        fields={valueField ? [valueField] : []}
                        columns={columns}
                        onAdd={(f) => addField('value', f)}
                        onRemove={() => removeField('value')}
                        onChangeAgg={(i, agg) => changeAgg('value', i, agg)}
                        showAgg={true}
                        maxFields={1}
                    />
                )}

                {chartType === 'heatmap' && (
                    <div>
                        <div className="text-xs uppercase text-midnight-text-muted mb-2 font-mono">Order &amp; Totals</div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3 min-h-[28px]">
                                <span className="text-xs font-mono text-midnight-text-muted">Order rows</span>
                                <SelectControl value={rowOrder} options={ORDER_OPTIONS} onChange={(v) => setRowOrder(v as typeof rowOrder)} />
                            </div>
                            <div className="flex items-center justify-between gap-3 min-h-[28px]">
                                <span className="text-xs font-mono text-midnight-text-muted">Order columns</span>
                                <SelectControl value={colOrder} options={ORDER_OPTIONS} onChange={(v) => setColOrder(v as typeof colOrder)} />
                            </div>
                            <div className="flex items-center justify-between gap-3 min-h-[28px]">
                                <span className="text-xs font-mono text-midnight-text-muted">Total aggregator</span>
                                <SelectControl value={marginAgg} options={MARGIN_AGGS} onChange={setMarginAgg} />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showTotals}
                                    onChange={(e) => setShowTotals(e.target.checked)}
                                    className="accent-midnight-accent"
                                />
                                <span className="text-xs font-mono text-midnight-text-muted">Show row/column totals</span>
                            </label>
                        </div>
                    </div>
                )}

                {(chartType === 'bar' || chartType === 'grouped-bar') && (
                    <DropZone
                        label="Group / Color"
                        fields={groupField ? [groupField] : []}
                        columns={columns}
                        onAdd={(f) => addField('group', f)}
                        onRemove={() => removeField('group')}
                        onChangeAgg={() => {}}
                        maxFields={1}
                    />
                )}

                {/* Filters → WHERE */}
                <FiltersSection filters={filters} columns={columns} onChange={setFilters} />

                {/* Generated SQL (read-only preview, SQL mode) */}
                {engineMode === 'sql' && (
                    <div>
                        <button onClick={() => setShowSql((s) => !s)}
                            className="flex items-center gap-1 text-xs uppercase text-midnight-text-muted font-mono hover:text-midnight-text-body transition-colors">
                            <Code className="w-3 h-3" />
                            <ChevronDown className={`w-3 h-3 transition-transform ${showSql ? '' : '-rotate-90'}`} />
                            Generated SQL
                        </button>
                        {showSql && (
                            <pre className="mt-1 p-2 bg-midnight-surface border border-midnight-border text-[11px] font-mono text-midnight-text-body whitespace-pre-wrap break-words max-h-[160px] overflow-auto">
                                {generatedSql || '— configure the chart —'}
                            </pre>
                        )}
                    </div>
                )}

                {/* Appearance (standardized across all charts) */}
                <div>
                    <button onClick={() => setShowStyle((s) => !s)}
                        className="flex items-center gap-1 text-xs uppercase text-midnight-text-muted font-mono hover:text-midnight-text-body transition-colors">
                        <ChevronDown className={`w-3 h-3 transition-transform ${showStyle ? '' : '-rotate-90'}`} />
                        Appearance
                    </button>
                    {showStyle && (
                        <div className="mt-2">
                            <ChartStyleControls style={style} onChange={setStyle} />
                        </div>
                    )}
                </div>

                {/* Title + Save */}
                {onSave && (
                    <div className="pt-4 border-t border-midnight-border">
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Chart title..."
                            className="w-full mb-2 px-2 py-1 text-xs font-mono bg-midnight-surface border border-midnight-border text-midnight-text-body outline-none focus:border-midnight-accent transition-colors"
                        />
                        <button onClick={handleSaveToDashboard}
                            className="w-full px-3 py-1.5 border border-midnight-accent text-midnight-accent text-xs font-mono hover:bg-midnight-accent/10 transition-colors">
                            + Add to Dashboard
                        </button>
                    </div>
                )}

                {/* Available Fields (reference) */}
                <div className="pt-4 border-t border-midnight-border">
                    <div className="text-xs uppercase text-midnight-text-muted mb-2 font-mono">Available Fields</div>
                    <div className="space-y-1">
                        {columns.map((col) => (
                            <div key={col.name} className="flex items-center justify-between text-xs font-mono px-1 py-0.5">
                                <span className="text-midnight-text-body">{col.name}</span>
                                <span className="text-midnight-text-muted">{col.type}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right: Chart Preview */}
            <div className="flex-1 min-h-0 p-2">
                <ChartPreview
                    chartType={chartType}
                    records={records}
                    xFields={xFields}
                    yFields={yFields}
                    valueField={valueField}
                    groupField={groupField}
                    colorField={colorField}
                    engineMode={engineMode}
                    sqlRows={sqlRows}
                    sqlLoading={sqlLoading}
                    sqlError={sqlError}
                    heatmapOpts={{ rowOrder, colOrder, marginAgg, showTotals }}
                    style={style}
                />
            </div>
        </div>
    );
}

export default ChartBuilder;
