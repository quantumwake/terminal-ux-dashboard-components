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

export interface ChartMargin {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

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
    // Tick handling (overflow): rotate the x / y ticks, truncate long tick labels
    // to N chars with an ellipsis (0 ⇒ off), and/or WRAP long labels onto
    // multiple lines (default on — wrapping reads better than rotation).
    xTickRotation: number;
    yTickRotation: number;
    tickTruncate: number;
    tickWrap: boolean;
    tickWrapWidth: number; // chars per wrapped line
    // Table cells: wrap long values, and format numbers (decimal precision +
    // optional truncation). cellPrecision applies to float/decimal values only.
    cellWrap: boolean;
    cellPrecision: number;
    cellTruncate: number; // 0 ⇒ off
    // Series legend placement (charts that have one: pie, grouped bar).
    legendAnchor: LegendAnchor;
    // Panel title (rendered as HTML by DashboardRenderer's header).
    titleAlign: TitleAlign;
    titleBold: boolean;
    titleBackground: string; // '' ⇒ transparent
    titleColor: string; // '' ⇒ inherit
    // Chart frame: a fixed pixel height (0 ⇒ fill the parent, the previous
    // behaviour) and a margin override merged over the view's default (null
    // ⇒ the view's default). Views ignored these before this field existed —
    // every view now honours them via chartSizing().
    height: number;
    margin: Partial<ChartMargin> | null;
    // Point-scale x axes label EVERY point; maxXTicks caps them to at most N
    // evenly-spaced ticks (0 ⇒ all ticks). See thinTicks(). On NUMERIC axes
    // maxXTicks/maxYTicks become the Nivo tick-count hint instead.
    maxXTicks: number;
    maxYTicks: number;
    // Line charts: the area fill under each line (0 ⇒ no shading — several
    // overlapping fills read as mush).
    areaOpacity: number;
    // Line charts: anchor y at 0 and pin the top to a NICE ceiling
    // (1–2–5×10^k above the window max) — a live chart's scale then only
    // moves when the data crosses a threshold, instead of re-fitting (and
    // visibly breathing) on every poll. Default off (auto-fit).
    yFromZero: boolean;
    // Bar charts: the value label drawn on each bar (off when bars are
    // dense — the labels collide with the axis).
    barLabels: boolean;
    // Fixed-order categorical series palette ([] ⇒ the view's default hue,
    // or DEFAULT_SERIES_COLORS once a chart holds several series). Series
    // past the palette's end fold to a neutral — never a cycled hue.
    seriesColors: string[];
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
    xTickRotation: 0,
    yTickRotation: 0,
    tickTruncate: 0,
    tickWrap: true,
    tickWrapWidth: 14,
    // Table cells.
    cellWrap: true,
    cellPrecision: 2,
    cellTruncate: 0,
    // Series legend placement (charts that have one: pie, grouped bar).
    legendAnchor: 'right',
    // Panel title (rendered by DashboardRenderer's panel header).
    titleAlign: 'left',
    titleBold: false,
    titleBackground: '',
    titleColor: '',
    // Chart frame + series color model.
    height: 0,
    margin: null,
    maxXTicks: 0,
    maxYTicks: 0,
    areaOpacity: 0.15,
    yFromZero: false,
    barLabels: true,
    seriesColors: [],
};

// The default categorical series palette: eight hues stepped for a dark
// terminal surface, in a FIXED order that is the colorblind-safety mechanism
// (adjacent pairs validated: CVD ΔE ≥ 8, normal-vision ΔE ≥ 15, ≥ 3:1
// contrast on #0e0e10). Assign by series index, never cycle.
export const DEFAULT_SERIES_COLORS: string[] = [
    '#3987e5', // blue
    '#d95926', // orange
    '#199e70', // aqua
    '#c98500', // yellow
    '#d55181', // magenta
    '#008300', // green
    '#9085e9', // violet
    '#e66767', // red
];

// Neutral for series past the palette's end ("Other") — folding beats cycling,
// which would hand two series one hue.
export const SERIES_OVERFLOW_COLOR = '#707078';

// seriesColor answers "what color is series i" under the style's palette:
// the indexed slot, or the overflow neutral once slots run out. Consumers
// (legends, chips) use this to stay in step with the charts.
export const seriesColor = (i: number, style?: Partial<ChartStyle> | null): string => {
    const s = withStyleDefaults(style);
    const palette = s.seriesColors.length ? s.seriesColors : DEFAULT_SERIES_COLORS;
    return i < palette.length ? palette[i] : SERIES_OVERFLOW_COLOR;
};

// chartSizing resolves the frame each view renders into: a fixed height when
// the style sets one (else fill-parent with the historical 160px floor), and
// the style's margin merged over the view's default.
export const chartSizing = (
    style: Partial<ChartStyle> | null | undefined,
    defaultMargin: ChartMargin,
): { frameClass: string; frameStyle: { height?: number }; margin: ChartMargin } => {
    const s = withStyleDefaults(style);
    return {
        frameClass: s.height > 0 ? 'w-full' : 'h-full w-full min-h-[160px]',
        frameStyle: s.height > 0 ? { height: s.height } : {},
        margin: { ...defaultMargin, ...(s.margin || {}) },
    };
};

// thinTicks picks at most `max` evenly-spaced values (first and last always
// kept) for a point-scale axis's tickValues. undefined ⇒ let the chart label
// every point (max 0, or few enough points already).
export function thinTicks<T>(values: T[], max: number): T[] | undefined {
    if (max <= 0 || values.length <= max) return undefined;
    if (max === 1) return [values[values.length - 1]];
    const picked: T[] = [];
    for (let i = 0; i < max; i++) {
        picked.push(values[Math.round((i * (values.length - 1)) / (max - 1))]);
    }
    return [...new Set(picked)];
}

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
