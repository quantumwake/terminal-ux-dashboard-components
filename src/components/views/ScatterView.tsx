import { useMemo } from 'react';
import { ResponsiveScatterPlot } from '@nivo/scatterplot';

import { buildNivoTheme, axisLegend } from '../../chartStyle';
import type { ChartStyle } from '../../chartStyle';
import type { Row } from '../../sqlgen';

export interface ScatterSerie {
    id: string;
    data: { x: number; y: number }[];
}

export interface ScatterViewProps {
    records?: Row[];
    xColumn: string;
    yColumn: string;
    /** Pre-shaped Nivo scatter series bypasses client-side processing. */
    data?: ScatterSerie[];
    style?: Partial<ChartStyle>;
}

export function ScatterView({ records, xColumn, yColumn, data: presetData, style }: ScatterViewProps) {
    const computed = useMemo<ScatterSerie[]>(() => {
        if (presetData || !records) return [];
        const points = records
            .filter((r) => r[xColumn] != null && r[yColumn] != null)
            .map((r) => ({ x: Number(r[xColumn]) || 0, y: Number(r[yColumn]) || 0 }))
            .slice(0, 1000);

        return [{ id: `${xColumn} vs ${yColumn}`, data: points }];
    }, [records, xColumn, yColumn, presetData]);
    const data = presetData || computed;

    return (
        <div className="h-full min-h-[400px]">
            <ResponsiveScatterPlot
                data={data as never}
                margin={{ top: 20, right: 20, bottom: 60, left: 60 }}
                xScale={{ type: 'linear', min: 'auto', max: 'auto' }}
                yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
                colors={['rgba(167, 139, 250, 0.7)']}
                nodeSize={6}
                axisBottom={{ tickSize: 5, tickPadding: 5, ...axisLegend(style, 'x', xColumn) }}
                axisLeft={{ tickSize: 5, tickPadding: 5, ...axisLegend(style, 'y', yColumn) }}
                useMesh={true}
                theme={buildNivoTheme(style)}
            />
        </div>
    );
}

export default ScatterView;
