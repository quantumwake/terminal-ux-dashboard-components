import { useState, type KeyboardEvent } from 'react';
import { Play, Loader2, AlertCircle, Rows3 } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import type { Row } from '../sqlgen';

const DEFAULT_SQL = 'SELECT *\nFROM data\nLIMIT 100';

// A schema column descriptor surfaced as an insertable chip below the editor.
export interface SqlConsoleColumn {
    name: string;
    type?: string;
}

export interface SqlConsoleProps {
    // Optional schema columns rendered as click-to-insert chips. Defaults to none.
    columns?: SqlConsoleColumn[];
    // Optional state selector forwarded to runQuery (host may be multi-state).
    stateId?: string;
}

// Renders a single result cell value safely.
const renderCell = (v: unknown): string => {
    if (v == null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v);
};

interface QueryState {
    columns: string[];
    rows: Row[];
}

/**
 * SqlConsole — a HuggingFace-style read-only SQL editor over a state's full
 * dataset. The state's data is exposed (server-side DuckDB in studio, DuckDB-WASM
 * in the viewer) as a view named `data`; queries run against the entire dataset,
 * not a client sample.
 */
export function SqlConsole({ columns = [], stateId }: SqlConsoleProps) {
    const { theme, runQuery } = useDashboard();

    const [sql, setSql] = useState<string>(DEFAULT_SQL);
    const [result, setResult] = useState<QueryState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [running, setRunning] = useState<boolean>(false);

    const run = async (): Promise<void> => {
        if (running || !sql.trim()) return;
        setRunning(true);
        setError(null);
        try {
            const data = await runQuery(sql, stateId);
            setResult({ columns: data.columns || [], rows: data.rows || [] });
        } catch (err) {
            setResult(null);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setRunning(false);
        }
    };

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void run(); }
    };

    const resultColumns = result?.columns || [];

    return (
        <div className="flex flex-col h-full">
            {/* Editor */}
            <div className={`border-b ${theme.border} bg-midnight-elevated p-3 shrink-0`}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase text-midnight-text-muted font-mono">
                        SQL — table is <code className="text-midnight-accent">data</code>
                    </span>
                    <button onClick={() => void run()} disabled={running || !sql.trim()}
                        className={`flex items-center gap-1.5 px-3 py-1 border text-xs font-mono transition-colors ${
                            running ? 'border-midnight-border opacity-50' : 'border-midnight-accent text-midnight-accent hover:bg-midnight-accent/10'
                        }`}>
                        {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        Run <span className="opacity-60">⌘↵</span>
                    </button>
                </div>
                <textarea
                    value={sql}
                    onChange={e => setSql(e.target.value)}
                    onKeyDown={onKeyDown}
                    spellCheck={false}
                    rows={5}
                    className="w-full bg-midnight-surface border border-midnight-border px-3 py-2 text-sm font-mono outline-none text-midnight-text-body resize-y focus:border-midnight-accent transition-colors"
                    placeholder="SELECT ... FROM data"
                />
                {columns.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {columns.map(c => (
                            <button key={c.name} title={`Insert ${c.name}`}
                                onClick={() => setSql(s => `${s}${s.endsWith(' ') || s.endsWith('\n') || !s ? '' : ' '}${c.name}`)}
                                className="px-1.5 py-0.5 border border-midnight-border text-[11px] font-mono text-midnight-text-muted hover:bg-midnight-raised transition-colors">
                                {c.name}<span className="opacity-50 ml-1">{c.type}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Result meta */}
            {(result || error) && (
                <div className={`flex items-center gap-4 px-3 py-1.5 border-b ${theme.border} text-xs font-mono shrink-0 ${error ? 'text-red-400' : 'text-midnight-text-muted'}`}>
                    {error ? (
                        <span className="flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> {error}</span>
                    ) : (
                        <span className="flex items-center gap-1"><Rows3 className="w-3.5 h-3.5" /> {result!.rows.length.toLocaleString()} rows</span>
                    )}
                </div>
            )}

            {/* Results table */}
            <div className="flex-1 min-h-0 overflow-auto">
                {result && !error && resultColumns.length > 0 ? (
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-midnight-elevated">
                            <tr>
                                {resultColumns.map(c => (
                                    <th key={c} className="px-2 py-1.5 text-left text-midnight-text-muted font-mono border-b border-midnight-border whitespace-nowrap">
                                        {c}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {result.rows.map((row, i) => (
                                <tr key={i} className="border-b border-dashed border-midnight-border hover:bg-midnight-raised">
                                    {resultColumns.map(c => (
                                        <td key={c} className="px-2 py-1 text-midnight-text-body font-mono truncate max-w-[300px]">
                                            {renderCell(row[c])}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : !error && (
                    <div className="flex items-center justify-center h-full text-sm text-midnight-text-muted">
                        Write a query and press <span className="text-midnight-accent mx-1">Run</span> (⌘↵)
                    </div>
                )}
            </div>
        </div>
    );
}

export default SqlConsole;
