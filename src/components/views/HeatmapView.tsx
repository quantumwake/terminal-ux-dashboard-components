import { useMemo } from 'react';
import { ResponsiveHeatMap } from '@nivo/heatmap';

import { groupBy, aggregate } from '../../dataShape';
import { buildNivoTheme, withStyleDefaults } from '../../chartStyle';
import type { ChartStyle } from '../../chartStyle';
import type { Row } from '../../sqlgen';

const MAX_AXIS = 30;

export interface HeatmapSerie {
    id: string;
    data: { x: string; y: number }[];
}

type AxisOrder = 'alpha' | 'total-asc' | 'total-desc';

// Reduce a list of cell values to a single marginal (row/column total).
const reduceVals = (vals: number[], agg: string): number => {
    const nums = vals.map(Number).filter((v) => !Number.isNaN(v));
    switch (agg) {
        case 'avg': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        case 'min': return nums.length ? Math.min(...nums) : 0;
        case 'max': return nums.length ? Math.max(...nums) : 0;
        case 'count': return vals.length;
        case 'sum':
        default: return nums.reduce((a, b) => a + b, 0);
    }
};

const fmtNum = (n: number): string => {
    if (typeof n !== 'number' || Number.isNaN(n)) return '';
    return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

// Order a list of ids: alphabetical, or by a marginal value (asc/desc).
const orderIds = (ids: string[], marginals: Record<string, number>, order: AxisOrder): string[] => {
    const sorted = [...ids];
    if (order === 'total-desc') sorted.sort((a, b) => (marginals[b] || 0) - (marginals[a] || 0));
    else if (order === 'total-asc') sorted.sort((a, b) => (marginals[a] || 0) - (marginals[b] || 0));
    else sorted.sort();
    return sorted;
};

export interface HeatmapViewProps {
    records?: Row[];
    rowColumn: string;
    colColumn: string;
    valueColumn?: string;
    aggFn?: string;
    data?: HeatmapSerie[];
    rowOrder?: AxisOrder;
    colOrder?: AxisOrder;
    marginAgg?: string;
    showTotals?: boolean;
    style?: Partial<ChartStyle>;
}

/**
 * HeatmapView builds a cross-tabulation heatmap (confusion / pairwise matrix).
 * rowColumn values become rows, colColumn values become columns; the cell value
 * is aggFn over valueColumn (or a record count when no valueColumn).
 */
export function HeatmapView({
    records, rowColumn, colColumn, valueColumn, aggFn = 'count', data: presetData,
    rowOrder = 'alpha', colOrder = 'alpha', marginAgg = 'sum', showTotals = false, style,
}: HeatmapViewProps) {
    const s = withStyleDefaults(style);

    // 1. Build the base (unordered, uncapped) series from records or preset data.
    const base = useMemo<HeatmapSerie[]>(() => {
        if (presetData) return presetData;
        if (!records) return [];
        const rowGroups = groupBy(records, rowColumn);
        const colValues = [...new Set(records.map((r) => String(r[colColumn] ?? '(null)')))];
        const fn = valueColumn ? aggFn : 'count';
        return Object.keys(rowGroups).map((rowVal) => ({
            id: rowVal,
            data: colValues.map((colVal) => {
                const cellRecords = rowGroups[rowVal]?.filter((r) => String(r[colColumn] ?? '(null)') === colVal) || [];
                return { x: colVal, y: cellRecords.length && valueColumn ? aggregate(cellRecords, valueColumn, fn) : cellRecords.length };
            }),
        }));
    }, [records, rowColumn, colColumn, valueColumn, aggFn, presetData]);

    // 2. Order + cap rows and columns by marginal totals, and compute the totals.
    const { data, rowTotals, colTotals } = useMemo(() => {
        if (!base.length) return { data: [] as HeatmapSerie[], rowTotals: {} as Record<string, number>, colTotals: {} as Record<string, number> };

        const cell: Record<string, Record<string, number>> = {};
        const colIdSet: string[] = [];
        for (const row of base) {
            cell[row.id] = {};
            for (const d of row.data) {
                cell[row.id][d.x] = Number(d.y) || 0;
                if (!colIdSet.includes(d.x)) colIdSet.push(d.x);
            }
        }
        const rowIds = base.map((r) => r.id);

        const rowMarg: Record<string, number> = {};
        rowIds.forEach((rid) => { rowMarg[rid] = reduceVals(colIdSet.map((cid) => cell[rid][cid] ?? 0), marginAgg); });
        const colMarg: Record<string, number> = {};
        colIdSet.forEach((cid) => { colMarg[cid] = reduceVals(rowIds.map((rid) => cell[rid][cid] ?? 0), marginAgg); });

        const orderedRows = orderIds(rowIds, rowMarg, rowOrder).slice(0, MAX_AXIS);
        const orderedCols = orderIds(colIdSet, colMarg, colOrder).slice(0, MAX_AXIS);

        const shaped: HeatmapSerie[] = orderedRows.map((rid) => ({
            id: rid,
            data: orderedCols.map((cid) => ({ x: cid, y: cell[rid][cid] ?? 0 })),
        }));
        return { data: shaped, rowTotals: rowMarg, colTotals: colMarg };
    }, [base, rowOrder, colOrder, marginAgg]);

    if (!data.length || !data[0].data.length) {
        return <div className="p-8 text-center text-midnight-text-muted">Not enough distinct values for a heatmap</div>;
    }

    const margin = showTotals
        ? { top: 60, right: 70, bottom: 60, left: 100 }
        : { top: 60, right: 20, bottom: 20, left: 100 };

    return (
        <div className="h-full min-h-[400px]">
            <ResponsiveHeatMap
                data={data as never}
                margin={margin}
                axisTop={{ tickSize: 5, tickPadding: 5, tickRotation: -35, legend: colColumn, legendPosition: s.xLegendPosition, legendOffset: -50 }}
                axisLeft={{ tickSize: 5, tickPadding: 5, legend: rowColumn, legendPosition: s.yLegendPosition, legendOffset: -80 }}
                axisRight={showTotals ? { tickSize: 5, tickPadding: 5, format: (id) => fmtNum(rowTotals[id as string]), legend: `${marginAgg} ▸`, legendOffset: 60 } : null}
                axisBottom={showTotals ? { tickSize: 5, tickPadding: 5, tickRotation: -35, format: (id) => fmtNum(colTotals[id as string]) } : null}
                colors={{ type: 'sequential', scheme: 'blue_green', minValue: 0 }}
                emptyColor="#1e293b"
                borderWidth={1}
                borderColor="#334155"
                labelTextColor={{ from: 'color', modifiers: [['darker', 3]] } as never}
                hoverTarget="cell"
                theme={buildNivoTheme(style)}
            />
        </div>
    );
}

export default HeatmapView;
