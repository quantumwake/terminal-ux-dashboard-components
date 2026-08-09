import { useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';

import { buildNivoTheme, chartSizing, seriesColor, thinTicks, withStyleDefaults } from '../../chartStyle';
import type { ChartStyle } from '../../chartStyle';
import { makeAxis } from '../axis';
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

    const s = withStyleDefaults(style);
    const { frameClass, frameStyle, margin } = chartSizing(style, { top: 20, right: 20, bottom: 60, left: 60 });

    // One serie keeps the historical single-hue look; several series take the
    // fixed-order categorical palette (identical hues were unreadable). The
    // serie→color map is by INDEX in the data, so a consumer using
    // seriesColor() for its legend/chips stays in step.
    const colorById = new Map(data.map((serie, i) => [
        serie.id,
        s.seriesColors.length || data.length > 1 ? seriesColor(i, s) : 'rgba(96, 165, 250, 0.9)',
    ]));

    // Point x-scales label every point — thin to the style's cap (the ticks
    // must be a subset of the x values, so compute from the first serie).
    const tickValues = thinTicks(data[0]?.data.map((d) => d.x) ?? [], s.maxXTicks);

    return (
        <div className={frameClass} style={frameStyle}>
            <ResponsiveLine
                data={data as never}
                margin={margin}
                xScale={{ type: 'point' }}
                yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
                curve="monotoneX"
                enableArea={true}
                areaOpacity={0.15}
                colors={((serie: LineSerie) => colorById.get(serie.id)) as never}
                pointSize={(data[0]?.data.length ?? 0) > 50 ? 0 : 6}
                pointColor={{ theme: 'background' }}
                pointBorderWidth={2}
                pointBorderColor={{ from: 'serieColor' }}
                enableGridX={false}
                axisBottom={{ ...makeAxis(style, 'x', xColumn), ...(tickValues ? { tickValues } : {}) }}
                axisLeft={makeAxis(style, 'y', yColumn, { numeric: true })}
                useMesh={true}
                theme={buildNivoTheme(style)}
            />
        </div>
    );
}

export default LineView;
