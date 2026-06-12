// axis.tsx — one shared builder for a Nivo axis (bottom / left) from a ChartStyle.
//
// Centralizes axis-title text/visibility, tick rotation (x AND y), truncation,
// and multi-line WRAPPING (default on — wrapping reads better than rotation for
// long categorical labels). Every view uses makeAxis so behaviour is identical
// across bar / line / scatter / grouped-bar (this also fixes the y-tick angle,
// which the grouped-bar view previously ignored).

import type { ReactNode } from 'react';
import { withStyleDefaults } from '../chartStyle';
import type { ChartStyle } from '../chartStyle';

type Axis = 'x' | 'y';

interface AxisOpts {
    numeric?: boolean; // value axes → thousands-format the ticks
}

// Format a tick value to a display string: numeric → locale, then truncate.
function formatVal(value: unknown, s: ChartStyle, numeric: boolean): string {
    let str = numeric ? Number(value).toLocaleString() : String(value);
    if (s.tickTruncate > 0 && str.length > s.tickTruncate) str = `${str.slice(0, s.tickTruncate)}…`;
    return str;
}

// Wrap a string into lines of at most `width` chars, breaking on spaces where
// possible (hard-splitting an over-long single token). Caps at 4 lines.
function wrapText(str: string, width: number): string[] {
    if (width <= 0 || str.length <= width) return [str];
    const words = str.split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    const push = (t: string) => { if (t) lines.push(t); };
    for (const w of words) {
        if (w.length > width) {
            push(cur); cur = '';
            for (let i = 0; i < w.length; i += width) lines.push(w.slice(i, i + width));
            continue;
        }
        if (!cur) cur = w;
        else if (cur.length + 1 + w.length <= width) cur += ` ${w}`;
        else { push(cur); cur = w; }
    }
    push(cur);
    if (lines.length > 4) {
        const kept = lines.slice(0, 4);
        kept[3] = `${kept[3].slice(0, Math.max(0, width - 1))}…`;
        return kept;
    }
    return lines;
}

// Build the full Nivo axis object for the given axis from a style. Returns `any`
// for friction-free interop with each chart's axis-prop type (the views differ).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeAxis(style: Partial<ChartStyle> | null | undefined, axis: Axis, columnName: string, opts: AxisOpts = {}): any {
    const s = withStyleDefaults(style);
    const isX = axis === 'x';
    const numeric = !!opts.numeric;
    const show = isX ? s.showXLegend : s.showYLegend;
    const label = (isX ? s.xAxisLabel : s.yAxisLabel) || columnName;
    const rotate = isX ? s.xTickRotation : s.yTickRotation;

    const out: Record<string, unknown> = { tickSize: 5, tickPadding: 5 };
    if (show && label) {
        out.legend = label;
        out.legendPosition = isX ? s.xLegendPosition : s.yLegendPosition;
        out.legendOffset = isX ? s.xLegendOffset : s.yLegendOffset;
    }

    if (s.tickWrap) {
        // Custom tick: format → wrap into <tspan> lines → rotate. (Nivo SVG text
        // can't wrap on its own.)
        out.renderTick = (tick: {
            x: number; y: number; value: unknown; textX: number; textY: number;
            textAnchor: string; textBaseline: string;
        }): ReactNode => {
            const lines = wrapText(formatVal(tick.value, s, numeric), s.tickWrapWidth);
            const firstDy = isX ? '0' : `${-((lines.length - 1) * 0.55)}em`;
            return (
                <g transform={`translate(${tick.x},${tick.y})`}>
                    <line x2={isX ? 0 : -5} y2={isX ? 5 : 0} style={{ stroke: s.textColor, strokeWidth: 1, opacity: 0.3 }} />
                    <text
                        transform={`translate(${tick.textX},${tick.textY}) rotate(${rotate})`}
                        textAnchor={tick.textAnchor as never}
                        dominantBaseline={tick.textBaseline as never}
                        style={{ fill: s.textColor, fontSize: s.fontSize }}
                    >
                        {lines.map((ln, i) => (
                            <tspan key={i} x={0} dy={i === 0 ? firstDy : '1.1em'}>{ln}</tspan>
                        ))}
                    </text>
                </g>
            );
        };
    } else {
        out.tickRotation = rotate;
        out.format = (v: unknown) => formatVal(v, s, numeric);
    }
    return out;
}
