import { useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';

import { buildNivoTheme, axisLegend } from '../../chartStyle';
import type { ChartStyle } from '../../chartStyle';
import type { Row } from '../../sqlgen';

export interface LineSerie {
    id: string;
    data: { x: string; y: number }[];
}

export interface LineViewProps {
    records?: Row[];
    xColumn: string;
    yColumn: string;
    /** Pre-shaped Nivo line series bypasses client-side processing. */
    data?: LineSerie[];
    style?: Partial<ChartStyle>;
}

export function LineView({ records, xColumn, yColumn, data: presetData, style }: LineViewProps) {
    const computed = useMemo<LineSerie[]>(() => {
        if (presetData || !records) return [];
        const sorted = [...records]
            .filter((r) => r[xColumn] != null && r[yColumn] != null)
            .sort((a, b) => {
                const av = a[xColumn] as never;
                const bv = b[xColumn] as never;
                return av < bv ? -1 : av > bv ? 1 : 0;
            })
            .slice(0, 500);

        return [{
            id: yColumn,
            data: sorted.map((r) => ({ x: String(r[xColumn]), y: Number(r[yColumn]) || 0 })),
        }];
    }, [records, xColumn, yColumn, presetData]);
    const data = presetData || computed;

    return (
        <div className="h-full min-h-[400px]">
            <ResponsiveLine
                data={data as never}
                margin={{ top: 20, right: 20, bottom: 60, left: 60 }}
                xScale={{ type: 'point' }}
                yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
                curve="monotoneX"
                enableArea={true}
                areaOpacity={0.15}
                colors={['rgba(96, 165, 250, 0.9)']}
                pointSize={(data[0]?.data.length ?? 0) > 50 ? 0 : 6}
                pointColor={{ theme: 'background' }}
                pointBorderWidth={2}
                pointBorderColor={{ from: 'serieColor' }}
                enableGridX={false}
                axisBottom={{ tickSize: 5, tickPadding: 5, tickRotation: -35, ...axisLegend(style, 'x', xColumn) }}
                axisLeft={{ tickSize: 5, tickPadding: 5, ...axisLegend(style, 'y', yColumn) }}
                useMesh={true}
                theme={buildNivoTheme(style)}
            />
        </div>
    );
}

export default LineView;
