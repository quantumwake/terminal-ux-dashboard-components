import { useId } from 'react';

// SparklineView — a dependency-free inline trend mark: a single numeric
// series as a 2px line over a soft gradient area, no axes, no ticks, no
// tooltip. For the "shape at a glance" slot (status bars, stat tiles);
// anything that needs values, comparison, or hover belongs in LineView.

export interface SparklineViewProps {
    /** The series, oldest first. */
    data: number[];
    /** Viewbox height in px (the svg scales to its container's width). */
    height?: number;
    /** Line + area hue. */
    color?: string;
    /** Show the CURRENT (last) value as a readout over the mark — a trend
     *  shape without its number answers "which way", never "how much". */
    showValue?: boolean;
    /** Formats the readout (e.g. v => `${v.toFixed(1)} ms`). Default: locale. */
    format?: (v: number) => string;
}

export function SparklineView({ data, height = 56, color = '#3987e5', showValue = false, format }: SparklineViewProps) {
    // useId keeps gradient defs distinct when several sparklines share a page.
    const gradientId = useId();
    const width = 260; // viewBox width; preserveAspectRatio scales it away
    const pts = data && data.length ? data : [0];
    const max = Math.max(...pts, 1);
    const dx = pts.length > 1 ? width / (pts.length - 1) : width;
    const xy = (v: number, i: number): [number, number] => [i * dx, height - (v / max) * (height - 4) - 2];
    const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xy(v, i)[0].toFixed(1)} ${xy(v, i)[1].toFixed(1)}`).join(' ');
    const area = `${line} L ${width} ${height} L 0 ${height} Z`;

    const current = pts[pts.length - 1];
    const readout = format ? format(current) : current.toLocaleString(undefined, { maximumFractionDigits: 1 });

    return (
        <div className="relative">
            <svg viewBox={`0 0 ${width} ${height}`} height={height} className="w-full" preserveAspectRatio="none">
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={area} fill={`url(#${gradientId})`} />
                <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
            {showValue && (
                <span className="absolute right-1 top-0 font-mono text-lg text-midnight-text-primary">{readout}</span>
            )}
        </div>
    );
}

export default SparklineView;
