// DashboardContext — the capability-injection contract for the dashboard
// components. The components themselves are host-agnostic: they never import a
// store or an API client. Instead the HOST wires concrete functions here, and
// the components call them via useDashboard().
//
// Two hosts, one component tree:
//   - ui-enterprise (studio, source of truth): provides everything — runQuery
//     against statefs-node /query, plus the logged-in verbs (save/load/search/
//     delete/analyze/refine/edit).
//   - publish-ui (published viewer, immutable): provides ONLY theme + runQuery
//     (DuckDB-WASM). The studio-only verbs are omitted, so the chart builder,
//     dashboard and SQL runner render read-only — no save/edit/load affordances.
//
// Rule of thumb: a capability that is absent ⇒ its affordance is hidden. So
// publish-ui drops nothing functionally except persistence/editing.

import { createContext, useContext, type ReactNode } from 'react';

// DashboardTheme mirrors the host's terminal theme: a flat map of Tailwind class
// strings (text/border/bg/accent/...). Kept loose so the package doesn't depend
// on a specific theme implementation.
export type DashboardTheme = Record<string, string>;

// QueryResult is the shape every runQuery implementation returns.
export interface QueryResult {
    columns: string[];
    rows: Record<string, unknown>[];
}

// SavedDashboard is an opaque persisted dashboard descriptor (the host owns its
// schema; the components only need id + name for listing/loading).
export interface SavedDashboard {
    id: string;
    name: string;
    [key: string]: unknown;
}

// DashboardCapabilities are the functions a host wires in. runQuery is REQUIRED;
// the rest are OPTIONAL and gate their UI (absent ⇒ hidden).
export interface DashboardCapabilities {
    // REQUIRED. Run a chart/console SQL string against a state's dataset (exposed
    // as the view `data`) and return rows. Studio → statefs-node /query; viewer →
    // DuckDB-WASM. stateId selects the dataset when the host is multi-state.
    runQuery: (sql: string, stateId?: string) => Promise<QueryResult>;

    // OPTIONAL — studio-only (logged-in user) verbs. Omitted by the viewer.
    saveDashboard?: (name?: string) => Promise<void> | void;
    listDashboards?: () => Promise<SavedDashboard[]> | SavedDashboard[];
    searchDashboards?: (query: string) => Promise<SavedDashboard[]> | SavedDashboard[];
    loadDashboard?: (id: string) => Promise<void> | void;
    deleteDashboard?: (id: string) => Promise<void> | void;

    // OPTIONAL — AI assist (studio-only).
    analyzeDataset?: () => Promise<void> | void;
    refineDashboard?: (prompt: string) => Promise<void> | void;

    // OPTIONAL — editing (studio-only). Absent ⇒ panels are read-only.
    removePanel?: (panelId: string) => void;
}

export interface DashboardContextValue extends DashboardCapabilities {
    theme: DashboardTheme;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export interface DashboardProviderProps extends DashboardCapabilities {
    theme: DashboardTheme;
    children: ReactNode;
}

// DashboardProvider wires the host's theme + capabilities into the component tree.
export function DashboardProvider({ children, ...value }: DashboardProviderProps) {
    return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

// useDashboard returns the wired theme + capabilities. Throws if used outside a
// provider (a programming error — the host must wrap the dashboard UI).
export function useDashboard(): DashboardContextValue {
    const ctx = useContext(DashboardContext);
    if (!ctx) {
        throw new Error('useDashboard must be used within a <DashboardProvider>');
    }
    return ctx;
}

// useCapabilities is a convenience derived from which functions the host wired —
// components use it to show/hide affordances (e.g. `canSave && <SaveButton/>`).
export function useCapabilities() {
    const c = useDashboard();
    return {
        canRun: true,
        canSave: !!c.saveDashboard,
        canList: !!c.listDashboards,
        canSearch: !!c.searchDashboards,
        canLoad: !!c.loadDashboard,
        canDelete: !!c.deleteDashboard,
        canAnalyze: !!c.analyzeDataset,
        canRefine: !!c.refineDashboard,
        canEditPanels: !!c.removePanel,
    };
}
