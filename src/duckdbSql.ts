// duckdbSql — DuckDB-flavoured SQL autocomplete for the SqlConsole editor.
//
// The PostgreSQL CodeMirror dialect already covers most of what DuckDB inherits
// (it's intentionally PG-compatible), so we use it for keywords. On top we add a
// curated source of DuckDB functions, types, extra keywords, and a few snippets
// (GROUP BY etc.). Combined with schema/keyword completion in SqlConsole.

import { completeFromList, snippetCompletion, type Completion, type CompletionSource } from '@codemirror/autocomplete';

// Aggregates + window functions (the ones people reach for in analysis).
const AGGREGATES = [
    'count', 'count_if', 'sum', 'avg', 'min', 'max', 'median', 'mode',
    'stddev', 'stddev_pop', 'stddev_samp', 'var_pop', 'var_samp', 'variance',
    'quantile', 'quantile_cont', 'quantile_disc', 'approx_count_distinct', 'approx_quantile',
    'arg_max', 'arg_min', 'first', 'last', 'product', 'bool_and', 'bool_or',
    'bit_and', 'bit_or', 'bit_xor', 'string_agg', 'list', 'array_agg', 'histogram',
    'corr', 'covar_pop', 'covar_samp', 'kurtosis', 'skewness', 'entropy',
    'row_number', 'rank', 'dense_rank', 'percent_rank', 'cume_dist', 'ntile',
    'lag', 'lead', 'first_value', 'last_value', 'nth_value',
];

// Scalar functions across string / date / math / list / json / conditional.
const SCALARS = [
    // string
    'length', 'len', 'lower', 'upper', 'trim', 'ltrim', 'rtrim', 'substring', 'substr',
    'concat', 'concat_ws', 'replace', 'reverse', 'repeat', 'lpad', 'rpad', 'left', 'right',
    'contains', 'starts_with', 'ends_with', 'position', 'split_part', 'string_split',
    'regexp_matches', 'regexp_replace', 'regexp_extract', 'regexp_full_match', 'regexp_split_to_array',
    'format', 'printf', 'md5', 'sha256', 'levenshtein', 'jaccard', 'ascii', 'chr',
    // date / time
    'now', 'current_date', 'current_timestamp', 'today', 'date_trunc', 'date_part', 'date_diff',
    'date_add', 'date_sub', 'age', 'strftime', 'strptime', 'epoch', 'epoch_ms', 'extract',
    'make_date', 'make_time', 'make_timestamp', 'last_day', 'dayname', 'monthname',
    'year', 'month', 'day', 'hour', 'minute', 'second', 'dayofweek', 'dayofyear', 'week', 'quarter', 'time_bucket',
    // math
    'abs', 'ceil', 'ceiling', 'floor', 'round', 'trunc', 'sign', 'mod', 'pow', 'power', 'sqrt', 'cbrt',
    'exp', 'ln', 'log', 'log2', 'log10', 'greatest', 'least', 'gcd', 'lcm', 'factorial', 'random',
    'pi', 'degrees', 'radians', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
    // conditional / null / cast
    'coalesce', 'ifnull', 'nullif', 'nvl', 'if', 'try_cast', 'cast', 'typeof',
    // list / struct / map / json
    'list_value', 'list_aggregate', 'list_distinct', 'list_sort', 'list_reverse', 'list_slice',
    'list_concat', 'list_contains', 'list_position', 'list_extract', 'list_transform', 'list_filter',
    'unnest', 'array_length', 'array_to_string', 'struct_pack', 'struct_extract',
    'map', 'map_keys', 'map_values', 'json_extract', 'json_extract_string', 'to_json', 'from_json',
    'json_array_length', 'json_keys', 'generate_series', 'range',
];

const TYPES = [
    'BOOLEAN', 'TINYINT', 'SMALLINT', 'INTEGER', 'BIGINT', 'HUGEINT',
    'UTINYINT', 'USMALLINT', 'UINTEGER', 'UBIGINT', 'FLOAT', 'REAL', 'DOUBLE',
    'DECIMAL', 'NUMERIC', 'VARCHAR', 'CHAR', 'TEXT', 'BLOB', 'BIT',
    'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'INTERVAL', 'UUID', 'JSON',
    'LIST', 'ARRAY', 'STRUCT', 'MAP', 'UNION', 'ENUM',
];

// DuckDB keywords/clauses that the PostgreSQL dialect doesn't know about.
const EXTRA_KEYWORDS = [
    'QUALIFY', 'EXCLUDE', 'PIVOT', 'UNPIVOT', 'ASOF', 'POSITIONAL', 'SEMI', 'ANTI',
    'SUMMARIZE', 'DISTINCT ON', 'GROUP BY ALL', 'ORDER BY ALL', 'USING SAMPLE',
];

function opts(labels: string[], type: string, boost = 0): Completion[] {
    return labels.map((label) => ({ label, type, boost }));
}

const SNIPPETS: Completion[] = [
    snippetCompletion('SELECT ${col}, count(*) AS n\nFROM data\nGROUP BY ${col}\nORDER BY n DESC', {
        label: 'group by count', type: 'snippet', detail: 'aggregate by column',
    }),
    snippetCompletion('SELECT *\nFROM data\nORDER BY ${col} DESC\nLIMIT 10', {
        label: 'top N', type: 'snippet', detail: 'order + limit',
    }),
    snippetCompletion('SELECT DISTINCT ${col}\nFROM data', {
        label: 'select distinct', type: 'snippet',
    }),
];

// duckdbCompletionSource completes DuckDB functions/types/keywords/snippets. It
// fires on word characters (so it merges with schema + keyword completion).
export const duckdbCompletionSource: CompletionSource = completeFromList([
    ...opts(AGGREGATES, 'function', 1), // boost aggregates slightly — common in analysis
    ...opts(SCALARS, 'function'),
    ...opts(TYPES, 'type'),
    ...opts(EXTRA_KEYWORDS, 'keyword'),
    ...SNIPPETS,
]);
