import { type ReactNode } from 'react';
import { TerminalToggle, TerminalSlider, TerminalSelect, TerminalInput } from '@quantumwake/terminal-ux-components';

import { withStyleDefaults } from '../chartStyle';
import type { ChartStyle } from '../chartStyle';

// ChartStyleControls — the standardized appearance editor used across all charts.
// Built from the shared design system (TerminalToggle / TerminalSlider /
// TerminalSelect / TerminalInput) so it matches the rest of the ISM UI exactly.
// Edits a plain ChartStyle object (see chartStyle.ts); the parent persists it and
// passes it to the views.

// ─── Layout ─────────────────────────────────────────────────────────────────

// A titled group, separated by a divider so related controls cluster visually.
// Layout uses inline styles (not arbitrary Tailwind values like grid-cols-[..]),
// which a consuming app's Tailwind may not generate for this package — that was
// the cause of controls dropping onto the next line.
function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="border-t border-midnight-border font-mono" style={{ paddingTop: 12, paddingBottom: 12 }}>
            <div className="uppercase tracking-wider text-midnight-text-subdued" style={{ fontSize: 10, marginBottom: 8 }}>{title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', rowGap: 6 }}>{children}</div>
        </div>
    );
}

// One control row: label (left) + control (right) on the SAME row, two cells,
// fixed height so every row shares the same vertical rhythm. Inline grid so it
// never collapses to block flow regardless of the host's Tailwind config.
function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', alignItems: 'center', columnGap: 8, height: 32 }}>
            <span className="text-xs font-mono text-midnight-text-muted truncate" title={label}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '100%', minWidth: 0 }}>{children}</div>
        </div>
    );
}

// Native colour swatch — the design system has no colour picker; this is the one
// raw control, styled to match the midnight inputs.
function ColorControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <input
            type="color"
            value={/^#/.test(value) ? value : '#94a3b8'}
            onChange={e => onChange(e.target.value)}
            className="w-9 h-6 bg-transparent border border-midnight-border cursor-pointer p-0"
        />
    );
}

// Optional colour: a toggle enables it (defaulting to `fallback`); off ⇒ '' (none).
function OptionalColor({ value, onChange, fallback = '#a78bfa' }: { value: string; onChange: (v: string) => void; fallback?: string }) {
    const on = !!value;
    return (
        <div className="flex items-center gap-2">
            {on && <ColorControl value={value} onChange={onChange} />}
            <TerminalToggle size="small" checked={on} onChange={v => onChange(v ? fallback : '')} />
        </div>
    );
}

// ─── Editor ─────────────────────────────────────────────────────────────────

export interface ChartStyleControlsProps {
    style?: Partial<ChartStyle> | null;
    onChange: (next: ChartStyle) => void;
}

export function ChartStyleControls({ style, onChange }: ChartStyleControlsProps) {
    const s = withStyleDefaults(style);
    const set = <K extends keyof ChartStyle>(key: K, value: ChartStyle[K]) => onChange({ ...s, [key]: value });

    return (
        <div>
            <Section title="Canvas">
                <Row label="Background"><ColorControl value={s.background} onChange={v => set('background', v)} /></Row>
                <Row label="Text"><ColorControl value={s.textColor} onChange={v => set('textColor', v)} /></Row>
                <Row label="Grid"><ColorControl value={s.gridColor} onChange={v => set('gridColor', v)} /></Row>
                <Row label="Font size"><TerminalSlider value={s.fontSize} min={6} max={24} unit="px" onChange={v => set('fontSize', v)} /></Row>
            </Section>

            <Section title="Axis titles">
                <Row label="X title"><TerminalInput size="small" value={s.xAxisLabel} placeholder="(column)" onChange={e => set('xAxisLabel', e.target.value)} /></Row>
                <Row label="Show X"><TerminalToggle size="small" checked={s.showXLegend} onChange={v => set('showXLegend', v)} /></Row>
                <Row label="Y title"><TerminalInput size="small" value={s.yAxisLabel} placeholder="(column)" onChange={e => set('yAxisLabel', e.target.value)} /></Row>
                <Row label="Show Y"><TerminalToggle size="small" checked={s.showYLegend} onChange={v => set('showYLegend', v)} /></Row>
                <Row label="Color"><ColorControl value={s.legendColor} onChange={v => set('legendColor', v)} /></Row>
                <Row label="Bold"><TerminalToggle size="small" checked={s.legendBold} onChange={v => set('legendBold', v)} /></Row>
                <Row label="Highlight"><OptionalColor value={s.legendHighlight} onChange={v => set('legendHighlight', v)} /></Row>
            </Section>

            <Section title="Axis placement">
                <Row label="X pos"><TerminalSelect size="small" value={s.xLegendPosition} options={['start', 'middle', 'end']} onChange={v => set('xLegendPosition', v as ChartStyle['xLegendPosition'])} /></Row>
                <Row label="X offset"><TerminalSlider value={s.xLegendOffset} min={-80} max={80} onChange={v => set('xLegendOffset', v)} /></Row>
                <Row label="Y pos"><TerminalSelect size="small" value={s.yLegendPosition} options={['start', 'middle', 'end']} onChange={v => set('yLegendPosition', v as ChartStyle['yLegendPosition'])} /></Row>
                <Row label="Y offset"><TerminalSlider value={s.yLegendOffset} min={-80} max={80} onChange={v => set('yLegendOffset', v)} /></Row>
            </Section>

            <Section title="Ticks">
                <Row label="Wrap"><TerminalToggle size="small" checked={s.tickWrap} onChange={v => set('tickWrap', v)} /></Row>
                <Row label="Wrap width"><TerminalSlider value={s.tickWrapWidth} min={4} max={40} onChange={v => set('tickWrapWidth', v)} /></Row>
                <Row label="X angle"><TerminalSlider value={s.xTickRotation} min={-90} max={90} unit="°" onChange={v => set('xTickRotation', v)} /></Row>
                <Row label="Y angle"><TerminalSlider value={s.yTickRotation} min={-90} max={90} unit="°" onChange={v => set('yTickRotation', v)} /></Row>
                <Row label="Truncate"><TerminalSlider value={s.tickTruncate} min={0} max={40} onChange={v => set('tickTruncate', v)} /></Row>
            </Section>

            <Section title="Table cells">
                <Row label="Wrap"><TerminalToggle size="small" checked={s.cellWrap} onChange={v => set('cellWrap', v)} /></Row>
                <Row label="Decimals"><TerminalSlider value={s.cellPrecision} min={0} max={8} onChange={v => set('cellPrecision', v)} /></Row>
                <Row label="Truncate"><TerminalSlider value={s.cellTruncate} min={0} max={80} onChange={v => set('cellTruncate', v)} /></Row>
            </Section>

            <Section title="Panel title">
                <Row label="Align"><TerminalSelect size="small" value={s.titleAlign} options={['left', 'center', 'right']} onChange={v => set('titleAlign', v as ChartStyle['titleAlign'])} /></Row>
                <Row label="Bold"><TerminalToggle size="small" checked={s.titleBold} onChange={v => set('titleBold', v)} /></Row>
                <Row label="Color"><OptionalColor value={s.titleColor} onChange={v => set('titleColor', v)} fallback="#e2e8f0" /></Row>
                <Row label="Background"><OptionalColor value={s.titleBackground} onChange={v => set('titleBackground', v)} fallback="#1e293b" /></Row>
            </Section>

            <Section title="Series legend">
                <Row label="Position"><TerminalSelect size="small" value={s.legendAnchor} options={['right', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'none']} onChange={v => set('legendAnchor', v as ChartStyle['legendAnchor'])} /></Row>
            </Section>
        </div>
    );
}

export default ChartStyleControls;
