// format.ts — shared value-formatting helpers for chart primitives.
//
// Views take an optional yFormat?: (value: number) => string prop (LineView,
// BarView, SparklineView) so a host can render axis ticks, tooltips, and
// value readouts in whatever unit the data represents. formatBytes is the
// one this repo ships for the common case — byte / byte-rate series (e.g.
// statefs throughput charts) — so every consumer picks the same unit rule
// instead of hand-rolling KB/MB/GB math per dashboard.

const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB', 'PB'];

/**
 * Formats a byte count as a human-readable string: plain bytes under 1000
 * ("999 B"), then KB/MB/GB/TB/PB with one decimal place ("1.0 KB", "1.5 MB",
 * "2.0 GB"). Uses decimal (SI, base-1000) units, as the product lists them
 * ("B / KB / MB / GB / TB / PB") — not KiB/MiB binary units. `perSecond`
 * appends "/s" — for throughput series (KB/s, MB/s, GB/s).
 */
export function formatBytes(value: number, perSecond = false): string {
    const suffix = perSecond ? '/s' : '';
    if (!Number.isFinite(value)) return `— B${suffix}`;

    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    if (abs < 1000) return `${sign}${Math.round(abs)} B${suffix}`;

    let scaled = abs / 1000;
    let unit = 0;
    while (scaled >= 1000 && unit < BYTE_UNITS.length - 1) {
        scaled /= 1000;
        unit++;
    }
    // Rounding to one decimal can itself reach 1000.0 (e.g. 999,999 B scales
    // to 999.999 KB, which rounds to "1000.0 KB"). Roll to the next unit so
    // the displayed value always stays below 1000.
    if (scaled.toFixed(1) === '1000.0' && unit < BYTE_UNITS.length - 1) {
        scaled /= 1000;
        unit++;
    }
    return `${sign}${scaled.toFixed(1)} ${BYTE_UNITS[unit]}${suffix}`;
}
