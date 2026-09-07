import { useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';

import { buildNivoTheme, chartSizing, seriesColor, thinTicks, withStyleDefaults } from '../../chartStyle';
import type { ChartStyle } from '../../chartStyle';
import { makeAxis } from '../axis';
import type { Row } from '../../sqlgen';

export interface LineSerie {
    id: string;
    /** Explicit serie color — STABLE identity coloring: the host assigns a
     *  color to the entity, so toggling other series never repaints this
     *  one (index-based palette assignment reshuffles on every selection
     *  change). Absent ⇒ the fixed-order palette by index. */
    color?: string;
    /** lo/hi (optional, per point) draw a soft envelope band behind the
     *  line — the reading for "this line summarizes several": the band is
     *  the min–max spread of what it aggregates. y may be null for an
     *  honest gap (the line breaks instead of bridging). */
    data: { x: string | Date | number; y: number | null; lo?: number; hi?: number }[];
}

// The time axis's default tick/tooltip clock: 24-hour, WITH the hour —
// "56:42 · 00:16 · 03:30" (minute:second only) reads as a clock that reset
// when a window crosses the top of the hour. hourCycle h23 rather than
// hour12:false, which some engines render midnight as "24:00".
const fmtClock = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

const toDate = (x: string | Date | number): Date => (x instanceof Date ? x : new Date(x));

export interface LineViewProps {
    records?: Row[];
    xColumn: string;
    yColumn: string;
    /** Pre-shaped Nivo line series bypasses client-side processing. */
    data?: LineSerie[];
    style?: Partial<ChartStyle>;
    /** 'point' (default): x values are CATEGORIES, placed at equal spacing
     *  in encounter order and ticked by sampling every Nth one — right for
     *  labels, wrong for timestamps (a missing bucket collapses, and the
     *  ticks land on arbitrary samples). 'time': x values are Dates (or
     *  epoch ms / ISO strings) on a continuous scale — gaps stretch, ticks
     *  land on ROUND times (d3's time ticks, capped by maxXTicks), and the
     *  series need not share buckets. */
    xScale?: 'point' | 'time';
    /** Time axis tick + tooltip formatter. Default: HH:MM:SS, local, 24h. */
    xFormat?: (x: Date) => string;
    /** Time axis: pin the visible domain — a live window keeps a steady
     *  width instead of re-fitting to whatever samples exist. Default: fit
     *  the data. */
    xDomain?: [Date, Date];
}

// Line layer datum shape Nivo hands custom layers (typed loosely on purpose —
// only the fields the custom layers touch).
interface LayerSerie {
    id: string | number;
    color: string;
    data: {
        data: { lo?: number; hi?: number };
        position: { x: number | null; y: number | null };
    }[];
}

export function LineView({ records, xColumn, yColumn, data: presetData, style, xScale = 'point', xFormat, xDomain }: LineViewProps) {
    const timed = xScale === 'time';
    const clock = xFormat ?? fmtClock;
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
    const shaped = presetData || computed;
    // A time scale wants native Dates ("format: 'native'"); coerce once so
    // hosts may hand over epoch ms or ISO strings.
    const data = useMemo<LineSerie[]>(
        () => (timed ? shaped.map((serie) => ({ ...serie, data: serie.data.map((d) => ({ ...d, x: toDate(d.x) })) })) : shaped),
        [shaped, timed],
    );

    const s = withStyleDefaults(style);
    const { frameClass, frameStyle, margin } = chartSizing(style, { top: 20, right: 20, bottom: 60, left: 60 });

    // One serie keeps the historical single-hue look; several series take the
    // fixed-order categorical palette (identical hues were unreadable). The
    // serie→color map is by INDEX in the data, so a consumer using
    // seriesColor() for its legend/chips stays in step.
    const colorById = new Map(data.map((serie, i) => [
        serie.id,
        serie.color ?? (s.seriesColors.length || data.length > 1 ? seriesColor(i, s) : 'rgba(96, 165, 250, 0.9)'),
    ]));

    // Point x-scales label every point — thin to the style's cap (the ticks
    // must be a subset of the x values, so compute from the longest serie).
    const longest = data.reduce((a, b) => (b.data.length > a.data.length ? b : a), { id: '', data: [] as LineSerie['data'] });
    const tickValues = timed ? undefined : thinTicks(longest.data.map((d) => d.x), s.maxXTicks);

    // The bottom axis: a point axis takes the thinned category subset; a
    // time axis drops makeAxis's wrapping tick (it would print Date.toString)
    // and lets d3 choose ≤ maxXTicks round instants, labelled by the clock.
    const axisBottom = (() => {
        const base = makeAxis(style, 'x', xColumn);
        if (!timed) return { ...base, ...(tickValues ? { tickValues } : {}) };
        delete base.renderTick;
        return { ...base, tickRotation: s.xTickRotation, format: clock, ...(s.maxXTicks > 0 ? { tickValues: s.maxXTicks } : {}) };
    })();

    const nivoXScale = timed
        ? { type: 'time', format: 'native', precision: 'millisecond', useUTC: false, min: xDomain?.[0] ?? 'auto', max: xDomain?.[1] ?? 'auto' }
        : { type: 'point' };

    // Stable scale: 0 up to a nice 1–2–5×10^k ceiling over the CURRENT
    // window's max (line AND band bounds). Quantization keeps it from
    // breathing poll-to-poll; when an outlier ages out of a live window
    // the ceiling steps DOWN once and the chart becomes readable again —
    // a permanent ratchet trapped one churn spike as the scale forever.
    let yScale: Record<string, unknown> = { type: 'linear', min: 'auto', max: 'auto' };
    if (s.yFromZero) {
        const dataMax = Math.max(0, ...data.flatMap((serie) => serie.data.map((d) => Math.max(d.y ?? 0, d.hi ?? d.y ?? 0))));
        yScale = { type: 'linear', min: 0, max: niceCeil(dataMax) };
    }

    // Aggregate (banded) series, by id — they draw an envelope and carry
    // slightly more line weight than observed series: band + weight read as
    // "summary of several" without dash speckle.
    const bandedIds = new Set(data.filter((serie) => serie.data.some((d) => d.lo != null)).map((serie) => serie.id));

    type Gen = (pts: { x: number | null; y: number | null }[]) => string;

    // Envelope bands: the min–max spread behind an aggregate line, curved
    // with the same generator so the edges track the line's shape.
    const bandsLayer = ({ series, yScale, lineGenerator }: { series: LayerSerie[]; yScale: (v: number) => number; lineGenerator: Gen }) => (
        <>
            {series.map((serie) => {
                const pts = serie.data.filter((d) => d.data.lo != null && d.data.hi != null && d.position.x != null);
                if (pts.length < 2) return null;
                const upper = lineGenerator(pts.map((d) => ({ x: d.position.x, y: yScale(d.data.hi as number) })));
                const lower = lineGenerator([...pts].reverse().map((d) => ({ x: d.position.x, y: yScale(d.data.lo as number) })));
                if (!upper || !lower) return null;
                return <path key={`band-${serie.id}`} d={`${upper} L ${lower.slice(1)} Z`} fill={serie.color} opacity={0.12} />;
            })}
        </>
    );

    const linesLayer = ({ series, lineGenerator }: { series: LayerSerie[]; lineGenerator: Gen }) => (
        <>
            {series.map((serie) => (
                <path
                    key={serie.id}
                    d={lineGenerator(serie.data.map((d) => d.position))}
                    fill="none"
                    stroke={serie.color}
                    strokeWidth={bandedIds.has(String(serie.id)) ? 2.5 : 1.5}
                    strokeLinecap="round"
                />
            ))}
        </>
    );

    return (
        <div className={frameClass} style={frameStyle}>
            <ResponsiveLine
                data={data as never}
                margin={margin}
                xScale={nivoXScale as never}
                xFormat={(timed ? (v: unknown) => clock(v as Date) : undefined) as never}
                yScale={yScale as never}
                curve="monotoneX"
                enableArea={s.areaOpacity > 0}
                areaOpacity={s.areaOpacity}
                colors={((serie: LineSerie) => colorById.get(serie.id)) as never}
                pointSize={0}
                pointColor={{ theme: 'background' }}
                pointBorderWidth={2}
                pointBorderColor={{ from: 'serieColor' }}
                enableGridX={false}
                axisBottom={axisBottom}
                axisLeft={makeAxis(style, 'y', yColumn, { numeric: true })}
                useMesh={true}
                layers={['grid', 'markers', 'axes', 'areas', bandsLayer, linesLayer, 'crosshair', 'slices', 'mesh', 'legends'] as never}
                animate={s.animate}
                theme={buildNivoTheme(style)}
            />
        </div>
    );
}

// niceCeil rounds up to the next 1–2–5×10^k above the value (with ~5%
// headroom), so a live max maps to a stable, readable axis top.
function niceCeil(v: number): number {
    if (v <= 0) return 1;
    const padded = v * 1.05;
    const mag = Math.pow(10, Math.floor(Math.log10(padded)));
    for (const step of [1, 2, 5, 10]) {
        if (padded <= step * mag) return step * mag;
    }
    return 10 * mag;
}

export default LineView;
