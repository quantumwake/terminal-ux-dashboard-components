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
        // Scatter axes are both numeric (linear scales). Coerce, then DROP any
        // point whose x or y isn't a finite number — coercing non-numeric cells
        // to 0 (the old behaviour) collapsed them onto the origin/axes and
        // produced a misleading plot.
        const points = records
            .map((r) => ({ x: Number(r[xColumn]), y: Number(r[yColumn]) }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
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
                axisBottom={{ tickSize: 5, tickPadding: 5, ...axisLegend(style, 'x', xColumn, { numeric: true }) }}
                axisLeft={{ tickSize: 5, tickPadding: 5, ...axisLegend(style, 'y', yColumn, { numeric: true }) }}
                useMesh={true}
                theme={buildNivoTheme(style)}
            />
        </div>
    );
}

export default ScatterView;
