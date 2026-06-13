// sqlgen — generate DuckDB SQL from a visual chart config, and shape the
// resulting rows into the data shape each Nivo view expects.
//
// The query runner exposes a state's full dataset as a view named `data`. The
// chart builder generates SQL against `data` (exact over the whole dataset)
// instead of aggregating a client-side sample. The SAME SQL runs server-side in
// the studio (statefs-node /query) or client-side in the viewer (DuckDB-WASM).
//
// Generated queries alias their output columns to stable names (g, v, m0…, x,
// y, r, c) so the shaping functions don't depend on user column names.

export type ChartType = 'bar' | 'grouped-bar' | 'pie' | 'line' | 'scatter' | 'heatmap' | 'heatmap-plus';

export interface ChartField {
    name: string;
    agg?: string;
}

export interface ChartFilter {
    column: string;
    op: string;
    value?: string | null;
}

export interface ChartConfig {
    chartType: ChartType;
    xFields?: ChartField[];
    yFields?: ChartField[];
    valueField?: ChartField | null;
    filters?: ChartFilter[];
    // heatmap-plus only: the two independent cell stats (label vs color) and an
    // optional block field for block-scope coloring.
    labelStat?: string;
    colorStat?: string;
    blockField?: string;
}

export type Row = Record<string, unknown>;

const TABLE = 'data';
const MAX_GROUPS = 50;
const MAX_POINTS = 1000;

// Quote a SQL identifier (column name) for DuckDB.
export const qIdent = (name: string): string => `"${String(name).replace(/"/g, '""')}"`;

// Render a value as a SQL literal: numeric stays raw, everything else is a
// single-quoted, escaped string.
export const qLit = (v: unknown): string => {
    const s = String(v);
    if (/^-?\d+(\.\d+)?$/.test(s)) return s;
    if (s === 'true' || s === 'false') return s;
    return `'${s.replace(/'/g, "''")}'`;
};

// statefs stores every column as VARCHAR (state values are JSON strings), so
// numeric aggregations must coerce the column to a number first: SUM/AVG hard
// error on VARCHAR ("No function matches sum(VARCHAR)"), and MIN/MAX would sort
// lexically ("9" > "10"). TRY_CAST is used (not a bare ::DECIMAL / CAST) so a
// non-numeric or empty cell yields NULL — which the aggregate skips — instead of
// failing the whole query. DECIMAL keeps SUM/AVG exact (no float drift).
const qNum = (col: string): string => `TRY_CAST(${qIdent(col)} AS DECIMAL(18,6))`;

// Aggregate expression. count -> COUNT(*); distinct -> COUNT(DISTINCT col); else FN(col).
export const aggExpr = (agg: string | undefined, col?: string): string => {
    const fn = (agg || 'count').toLowerCase();
    if (fn === 'count') return 'COUNT(*)';
    if (!col) return 'COUNT(*)';
    const c = qIdent(col);
    switch (fn) {
        case 'distinct': return `COUNT(DISTINCT ${c})`;
        case 'sum': return `SUM(${qNum(col)})`;
        case 'avg': return `AVG(${qNum(col)})`;
        case 'min': return `MIN(${qNum(col)})`;
        case 'max': return `MAX(${qNum(col)})`;
        case 'median': return `MEDIAN(${qNum(col)})`;
        default: return 'COUNT(*)';
    }
};

// Compile structured filter rows into a WHERE clause (filters AND-ed).
// Each filter: { column, op, value }. Returns '' or ' WHERE ...'.
export const compileWhere = (filters?: ChartFilter[]): string => {
    const conds = (filters || [])
        .filter((f) => f && f.column && f.op)
        .map((f): string | null => {
            const c = qIdent(f.column);
            switch (f.op) {
                case 'IS NULL': return `${c} IS NULL`;
                case 'IS NOT NULL': return `${c} IS NOT NULL`;
                case 'IN':
                case 'NOT IN': {
                    const items = String(f.value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
                    if (!items.length) return null;
                    return `${c} ${f.op} (${items.map(qLit).join(', ')})`;
                }
                case 'BETWEEN': {
                    const parts = String(f.value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
                    if (parts.length !== 2) return null;
                    return `${c} BETWEEN ${qLit(parts[0])} AND ${qLit(parts[1])}`;
                }
                case 'LIKE': return `${c} LIKE ${qLit(f.value)}`;
                default: // = != < <= > >=
                    if (f.value == null || f.value === '') return null;
                    return `${c} ${f.op} ${qLit(f.value)}`;
            }
        })
        .filter((x): x is string => Boolean(x));
    return conds.length ? ` WHERE ${conds.join(' AND ')}` : '';
};

// Build a chart SQL query from the builder config. Returns a SQL string, or
// null if the config is incomplete for the chart type.
export const buildChartSQL = ({
    chartType,
    xFields = [],
    yFields = [],
    valueField = null,
    filters = [],
    labelStat,
    colorStat,
    blockField,
}: ChartConfig): string | null => {
    const where = compileWhere(filters);
    const x = xFields[0]?.name;
    const y = yFields[0]?.name;

    switch (chartType) {
        case 'bar': {
            if (!x) return null;
            const metric = aggExpr(yFields[0]?.agg || 'count', yFields[0]?.name);
            return `SELECT ${qIdent(x)} AS g, ${metric} AS v FROM ${TABLE}${where} GROUP BY 1 ORDER BY 2 DESC LIMIT ${MAX_GROUPS}`;
        }
        case 'grouped-bar': {
            if (!x || !yFields.length) return null;
            const metrics = yFields.map((yf, i) => `${aggExpr(yf.agg || 'count', yf.name)} AS m${i}`);
            return `SELECT ${qIdent(x)} AS g, ${metrics.join(', ')} FROM ${TABLE}${where} GROUP BY 1 ORDER BY 2 DESC LIMIT ${MAX_GROUPS}`;
        }
        case 'pie': {
            if (!x) return null;
            return `SELECT ${qIdent(x)} AS g, COUNT(*) AS v FROM ${TABLE}${where} GROUP BY 1 ORDER BY 2 DESC LIMIT ${MAX_GROUPS}`;
        }
        case 'line': {
            if (!x || !y) return null;
            const w = where ? `${where} AND ${qIdent(x)} IS NOT NULL AND ${qIdent(y)} IS NOT NULL`
                : ` WHERE ${qIdent(x)} IS NOT NULL AND ${qIdent(y)} IS NOT NULL`;
            return `SELECT ${qIdent(x)} AS x, ${qIdent(y)} AS y FROM ${TABLE}${w} ORDER BY 1 LIMIT 500`;
        }
        case 'scatter': {
            if (!x || !y) return null;
            // Scatter is numeric-on-numeric. statefs stores VARCHAR, so coerce
            // both axes with TRY_CAST and keep only rows where BOTH coerce to a
            // number — non-numeric/empty cells become NULL and are filtered out
            // (instead of silently plotting at 0). DOUBLE (not the aggregate
            // DECIMAL) avoids fixed-scale clamping of raw point values.
            const nx = `TRY_CAST(${qIdent(x)} AS DOUBLE)`, ny = `TRY_CAST(${qIdent(y)} AS DOUBLE)`;
            const extra = `${nx} IS NOT NULL AND ${ny} IS NOT NULL`;
            const w = where ? `${where} AND ${extra}` : ` WHERE ${extra}`;
            return `SELECT ${nx} AS x, ${ny} AS y FROM ${TABLE}${w} LIMIT ${MAX_POINTS}`;
        }
        case 'heatmap': {
            if (!x || !y) return null;
            const metric = valueField ? aggExpr(valueField.agg || 'count', valueField.name) : 'COUNT(*)';
            return `SELECT ${qIdent(x)} AS r, ${qIdent(y)} AS c, ${metric} AS v FROM ${TABLE}${where} GROUP BY 1, 2`;
        }
        case 'heatmap-plus': {
            if (!x || !y) return null;
            const col = valueField?.name;
            // Two independent stats per cell (label vs color); no value column ⇒
            // both are a row count. GROUPING SETS computes the body cells AND the
            // row/col/grand margins in ONE pass — every margin aggregated over the
            // UNDERLYING rows (so median/avg margins stay correct, never a stat of
            // already-aggregated cells). GROUPING() flags which set each row is.
            const lv = col ? aggExpr(labelStat || valueField?.agg || 'count', col) : 'COUNT(*)';
            const cv = col ? aggExpr(colorStat || labelStat || valueField?.agg || 'count', col) : 'COUNT(*)';
            const blockSel = blockField ? `, ANY_VALUE(${qIdent(blockField)}) AS block` : '';
            return `SELECT ${qIdent(x)} AS r, ${qIdent(y)} AS c, ${lv} AS lv, ${cv} AS cv${blockSel}, `
                + `GROUPING(${qIdent(x)}) AS gr, GROUPING(${qIdent(y)}) AS gc `
                + `FROM ${TABLE}${where} `
                + `GROUP BY GROUPING SETS ((${qIdent(x)}, ${qIdent(y)}), (${qIdent(x)}), (${qIdent(y)}), ())`;
        }
        default:
            return null;
    }
};

// Shape SQL result rows into the data structure each Nivo view consumes.
export const shapeChartData = (
    chartType: ChartType,
    rows: Row[],
    { yFields = [] }: { yFields?: ChartField[] } = {},
): unknown => {
    rows = rows || [];
    switch (chartType) {
        case 'bar':
            return rows.map((r) => ({ group: String(r.g ?? '(null)'), value: Number(r.v) || 0 }));
        case 'grouped-bar': {
            const keys = yFields.map((yf) => `${yf.agg || 'count'}(${yf.name})`);
            const data = rows.map((r) => {
                const out: Record<string, string | number> = { group: String(r.g ?? '(null)') };
                yFields.forEach((_, i) => { out[keys[i]] = Number(r[`m${i}`]) || 0; });
                return out;
            });
            return { data, keys };
        }
        case 'pie':
            return rows.map((r) => ({ id: String(r.g ?? '(null)'), label: String(r.g ?? '(null)'), value: Number(r.v) || 0 }));
        case 'line':
            return [{ id: 'series', data: rows.map((r) => ({ x: String(r.x), y: Number(r.y) || 0 })) }];
        case 'scatter':
            // Keep only finite numeric points (the SQL already coerces + filters,
            // but guard the client path too — never collapse bad cells onto 0).
            return [{
                id: 'points',
                data: rows
                    .map((r) => ({ x: Number(r.x), y: Number(r.y) }))
                    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
            }];
        case 'heatmap': {
            // Pivot flat (r, c, v) rows into the Nivo heatmap series shape. Order
            // and capping are applied downstream by HeatmapView (which also draws
            // the marginal totals), so return the full set here.
            const rowKeys: string[] = [];
            const colKeys: string[] = [];
            const cell: Record<string, Record<string, number>> = {};
            for (const r of rows) {
                const rk = String(r.r ?? '(null)');
                const ck = String(r.c ?? '(null)');
                if (!cell[rk]) { cell[rk] = {}; rowKeys.push(rk); }
                if (!colKeys.includes(ck)) colKeys.push(ck);
                cell[rk][ck] = Number(r.v) || 0;
            }
            return rowKeys.map((rk) => ({
                id: rk,
                data: colKeys.map((ck) => ({ x: ck, y: cell[rk][ck] || 0 })),
            }));
        }
        case 'heatmap-plus': {
            // Flat (r, c, lv, cv, gr, gc, block) rows — body cells plus margin
            // rows (gr/gc flag which). HeatmapPlusView assembles the matrix,
            // ordering, margins and coloring; here just coerce types. r/c stay
            // null on margin rows (the view keys margins by the non-grouped axis).
            return rows.map((r) => ({
                r: r.r == null ? null : String(r.r),
                c: r.c == null ? null : String(r.c),
                lv: Number(r.lv) || 0,
                cv: Number(r.cv) || 0,
                gr: Number(r.gr) || 0,
                gc: Number(r.gc) || 0,
                ...(r.block != null ? { block: String(r.block) } : {}),
            }));
        }
        default:
            return [];
    }
};
