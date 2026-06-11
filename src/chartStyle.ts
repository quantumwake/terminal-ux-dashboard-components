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
    // Axis titles (legends): position along the axis + distance from it.
    xLegendPosition: LegendPosition;
    xLegendOffset: number;
    yLegendPosition: LegendPosition;
    yLegendOffset: number;
    // Custom axis title text ('' ⇒ fall back to the column name) + show/hide.
    xAxisLabel: string;
    yAxisLabel: string;
    showXLegend: boolean;
    showYLegend: boolean;
    // Axis title emphasis: bold weight + a highlight halo (outline) colour.
    legendBold: boolean;
    legendHighlight: string; // '' ⇒ no halo
    // Tick handling (overflow): rotate the x / y ticks, truncate long categorical
    // tick labels to N chars with an ellipsis (0 ⇒ off).
    xTickRotation: number;
    yTickRotation: number;
    tickTruncate: number;
    // Series legend placement (charts that have one: pie, grouped bar).
    legendAnchor: LegendAnchor;
    // Panel title (rendered as HTML by DashboardRenderer's header).
    titleAlign: TitleAlign;
    titleBold: boolean;
    titleBackground: string; // '' ⇒ transparent
    titleColor: string; // '' ⇒ inherit
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
    // Custom axis title text + visibility.
    xAxisLabel: '',
    yAxisLabel: '',
    showXLegend: true,
    showYLegend: true,
    // Axis title emphasis.
    legendBold: false,
    legendHighlight: '',
    // Tick overflow handling.
    xTickRotation: -35,
    yTickRotation: 0,
    tickTruncate: 0,
    // Series legend placement (charts that have one: pie, grouped bar).
    legendAnchor: 'right',
    // Panel title (rendered by DashboardRenderer's panel header).
    titleAlign: 'left',
    titleBold: false,
    titleBackground: '',
    titleColor: '',
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
            legend: {
                text: {
                    fill: s.legendColor,
                    fontSize: s.fontSize + 2,
                    fontWeight: s.legendBold ? 700 : 400,
                    // A highlight is drawn as a text outline (halo) — the clean,
                    // SVG-native way to make an axis title stand out.
                    outlineWidth: s.legendHighlight ? 3 : 0,
                    outlineColor: s.legendHighlight || 'transparent',
                },
            },
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

// Truncate a tick label to n chars with an ellipsis (overflow handling).
const truncate = (v: unknown, n: number): string => {
    const str = String(v);
    return n > 0 && str.length > n ? `${str.slice(0, n)}…` : str;
};

// Axis props for a given axis ('x' | 'y'): the title (custom text or the column
// name, hidden when its legend is toggled off), plus tick rotation/format so
// long or numeric tick labels don't overflow. `numeric` ⇒ thousands-format the
// ticks (value axes); otherwise long categorical labels are truncated.
export const axisLegend = (
    style: Partial<ChartStyle> | null | undefined,
    axis: 'x' | 'y',
    columnName: string,
    opts: { numeric?: boolean } = {},
) => {
    const s = withStyleDefaults(style);
    const isX = axis === 'x';
    const show = isX ? s.showXLegend : s.showYLegend;
    const label = (isX ? s.xAxisLabel : s.yAxisLabel) || columnName;

    const out: Record<string, unknown> = {};
    if (show && label) {
        out.legend = label;
        out.legendPosition = isX ? s.xLegendPosition : s.yLegendPosition;
        out.legendOffset = isX ? s.xLegendOffset : s.yLegendOffset;
    }
    out.tickRotation = isX ? s.xTickRotation : s.yTickRotation;
    if (opts.numeric) out.format = (v: unknown) => Number(v).toLocaleString();
    else if (s.tickTruncate > 0) out.format = (v: unknown) => truncate(v, s.tickTruncate);
    return out;
};
