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

// PanelInput is a chart panel handed to addPanel (the host assigns the id and
// appends it to the active dashboard, creating one if none exists).
export interface PanelInput {
    title: string;
    type: string;
    config: Record<string, unknown>;
    width: number;
    height: number;
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

    // OPTIONAL — start a fresh, empty dashboard (studio-only). Absent ⇒ no explicit
    // "New Dashboard" affordance (a dashboard is otherwise created implicitly by
    // the first addPanel). The host sets a blank active dashboard + clears the
    // persisted id so the next Save creates a new record.
    newDashboard?: () => void;

    // OPTIONAL — add a chart panel to the active dashboard (studio-only). Absent ⇒
    // the chart builder's "Add to Dashboard" affordance is hidden. The host
    // appends the panel (and creates the dashboard if none exists).
    addPanel?: (panel: PanelInput) => void;

    // OPTIONAL — editing (studio-only). Absent ⇒ panels are read-only.
    removePanel?: (panelId: string) => void;

    // OPTIONAL — persist a panel's PRECOMPUTED result (studio-only). When wired,
    // SQL-backed panels show a Refresh button: refresh runs runQuery and hands the
    // result rows back here so the host stores them on the panel (config.data) and
    // saves. Published dashboards are then rendered from that stored result — no
    // live query, no dataset download. Absent ⇒ no Refresh; panels are pure
    // precomputed-or-unavailable (the published viewer).
    persistPanelData?: (panelId: string, rows: QueryResult['rows'], refreshedAt: string) => void;

    // OPTIONAL — persist the dashboard grid layout (studio-only). When wired,
    // panels become draggable + resizable; on drop/resize the new geometry
    // (per-panel x/y/w/h, in 12-col grid units) is handed back here so the host
    // stores it on the panels and saves. Absent ⇒ a static (read-only) grid — the
    // published viewer renders panels exactly where the studio left them.
    persistLayout?: (items: PanelLayout[]) => void;

    // OPTIONAL — host-injected extra content on each panel's title row (rendered
    // before the remove button). The published viewer uses it for a per-chart
    // copy-embed-link icon. Absent ⇒ nothing extra renders.
    panelHeaderExtra?: (panel: PanelRef) => ReactNode;
}

// PanelRef is the minimal panel identity handed to panelHeaderExtra (the full
// DashboardPanel type lives in DashboardRenderer; this avoids a circular import).
export interface PanelRef {
    id: string;
    type: string;
    title?: string;
}

// PanelLayout is one panel's position + size in the 12-column grid (grid units,
// not pixels). x/y are the top-left cell; w/h the span.
export interface PanelLayout {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
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
        canNew: !!c.newDashboard,
        canAddPanel: !!c.addPanel,
        canEditPanels: !!c.removePanel,
        // Studio can recompute + persist a panel's precomputed result.
        canRefresh: !!c.persistPanelData,
        // Studio can drag/resize panels and persist the grid layout.
        canEditLayout: !!c.persistLayout,
    };
}
