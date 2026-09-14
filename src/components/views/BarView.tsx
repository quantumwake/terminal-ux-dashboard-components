import { useMemo } from 'react';
import { ResponsiveBar } from '@nivo/bar';

import { groupBy, aggregate } from '../../dataShape';
import { buildNivoTheme, chartSizing, withStyleDefaults } from '../../chartStyle';
import type { ChartStyle } from '../../chartStyle';
import { makeAxis } from '../axis';
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
    /** 'horizontal' lays categories on the y axis — the readable form for
     *  many bars with long names (labels never collide). Default vertical. */
    layout?: 'vertical' | 'horizontal';
    style?: Partial<ChartStyle>;
    /** Value-axis tick + tooltip + in-bar label formatter (e.g. formatBytes
     *  for a throughput series). Default: Number(value).toLocaleString(). */
    yFormat?: (value: number) => string;
}

export function BarView({ records, groupColumn, valueColumn, aggFn = 'count', data: presetData, layout = 'vertical', style, yFormat }: BarViewProps) {
    const computed = useMemo<BarDatum[]>(() => {
        if (presetData || !records) return [];
        const groups = groupBy(records, groupColumn);
        return Object.entries(groups)
            .map(([key, recs]) => ({ group: key, value: aggregate(recs, valueColumn, aggFn) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 50);
    }, [records, groupColumn, valueColumn, aggFn, presetData]);
    const data = presetData || computed;

    const s = withStyleDefaults(style);
    const { frameClass, frameStyle, margin } = chartSizing(style, { top: 20, right: 20, bottom: 60, left: 60 });

    // Horizontal swaps the axes' jobs: values along the bottom (numeric),
    // category names down the left. Horizontal data is reversed so the
    // largest bar renders at the TOP (Nivo draws the first datum bottom-up).
    const horizontal = layout === 'horizontal';
    const plotted = horizontal ? [...data].reverse() : data;
    // yFormat feeds the value axis's ticks (via makeAxis) and Nivo's own
    // valueFormat, which drives the tooltip AND in-bar labels.
    const valueFormat = yFormat ? (v: unknown) => yFormat(Number(v)) : undefined;
    const axisBottom = horizontal
        ? makeAxis(style, 'x', valueColumn, { numeric: true, format: valueFormat })
        : makeAxis(style, 'x', groupColumn);
    const axisLeft = horizontal
        ? makeAxis(style, 'y', groupColumn)
        : makeAxis(style, 'y', valueColumn, { numeric: true, format: valueFormat });

    return (
        <div className={frameClass} style={frameStyle}>
            <ResponsiveBar
                data={plotted as never}
                keys={['value']}
                indexBy="group"
                layout={layout}
                margin={margin}
                padding={0.3}
                colors={[s.seriesColors[0] || 'rgba(74, 222, 128, 0.8)']}
                borderColor={{ from: 'color', modifiers: [['darker', 1.6]] } as never}
                axisBottom={axisBottom}
                axisLeft={axisLeft}
                valueFormat={valueFormat as never}
                enableLabel={s.barLabels}
                labelSkipWidth={12}
                labelSkipHeight={12}
                labelTextColor={{ from: 'color', modifiers: [['darker', 3]] } as never}
                animate={s.animate}
                theme={buildNivoTheme(style)}
            />
        </div>
    );
}

export default BarView;
