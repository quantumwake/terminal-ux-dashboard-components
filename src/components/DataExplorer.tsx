// DataExplorer — the host-agnostic container for the statefs Data Explorer.
//
// This is the most store-coupled component in the studio. Here it reads NO
// store: all data/state arrives via props, and every studio-only verb
// (save/load/search/delete/analyze/refine/edit) is an OPTIONAL injected
// capability consumed through useDashboard()/useCapabilities(). When a
// capability is absent its affordance is hidden and the published viewer
// renders read-only.
//
// State ownership:
//   - data/state-in (records, columns, states, profile, dashboard,
//     savedDashboards, loading flags, active selection) → PROPS (the host owns
//     fetching/selection and the zustand store).
//   - actions (save/list/search/load/delete/analyze/refine) → injected caps.
//   - purely-local UI (active tab, save-name input, showSaved toggle,
//     fullscreen) → useState.

import { useState } from 'react';
import {
    Database, BarChart3, Rows3,
    ChevronDown, Sparkles, Send, Loader2, RefreshCw, Save, FolderOpen, Trash2, Terminal, Maximize2, Minimize2,
} from 'lucide-react';

import { DashboardRenderer } from './DashboardRenderer';
import { ChartBuilder } from './ChartBuilder';
import { SqlConsole } from './SqlConsole';
import { useDashboard, useCapabilities, type DashboardTheme, type SavedDashboard } from '../context/DashboardContext';
import type { Row } from '../sqlgen';

// ─── Domain types (host-supplied shapes) ──────────────────────────

/** A dataset column descriptor: name + DuckDB-ish type tag. */
export interface Column {
    name: string;
    type: string;
}

/** A selectable state (dataset) in the statefs catalog. */
export interface StatefsState {
    state_id: string;
    row_count?: number;
    [key: string]: unknown;
}

/** Per-column profile statistics shown in the ProfileSummary table. */
export interface ProfileColumn {
    name: string;
    type: string;
    distinct_count?: number;
    null_count?: number;
    avg_length?: number;
    min_length?: number;
    max_length?: number;
    min?: number | string;
    max?: number | string;
    top_values?: string[];
    [key: string]: unknown;
}

/** Dataset profile (row/column counts + per-column stats). */
export interface DatasetProfile {
    total_rows?: number;
    columns?: ProfileColumn[];
    [key: string]: unknown;
}

/** A single dashboard panel descriptor. */
export interface DashboardPanel {
    id: string;
    type: string;
    title?: string;
    width?: number;
    height?: number;
    config?: Record<string, unknown>;
    [key: string]: unknown;
}

/** A dashboard config: AI insights + a grid of panels. */
export interface Dashboard {
    insights?: string;
    panels?: DashboardPanel[];
    [key: string]: unknown;
}

type Mode = 'dashboard' | 'builder' | 'sql';

// ─── Profile Summary ──────────────────────────────────────────────

interface ProfileSummaryProps {
    profile?: DatasetProfile | null;
    theme: DashboardTheme;
}

function ProfileSummary({ profile, theme }: ProfileSummaryProps) {
    const [open, setOpen] = useState(false);
    if (!profile) return null;

    return (
        <div className={`border ${theme.border} bg-midnight-surface mb-3`}>
            <button onClick={() => setOpen(!open)}
                className={`w-full px-3 py-2 bg-midnight-elevated flex items-center gap-2 hover:bg-midnight-raised transition-colors text-left`}>
                <ChevronDown className={`w-4 h-4 transition-transform ${open ? '' : '-rotate-90'}`} />
                <BarChart3 className="w-4 h-4" />
                <span className={`text-sm font-mono ${theme.text}`}>{profile.total_rows?.toLocaleString()} rows, {profile.columns?.length} columns</span>
            </button>
            {open && (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead><tr className={`border-b ${theme.border} bg-midnight-elevated`}>
                            {['Column', 'Type', 'Distinct', 'Nulls', 'Stats', 'Top Values'].map(h => (
                                <th key={h} className={`px-3 py-1 text-left uppercase ${theme.textSecondary}`}>{h}</th>
                            ))}
                        </tr></thead>
                        <tbody>{profile.columns?.map(col => (
                            <tr key={col.name} className={`border-b border-dashed ${theme.border}`}>
                                <td className={`px-3 py-1 font-mono ${theme.text}`}>{col.name}</td>
                                <td className={`px-3 py-1 ${theme.textSecondary}`}>{col.type}</td>
                                <td className={`px-3 py-1 text-right ${theme.textSecondary}`}>{col.distinct_count}</td>
                                <td className={`px-3 py-1 text-right ${theme.textSecondary}`}>{col.null_count}</td>
                                <td className={`px-3 py-1 ${theme.textSecondary}`}>
                                    {col.type === 'string' && (col.avg_length ?? 0) > 0 && `len: ${col.min_length}–${col.max_length}`}
                                    {(col.type === 'int64' || col.type === 'float64') && col.min !== undefined && `${col.min}–${col.max}`}
                                </td>
                                <td className={`px-3 py-1 ${theme.textSecondary} max-w-[200px] truncate`}>{col.top_values?.slice(0, 3).join(', ')}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── State Selector ───────────────────────────────────────────────

interface StateSelectorProps {
    states: StatefsState[];
    activeStateId?: string | null;
    onSelect: (id: string) => void;
    theme: DashboardTheme;
}

function StateSelector({ states, activeStateId, onSelect, theme }: StateSelectorProps) {
    return (
        <div className={`border ${theme.border} bg-midnight-surface mb-3`}>
            <div className={`px-3 py-2 bg-midnight-elevated flex items-center gap-2`}>
                <Database className="w-4 h-4" />
                <span className={`text-sm font-mono ${theme.text}`}>States ({states.length})</span>
            </div>
            <div className="max-h-[140px] overflow-y-auto">
                {states.map(s => (
                    <div key={s.state_id} onClick={() => onSelect(s.state_id)}
                        className={`px-3 py-1.5 cursor-pointer flex justify-between items-center border-b border-dashed ${theme.border} ${s.state_id === activeStateId ? 'bg-midnight-raised' : ''} hover:bg-midnight-raised transition-colors`}>
                        <span className={`font-mono text-xs ${theme.text} truncate`}>{s.state_id}</span>
                        <span className={`text-xs ${theme.textSecondary} ml-2 shrink-0`}>{s.row_count?.toLocaleString()} rows</span>
                    </div>
                ))}
                {!states.length && <div className={`px-3 py-4 text-center text-sm ${theme.textSecondary}`}>No states found</div>}
            </div>
        </div>
    );
}

// ─── Chat Input ───────────────────────────────────────────────────

interface ChatInputProps {
    onSend: (text: string) => void;
    loading: boolean;
    theme: DashboardTheme;
}

function ChatInput({ onSend, loading, theme }: ChatInputProps) {
    const [text, setText] = useState('');
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim() || loading) return;
        onSend(text.trim());
        setText('');
    };
    return (
        <form onSubmit={handleSubmit} className={`flex gap-2 px-3 py-2 border-t ${theme.border} bg-midnight-elevated shrink-0`}>
            <input value={text} onChange={e => setText(e.target.value)}
                placeholder="Ask AI to refine the dashboard..." disabled={loading}
                className="flex-1 bg-midnight-surface border border-midnight-border px-3 py-1.5 text-sm outline-none text-midnight-text-body placeholder:text-midnight-text-muted" />
            <button type="submit" disabled={loading || !text.trim()}
                className={`px-3 py-1.5 border border-midnight-border text-sm flex items-center gap-1 ${loading ? 'opacity-50' : 'hover:bg-midnight-raised'} transition-colors`}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
        </form>
    );
}

// ─── Mode Tab Button ──────────────────────────────────────────────

interface ModeTabProps {
    active: boolean;
    onClick: () => void;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
}

function ModeTab({ active, onClick, icon: Icon, label }: ModeTabProps) {
    return (
        <button onClick={onClick}
            className={`px-3 py-1 text-xs font-mono border transition-colors ${
                active ? 'border-midnight-accent text-midnight-accent bg-midnight-accent/10' : 'border-midnight-border text-midnight-text-muted hover:bg-midnight-raised'
            }`}>
            <Icon className="w-3 h-3 inline mr-1" />{label}
        </button>
    );
}

// ─── Main ─────────────────────────────────────────────────────────

export interface DataExplorerProps {
    /** All records for the active state (viz/builder source). Empty when not loaded. */
    records: Row[];
    /** Active state's columns ({ name, type }), from schema or profile. */
    columns: Column[];
    /** The catalog of selectable states. */
    states?: StatefsState[];
    /** Currently-selected state id (null = none selected). */
    activeStateId?: string | null;
    /** Profile (stats) of the active state. */
    profile?: DatasetProfile | null;
    /** Active dashboard config (null = not yet generated). */
    dashboard?: Dashboard | null;
    /** Persisted id of the active dashboard (null = unsaved). Drives Save vs Save-as. */
    dashboardId?: string | null;
    /** Saved dashboards listed for the current project (shown in the saved panel). */
    savedDashboards?: SavedDashboard[];
    /** True while the catalog/profile/records are loading. */
    loading?: boolean;
    /** True while the AI is generating/refining the dashboard. */
    analyzing?: boolean;

    /** Select a state (host fetches its profile/records). */
    onSelectState: (id: string) => void;
    /** Refresh the states catalog. */
    onRefreshStates?: () => void;
}

export function DataExplorer({
    records,
    columns,
    states = [],
    activeStateId,
    profile,
    dashboard,
    dashboardId,
    savedDashboards = [],
    loading = false,
    analyzing = false,
    onSelectState,
    onRefreshStates,
}: DataExplorerProps) {
    const { theme, saveDashboard, listDashboards, searchDashboards, loadDashboard, deleteDashboard, analyzeDataset, refineDashboard } = useDashboard();
    const caps = useCapabilities();

    const [mode, setMode] = useState<Mode>('dashboard');
    const [fullscreen, setFullscreen] = useState(false);
    const [showSaved, setShowSaved] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // The save/load/list panel is only meaningful if the host can persist.
    const showPersistence = caps.canSave || caps.canList || caps.canLoad || caps.canDelete;

    const handleAutoAnalyze = () => {
        setMode('dashboard');
        analyzeDataset?.();
    };

    const handleSave = async () => {
        if (!caps.canSave) return;
        if (showSaveInput && saveName.trim()) {
            await saveDashboard?.(saveName.trim());
            setShowSaveInput(false);
            setSaveName('');
        } else if (dashboardId) {
            await saveDashboard?.(); // update existing
        } else {
            setShowSaveInput(true);
        }
    };

    const handleOpenSaved = () => {
        listDashboards?.();
        setShowSaved(!showSaved);
    };

    const handleSearch = (q: string) => {
        setSearchQuery(q);
        searchDashboards?.(q);
    };

    return (
        <div className={`flex flex-col ${theme.bg} ${theme.text} p-4 ${fullscreen ? 'fixed inset-0 z-50' : 'h-full'}`}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 shrink-0">
                <Rows3 className="w-5 h-5" />
                <h1 className="text-lg font-mono">Data Explorer</h1>
                {(loading || analyzing) && <Loader2 className="w-4 h-4 animate-spin text-midnight-text-muted ml-2" />}
                {onRefreshStates && (
                    <button onClick={onRefreshStates} className="ml-auto p-1 hover:bg-midnight-raised transition-colors">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                )}
                <button onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Exit full screen' : 'Full screen'}
                    className={`p-1 hover:bg-midnight-raised transition-colors ${onRefreshStates ? '' : 'ml-auto'}`}>
                    {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
            </div>

            {/* State selector */}
            <div className="shrink-0">
                <StateSelector states={states} activeStateId={activeStateId} onSelect={onSelectState} theme={theme} />
            </div>

            {activeStateId && (
                <>
                    {/* Profile + controls */}
                    <div className="flex items-start gap-3 mb-3 shrink-0">
                        <div className="flex-1"><ProfileSummary profile={profile} theme={theme} /></div>
                        {caps.canAnalyze && (
                            <button onClick={handleAutoAnalyze} disabled={analyzing || !profile}
                                className={`shrink-0 flex items-center gap-2 px-4 py-2 border text-sm font-mono transition-colors ${
                                    analyzing ? 'border-midnight-border opacity-50' : 'border-midnight-accent text-midnight-accent hover:bg-midnight-accent/10'
                                }`}>
                                {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                {analyzing ? 'Analyzing...' : 'Auto-Analyze'}
                            </button>
                        )}
                    </div>

                    {/* Mode tabs + save/load */}
                    <div className="flex items-center gap-1 mb-3 shrink-0">
                        <ModeTab active={mode === 'dashboard'} onClick={() => setMode('dashboard')} icon={Sparkles} label="Dashboard" />
                        <ModeTab active={mode === 'builder'} onClick={() => setMode('builder')} icon={BarChart3} label="Chart Builder" />
                        <ModeTab active={mode === 'sql'} onClick={() => setMode('sql')} icon={Terminal} label="SQL" />

                        {showPersistence && (
                            <div className="flex items-center gap-1 ml-auto">
                                {caps.canSave && showSaveInput && (
                                    <input value={saveName} onChange={e => setSaveName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') void handleSave(); }}
                                        placeholder="Dashboard name..."
                                        className="bg-midnight-surface border border-midnight-border px-2 py-1 text-xs outline-none text-midnight-text-body w-40" autoFocus />
                                )}
                                {caps.canSave && dashboard && (
                                    <button onClick={() => void handleSave()} title={dashboardId ? 'Save' : 'Save as...'}
                                        className="p-1 border border-midnight-border text-midnight-text-muted hover:bg-midnight-raised transition-colors">
                                        <Save className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                {(caps.canList || caps.canLoad || caps.canDelete) && (
                                    <button onClick={handleOpenSaved} title="Saved dashboards"
                                        className={`p-1 border transition-colors ${showSaved ? 'border-midnight-accent text-midnight-accent' : 'border-midnight-border text-midnight-text-muted hover:bg-midnight-raised'}`}>
                                        <FolderOpen className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Saved dashboards panel */}
                    {showSaved && (caps.canList || caps.canLoad || caps.canDelete) && (
                        <div className={`border ${theme.border} bg-midnight-surface mb-3 shrink-0 max-h-[200px] overflow-y-auto`}>
                            {caps.canSearch && (
                                <input value={searchQuery} onChange={e => handleSearch(e.target.value)}
                                    placeholder="Search dashboards..."
                                    className="w-full bg-midnight-surface border-b border-midnight-border px-3 py-1.5 text-xs outline-none text-midnight-text-body placeholder:text-midnight-text-muted sticky top-0" />
                            )}
                            {savedDashboards.length === 0 ? (
                                <div className="px-3 py-3 text-center text-xs text-midnight-text-muted">No saved dashboards</div>
                            ) : savedDashboards.map(d => (
                                <div key={d.id} className={`flex items-center justify-between px-3 py-1.5 border-b border-dashed ${theme.border} hover:bg-midnight-raised transition-colors`}>
                                    {caps.canLoad ? (
                                        <button onClick={() => { void loadDashboard?.(d.id); setShowSaved(false); setMode('dashboard'); }}
                                            className="flex-1 text-left text-xs font-mono text-midnight-text-body truncate">
                                            {d.name}
                                        </button>
                                    ) : (
                                        <span className="flex-1 text-xs font-mono text-midnight-text-body truncate">{d.name}</span>
                                    )}
                                    {typeof d.updated_at === 'string' && (
                                        <span className="text-xs text-midnight-text-muted mx-2">{new Date(d.updated_at).toLocaleDateString()}</span>
                                    )}
                                    {caps.canDelete && (
                                        <button onClick={() => void deleteDashboard?.(d.id)}
                                            className="p-0.5 text-midnight-text-muted hover:text-red-400 transition-colors">
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Content */}
                    <div className={`border ${theme.border} bg-midnight-surface flex-1 flex flex-col min-h-0`}>
                        {mode === 'sql' ? (
                            <SqlConsole columns={columns} stateId={activeStateId ?? undefined} />
                        ) : mode === 'builder' ? (
                            <ChartBuilder records={records} columns={columns} stateId={activeStateId ?? undefined} />
                        ) : (
                            <>
                                <div className="flex-1 min-h-0 overflow-auto">
                                    {dashboard ? (
                                        <DashboardRenderer dashboard={dashboard} records={records} columns={columns} />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full gap-4 text-midnight-text-muted">
                                            <Sparkles className="w-8 h-8" />
                                            <p className="text-sm">
                                                {caps.canAnalyze
                                                    ? <>Click <strong>Auto-Analyze</strong> to generate an AI dashboard</>
                                                    : 'No dashboard to display'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                                {dashboard && caps.canRefine && refineDashboard && (
                                    <ChatInput onSend={refineDashboard} loading={analyzing} theme={theme} />
                                )}
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export default DataExplorer;
