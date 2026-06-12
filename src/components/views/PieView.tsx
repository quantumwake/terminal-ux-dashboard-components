import { useMemo } from 'react';
import { ResponsivePie } from '@nivo/pie';

import { groupBy } from '../../dataShape';
import { buildNivoTheme, legendConfig } from '../../chartStyle';
import type { ChartStyle } from '../../chartStyle';
import type { Row } from '../../sqlgen';

export interface PieDatum {
    id: string;
    label: string;
    value: number;
}

export interface PieViewProps {
    records?: Row[];
    groupColumn: string;
    /** Pre-aggregated [{id, label, value}] bypasses client-side aggregation. */
    data?: PieDatum[];
    style?: Partial<ChartStyle>;
}

export function PieView({ records, groupColumn, data: presetData, style }: PieViewProps) {
    const computed = useMemo<PieDatum[]>(() => {
        if (presetData || !records) return [];
        const groups = groupBy(records, groupColumn);
        const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
        const top = sorted.slice(0, 12);
        const otherCount = sorted.slice(12).reduce((sum, [, recs]) => sum + recs.length, 0);
        const result: PieDatum[] = top.map(([key, recs]) => ({ id: key, label: key, value: recs.length }));
        if (otherCount > 0) result.push({ id: '(other)', label: '(other)', value: otherCount });
        return result;
    }, [records, groupColumn, presetData]);
    const data = presetData || computed;

    const legend = legendConfig(style);
    return (
        <div className="h-full w-full min-h-[160px]">
            <ResponsivePie
                data={data as never}
                margin={{ top: 20, right: 120, bottom: 20, left: 20 }}
                innerRadius={0.4}
                padAngle={1}
                cornerRadius={3}
                activeOuterRadiusOffset={8}
                colors={{ scheme: 'set2' }}
                borderWidth={1}
                borderColor={{ from: 'color', modifiers: [['darker', 0.2]] } as never}
                arcLinkLabelsSkipAngle={10}
                arcLinkLabelsTextColor="#94a3b8"
                arcLinkLabelsColor={{ from: 'color' }}
                arcLabelsSkipAngle={10}
                arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 3]] } as never}
                legends={legend ? [legend as never] : []}
                theme={buildNivoTheme(style)}
            />
        </div>
    );
}

export default PieView;
