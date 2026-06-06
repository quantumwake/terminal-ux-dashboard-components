import { useMemo } from 'react';
import { ResponsiveBar } from '@nivo/bar';

import { groupBy, aggregate } from '../../dataShape';
import { buildNivoTheme } from '../../chartStyle';
import type { ChartStyle } from '../../chartStyle';
import type { Row } from '../../sqlgen';

export interface BarDatum {
    group: string;
    value: number;
}

export interface BarViewProps {
    records?: Row[];
    groupColumn: string;
    valueColumn: string;
    aggFn?: string;
    /** Pre-aggregated [{group, value}] bypasses client-side aggregation. */
    data?: BarDatum[];
    style?: Partial<ChartStyle>;
}

export function BarView({ records, groupColumn, valueColumn, aggFn = 'count', data: presetData, style }: BarViewProps) {
    const computed = useMemo<BarDatum[]>(() => {
        if (presetData || !records) return [];
        const groups = groupBy(records, groupColumn);
        return Object.entries(groups)
            .map(([key, recs]) => ({ group: key, value: aggregate(recs, valueColumn, aggFn) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 50);
    }, [records, groupColumn, valueColumn, aggFn, presetData]);
    const data = presetData || computed;

    return (
        <div className="h-full min-h-[400px]">
            <ResponsiveBar
                data={data as never}
                keys={['value']}
                indexBy="group"
                margin={{ top: 20, right: 20, bottom: 60, left: 60 }}
                padding={0.3}
                colors={['rgba(74, 222, 128, 0.8)']}
                borderColor={{ from: 'color', modifiers: [['darker', 1.6]] } as never}
                axisBottom={{ tickSize: 5, tickPadding: 5, tickRotation: -35 }}
                axisLeft={{ tickSize: 5, tickPadding: 5, format: (v) => Number(v).toLocaleString() }}
                labelSkipWidth={12}
                labelSkipHeight={12}
                labelTextColor={{ from: 'color', modifiers: [['darker', 3]] } as never}
                theme={buildNivoTheme(style)}
            />
        </div>
    );
}

export default BarView;
