import { useMemo } from 'react';
import { ResponsiveHeatMap } from '@nivo/heatmap';

import { groupBy, aggregate } from '../../dataShape';
import { buildNivoTheme, withStyleDefaults } from '../../chartStyle';
import type { ChartStyle } from '../../chartStyle';
import type { Row } from '../../sqlgen';
import {
    normalizeCells, heatColor, heatLabelColor, cellKey,
    type HeatStat, type ColorScope, type ColorMethod, type HeatCell,
} from '../../heatmapColor';

const MAX_AXIS = 30;
const TOTAL_ID = 'Σ';
const NULL = '(null)';

// One cell's two stat values (label vs color), plus an optional block tag.
interface CellStat { lv: number; cv: number; block?: string }
type Stats = Record<string, Record<string, CellStat>>; // [row][col]
type Margin = Record<string, CellStat>;

// Flat datum emitted by sqlgen's heatmap-plus shaper: body cells plus margin
// rows, distinguished by the GROUPING flags gr/gc.
export interface HeatPlusDatum {
    r: string | null;
    c: string | null;
    lv: number;
    cv: number;
    gr?: number;
    gc?: number;
    block?: string;
}

// margin-* and total-* are aliases (so the builder's existing order control,
// which emits total-*, drives both heatmaps).
type AxisOrder = 'alpha' | 'margin-asc' | 'margin-desc' | 'total-asc' | 'total-desc';

export interface HeatmapPlusViewProps {
    // Direct path: raw rows + field config (margins computed over these rows).
    records?: Row[];
    rowColumn: string;
    colColumn: string;
    valueColumn?: string;
    labelStat?: HeatStat;
    colorStat?: HeatStat;
    blockField?: string;
    // Baked/SQL path: pre-aggregated cells + margins (gr/gc flagged).
    data?: HeatPlusDatum[];
    // Color engine.
    scope?: ColorScope;
    method?: ColorMethod;
    vmin?: number;
    vmax?: number;
    // Axis ordering + margin display.
    rowOrder?: AxisOrder;
    colOrder?: AxisOrder;
    showMargins?: boolean;
    style?: Partial<ChartStyle>;
}

const fmtNum = (n: number): string => {
    if (typeof n !== 'number' || Number.isNaN(n)) return '';
    return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const orderIds = (ids: string[], margin: Margin, order: AxisOrder): string[] => {
    const sorted = [...ids];
    if (order.endsWith('-desc')) sorted.sort((a, b) => (margin[b]?.lv ?? 0) - (margin[a]?.lv ?? 0));
    else if (order.endsWith('-asc')) sorted.sort((a, b) => (margin[a]?.lv ?? 0) - (margin[b]?.lv ?? 0));
    else sorted.sort();
    return sorted;
};

// Assemble cells + margins from raw records: every margin aggregated over the
// UNDERLYING rows (group → aggregate), so median/avg margins stay correct.
function fromRecords(
    records: Row[], rowCol: string, colCol: string,
    valueCol: string | undefined, labelStat: HeatStat, colorStat: HeatStat, blockField?: string,
): { rowIds: string[]; colIds: string[]; cells: Stats; rowMargin: Margin; colMargin: Margin; grand: CellStat } {
    const col = valueCol || rowCol; // unused for count; aggregate ignores it
    const statOf = (rs: Row[], s: HeatStat): number => (valueCol ? aggregate(rs, col, s) : rs.length);
    const both = (rs: Row[]): CellStat => ({ lv: statOf(rs, labelStat), cv: statOf(rs, colorStat) });

    const byRow = groupBy(records, rowCol);
    const rowIds: string[] = Object.keys(byRow);
    const colIds: string[] = [...new Set(records.map((r) => String(r[colCol] ?? NULL)))];

    const cells: Stats = {};
    for (const rid of rowIds) {
        cells[rid] = {};
        const byCol = groupBy(byRow[rid], colCol);
        for (const cid of colIds) {
            const cellRows = byCol[cid] || [];
            const stat = both(cellRows);
            if (blockField && cellRows.length) stat.block = String(cellRows[0][blockField] ?? NULL);
            cells[rid][cid] = stat;
        }
    }
    const rowMargin: Margin = {};
    for (const rid of rowIds) rowMargin[rid] = both(byRow[rid]);
    const colMargin: Margin = {};
    const byCol = groupBy(records, colCol);
    for (const cid of colIds) colMargin[cid] = both(byCol[cid] || []);
    return { rowIds, colIds, cells, rowMargin, colMargin, grand: both(records) };
}

// Assemble cells + margins from the flat baked data (margins already computed
// over underlying rows server-side via GROUPING SETS).
function fromData(
    data: HeatPlusDatum[],
): { rowIds: string[]; colIds: string[]; cells: Stats; rowMargin: Margin; colMargin: Margin; grand: CellStat } {
    const cells: Stats = {};
    const rowMargin: Margin = {};
    const colMargin: Margin = {};
    let grand: CellStat = { lv: 0, cv: 0 };
    const rowIds: string[] = [];
    const colIds: string[] = [];
    for (const d of data) {
        const stat: CellStat = { lv: d.lv, cv: d.cv, ...(d.block != null ? { block: d.block } : {}) };
        if (d.gr && d.gc) { grand = stat; continue; }       // grand total
        if (d.gr) { if (d.c != null) colMargin[d.c] = stat; continue; } // column margin
        if (d.gc) { if (d.r != null) rowMargin[d.r] = stat; continue; } // row margin
        const r = d.r ?? NULL, c = d.c ?? NULL;             // body cell
        if (!cells[r]) { cells[r] = {}; rowIds.push(r); }
        if (!colIds.includes(c)) colIds.push(c);
        cells[r][c] = stat;
    }
    return { rowIds, colIds, cells, rowMargin, colMargin, grand };
}

/**
 * HeatmapPlusView — a cross-tab heatmap with independent label/color stats,
 * margins computed over the underlying rows, and a scope/method color engine
 * (see heatmapColor.ts). nivo's built-in scales normalize globally, so colors
 * are precomputed per cell here and handed to nivo as a function.
 */
export function HeatmapPlusView({
    records, rowColumn, colColumn, valueColumn,
    labelStat = 'count', colorStat = 'count', blockField,
    data: presetData,
    scope = 'global', method = 'linear', vmin, vmax,
    rowOrder = 'alpha', colOrder = 'alpha', showMargins = false, style,
}: HeatmapPlusViewProps) {
    const s = withStyleDefaults(style);

    const model = useMemo(() => {
        if (presetData) return fromData(presetData);
        if (records) return fromRecords(records, rowColumn, colColumn, valueColumn, labelStat, colorStat, blockField);
        return null;
    }, [presetData, records, rowColumn, colColumn, valueColumn, labelStat, colorStat, blockField]);

    const built = useMemo(() => {
        if (!model || !model.rowIds.length || !model.colIds.length) return null;
        const { cells, rowMargin, colMargin, grand } = model;

        const rows = orderIds(model.rowIds, rowMargin, rowOrder).slice(0, MAX_AXIS);
        const cols = orderIds(model.colIds, colMargin, colOrder).slice(0, MAX_AXIS);

        // Precompute normalized t per cell. Body uses the chosen scope+method (+
        // optional fixed vmin/vmax). Margins normalize on their OWN scope (row
        // margins together, column margins together, grand alone) — never folded
        // into the body — using the same method, but no fixed override.
        const bodyCells: HeatCell[] = [];
        for (const rid of rows) for (const cid of cols) {
            bodyCells.push({ row: rid, col: cid, colorValue: cells[rid]?.[cid]?.cv ?? NaN, block: cells[rid]?.[cid]?.block });
        }
        const t = new Map<string, number>(normalizeCells(bodyCells, { scope, method, vmin, vmax }));

        if (showMargins) {
            const rowMc: HeatCell[] = rows.map((rid) => ({ row: rid, col: TOTAL_ID, colorValue: rowMargin[rid]?.cv ?? NaN }));
            const colMc: HeatCell[] = cols.map((cid) => ({ row: TOTAL_ID, col: cid, colorValue: colMargin[cid]?.cv ?? NaN }));
            for (const [k, v] of normalizeCells(rowMc, { scope: 'global', method })) t.set(k, v);
            for (const [k, v] of normalizeCells(colMc, { scope: 'global', method })) t.set(k, v);
            t.set(cellKey(TOTAL_ID, TOTAL_ID), 0.5);
        }

        // nivo matrix: y carries the LABEL stat (drives the cell label); color
        // comes from the precomputed t map, not y.
        const colKeys = showMargins ? [...cols, TOTAL_ID] : cols;
        const nivoData = rows.map((rid) => ({
            id: rid,
            data: colKeys.map((cid) => ({
                x: cid,
                y: cid === TOTAL_ID ? (rowMargin[rid]?.lv ?? 0) : (cells[rid]?.[cid]?.lv ?? 0),
            })),
        }));
        if (showMargins) {
            nivoData.push({
                id: TOTAL_ID,
                data: colKeys.map((cid) => ({
                    x: cid,
                    y: cid === TOTAL_ID ? grand.lv : (colMargin[cid]?.lv ?? 0),
                })),
            });
        }
        return { nivoData, t };
    }, [model, rowOrder, colOrder, scope, method, vmin, vmax, showMargins]);

    if (!built) {
        return <div className="p-8 text-center text-midnight-text-muted">Not enough distinct values for a heatmap</div>;
    }

    const { nivoData, t } = built;
    const tAt = (serieId: string, x: string): number => t.get(cellKey(serieId, x)) ?? 0;

    return (
        <div className="h-full w-full min-h-[160px]">
            <ResponsiveHeatMap
                data={nivoData as never}
                margin={{ top: 60, right: 20, bottom: showMargins ? 60 : 20, left: 100 }}
                valueFormat={((v: number) => fmtNum(v)) as never}
                axisTop={{ tickSize: 5, tickPadding: 5, tickRotation: s.xTickRotation, legend: s.showXLegend ? (s.xAxisLabel || colColumn) : '', legendPosition: s.xLegendPosition, legendOffset: -50 }}
                axisLeft={{ tickSize: 5, tickPadding: 5, legend: s.showYLegend ? (s.yAxisLabel || rowColumn) : '', legendPosition: s.yLegendPosition, legendOffset: -80 }}
                colors={((cell: { serieId: string; data: { x: string } }) => heatColor(tAt(cell.serieId, cell.data.x))) as never}
                emptyColor="#1e293b"
                borderWidth={1}
                borderColor="#334155"
                labelTextColor={((cell: { serieId: string; data: { x: string } }) => heatLabelColor(tAt(cell.serieId, cell.data.x))) as never}
                hoverTarget="cell"
                theme={buildNivoTheme(style)}
            />
        </div>
    );
}

export default HeatmapPlusView;
