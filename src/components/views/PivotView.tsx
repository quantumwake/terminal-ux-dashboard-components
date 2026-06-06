import { useState } from 'react';
import PivotTableUI from 'react-pivottable/PivotTableUI';
import 'react-pivottable/pivottable.css';

import type { Row } from '../../sqlgen';

export interface PivotViewProps {
    records?: Row[];
}

/**
 * PivotView wraps react-pivottable — a drag-and-drop pivot table that
 * introspects columns from the data automatically.
 */
export function PivotView({ records }: PivotViewProps) {
    const [pivotState, setPivotState] = useState<Record<string, unknown>>({});

    if (!records?.length) {
        return <div className="p-8 text-center text-midnight-text-muted">No data for pivot</div>;
    }

    return (
        <div className="h-full overflow-auto pivot-dark-theme">
            <style>{`
                /* Override react-pivottable styles for dark theme */
                .pivot-dark-theme .pvtUi { background: transparent; color: #e2e8f0; }
                .pivot-dark-theme table.pvtTable { font-size: 12px; color: #e2e8f0; border-collapse: collapse; }
                .pivot-dark-theme table.pvtTable thead tr th,
                .pivot-dark-theme table.pvtTable tbody tr th { background: #1e293b; color: #94a3b8; border: 1px solid #334155; padding: 4px 8px; }
                .pivot-dark-theme table.pvtTable tbody tr td { background: #0f172a; color: #e2e8f0; border: 1px solid #334155; padding: 4px 8px; text-align: right; }
                .pivot-dark-theme .pvtAxisContainer, .pivot-dark-theme .pvtVals { background: #1e293b; border: 1px solid #334155; }
                .pivot-dark-theme .pvtAxisContainer li.pvtAxis { background: #334155; color: #e2e8f0; border: 1px solid #475569; border-radius: 3px; }
                .pivot-dark-theme .pvtFilterBox { background: #1e293b; border: 1px solid #334155; color: #e2e8f0; }
                .pivot-dark-theme .pvtDropdown { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; }
                .pivot-dark-theme .pvtSearch { background: #0f172a; color: #e2e8f0; border: 1px solid #334155; }
                .pivot-dark-theme select, .pivot-dark-theme .pvtAggregator { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; }
                .pivot-dark-theme .pvtRenderers { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; }
            `}</style>
            <PivotTableUI
                data={records}
                onChange={(s: Record<string, unknown>) => setPivotState(s)}
                {...pivotState}
            />
        </div>
    );
}

export default PivotView;
