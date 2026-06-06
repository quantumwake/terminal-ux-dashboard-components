import { useMemo } from 'react';

import { aggregate } from '../../dataShape';
import type { Row } from '../../sqlgen';

export interface MetricConfig {
    column: string;
    agg?: string;
    label?: string;
}

export interface MetricViewProps {
    records?: Row[];
    config: MetricConfig;
    /** Pre-computed value bypasses client-side aggregation. */
    value?: number | string | null;
}

/** Single-number metric card. Shows a big number with a label. */
export function MetricView({ records, config, value: presetValue }: MetricViewProps) {
    const value = useMemo(() => {
        if (presetValue != null) return presetValue;
        if (!records?.length) return 0;
        return aggregate(records, config.column, config.agg || 'count');
    }, [records, config, presetValue]);

    const formatted = typeof value === 'number'
        ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : value;

    return (
        <div className="h-full flex flex-col items-center justify-center">
            <div className="text-4xl font-mono text-midnight-accent">{formatted}</div>
            <div className="text-sm text-midnight-text-muted mt-2">{config.label || `${config.agg}(${config.column})`}</div>
        </div>
    );
}

export default MetricView;
