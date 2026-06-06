// chartStyle — a single, standardized chart-appearance model shared by every
// chart view. A plain `ChartStyle` object (see DEFAULT_CHART_STYLE) is the
// source of truth; `buildNivoTheme` turns it into a Nivo `theme`, and
// `axisLegend` produces the per-axis legend props (title text/position/offset).
//
// Nivo already supports all of this natively (theme + axis legend*), so every
// view just consumes the same style object instead of hardcoding its own theme.

export type LegendAnchor = 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';
export type LegendPosition = 'start' | 'middle' | 'end';
export type TitleAlign = 'left' | 'center' | 'right';

export interface ChartStyle {
    background: string;
    textColor: string;
    legendColor: string;
    fontSize: number;
    gridColor: string;
    tooltipBg: string;
    tooltipColor: string;
    xLegendPosition: LegendPosition;
    xLegendOffset: number;
    yLegendPosition: LegendPosition;
    yLegendOffset: number;
    legendAnchor: LegendAnchor;
    titleAlign: TitleAlign;
}

export const DEFAULT_CHART_STYLE: ChartStyle = {
    background: 'transparent',          // chart canvas background
    textColor: '#94a3b8',               // ticks + labels
    legendColor: '#cbd5e1',             // axis titles (legends)
    fontSize: 11,
    gridColor: 'rgba(148,163,184,0.1)',
    tooltipBg: '#1e293b',
    tooltipColor: '#e2e8f0',
    // Axis titles (legends): position along the axis + distance from it.
    xLegendPosition: 'middle',
    xLegendOffset: 46,
    yLegendPosition: 'middle',
    yLegendOffset: -50,
    // Series legend placement (charts that have one: pie, grouped bar).
    legendAnchor: 'right',
    // Panel title alignment (rendered by DashboardRenderer's panel header).
    titleAlign: 'left',
};

export const LEGEND_ANCHORS: LegendAnchor[] = ['right', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'none'];

// Merge a partial style over the defaults (safe for undefined/null).
export const withStyleDefaults = (style?: Partial<ChartStyle> | null): ChartStyle => ({
    ...DEFAULT_CHART_STYLE,
    ...(style || {}),
});

// Build a Nivo `theme` object from a style.
export const buildNivoTheme = (style?: Partial<ChartStyle> | null) => {
    const s = withStyleDefaults(style);
    return {
        background: s.background,
        text: { fill: s.textColor, fontSize: s.fontSize },
        axis: {
            ticks: { text: { fill: s.textColor, fontSize: s.fontSize } },
            legend: { text: { fill: s.legendColor, fontSize: s.fontSize + 2 } },
        },
        grid: { line: { stroke: s.gridColor } },
        crosshair: { line: { stroke: s.textColor, strokeDasharray: '6 6' } },
        labels: { text: { fontSize: s.fontSize } },
        legends: { text: { fill: s.textColor, fontSize: s.fontSize } },
        tooltip: { container: { background: s.tooltipBg, color: s.tooltipColor, border: '1px solid #334155' } },
    };
};

// Series-legend config (Nivo `legends` entry) for charts that have a discrete
// legend (pie, grouped bar). Returns null when the legend is hidden.
export const legendConfig = (style?: Partial<ChartStyle> | null) => {
    const s = withStyleDefaults(style);
    if (s.legendAnchor === 'none') return null;
    const base = {
        anchor: s.legendAnchor,
        direction: 'column' as const,
        itemWidth: 90,
        itemHeight: 18,
        itemsSpacing: 2,
        symbolSize: 10,
        symbolShape: 'circle' as const,
        itemTextColor: s.textColor,
    };
    if (s.legendAnchor === 'right') {
        // Outside the plot on the right (charts reserve right margin for this).
        return { ...base, translateX: 100 };
    }
    // Corner-anchored, inset inside the plot area.
    const tx = s.legendAnchor.includes('left') ? 10 : -10;
    const ty = s.legendAnchor.includes('top') ? 10 : -10;
    return { ...base, translateX: tx, translateY: ty };
};

// Axis legend (title) props for a given axis ('x' | 'y').
export const axisLegend = (style: Partial<ChartStyle> | null | undefined, axis: 'x' | 'y', legendText: string) => {
    const s = withStyleDefaults(style);
    const isX = axis === 'x';
    return {
        legend: legendText,
        legendPosition: isX ? s.xLegendPosition : s.yLegendPosition,
        legendOffset: isX ? s.xLegendOffset : s.yLegendOffset,
    };
};
