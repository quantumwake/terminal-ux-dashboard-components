// dataShape — pure client-side grouping/aggregation helpers used by the chart
// views when they aggregate records locally (the fallback path; the primary path
// is server/WASM SQL via sqlgen). Extracted from ui-enterprise's DataExplorer.

import type { Row } from './sqlgen';

export type AggFn = 'count' | 'distinct' | 'sum' | 'avg' | 'min' | 'max' | 'median';

// Group records by the string value of a column.
export const groupBy = (records: Row[], column: string): Record<string, Row[]> => {
    const groups: Record<string, Row[]> = {};
    for (const rec of records) {
        const key = String(rec[column] ?? '(null)');
        if (!groups[key]) groups[key] = [];
        groups[key].push(rec);
    }
    return groups;
};

// Aggregate a column over a set of records.
export const aggregate = (records: Row[], column: string, fn: AggFn | string): number => {
    const values = records.map((r) => r[column]).filter((v) => v != null);
    switch (fn) {
        case 'count': return records.length;
        case 'distinct': return new Set(values.map(String)).size;
        case 'sum': return values.reduce((a: number, b) => a + Number(b), 0);
        case 'avg': return values.length ? values.reduce((a: number, b) => a + Number(b), 0) / values.length : 0;
        case 'min': return Math.min(...values.map(Number));
        case 'max': return Math.max(...values.map(Number));
        case 'median': {
            const nums = values.map(Number).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
            if (!nums.length) return 0;
            const mid = Math.floor(nums.length / 2);
            return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
        }
        default: return records.length;
    }
};
