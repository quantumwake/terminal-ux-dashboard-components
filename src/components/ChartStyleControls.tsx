import { type ReactNode } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { withStyleDefaults } from '../chartStyle';
import type { ChartStyle } from '../chartStyle';

// ChartStyleControls — the standardized appearance editor used across all charts.
// Edits a plain ChartStyle object (see chartStyle.ts); theme-aware via the
// host-injected DashboardContext theme. Numeric ranges use sliders (with a live
// readout), booleans use a switch, and everything sits on one consistent
// label-left / control-right grid so the pane reads cleanly.

// ─── Layout primitives ──────────────────────────────────────────────────────

// A titled section. Sections are separated by a divider + spacing so related
// controls group visually.
function Section({ title, children }: { title: string; children: ReactNode }) {
    const { theme } = useDashboard();
    return (
        <div className={`py-3 border-t ${theme.border} first:border-t-0 first:pt-0`}>
            <div className="text-[10px] uppercase tracking-wider text-midnight-text-muted/70 font-mono mb-2">{title}</div>
            <div className="space-y-1.5">{children}</div>
        </div>
    );
}

// One control row: fixed-width label on the left, control flush-right. Every row
// shares the same height + grid so nothing looks jammed.
function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid grid-cols-[88px_1fr] items-center gap-2 min-h-[30px]">
            <span className="text-xs font-mono text-midnight-text-muted truncate" title={label}>{label}</span>
            <div className="flex items-center justify-end">{children}</div>
        </div>
    );
}

// ─── Controls ───────────────────────────────────────────────────────────────

function ColorControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const { theme } = useDashboard();
    return (
        <input
            type="color"
            value={/^#/.test(value) ? value : '#94a3b8'}
            onChange={e => onChange(e.target.value)}
            className={`w-9 h-6 bg-transparent border ${theme.border} cursor-pointer p-0`}
        />
    );
}

// A range slider with a right-aligned numeric readout — the right control for a
// bounded numeric (angles, offsets, font size, truncation).
function SliderControl({ value, onChange, min, max, step = 1, unit = '' }: {
    value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string;
}) {
    return (
        <div className="flex items-center gap-2 w-full">
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="flex-1 h-1 accent-midnight-accent cursor-pointer"
            />
            <span className="w-10 shrink-0 text-right text-[11px] font-mono tabular-nums text-midnight-text-body">{value}{unit}</span>
        </div>
    );
}

function TextControl({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
    const { theme } = useDashboard();
    return (
        <input
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
            className={`w-full px-2 py-1 text-xs font-mono bg-midnight-surface border ${theme.border} text-midnight-text-body outline-none focus:border-midnight-accent transition-colors`}
        />
    );
}

// A proper on/off switch (replaces the bare checkbox).
function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={value}
            onClick={() => onChange(!value)}
            className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${value ? 'bg-midnight-accent' : 'bg-midnight-border'}`}
        >
            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${value ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
        </button>
    );
}

// An optional colour: a switch enables it (defaulting to `fallback`); off stores
// '' (⇒ none/transparent/inherit).
function OptionalColor({ value, onChange, fallback = '#a78bfa' }: { value: string; onChange: (v: string) => void; fallback?: string }) {
    const on = !!value;
    return (
        <div className="flex items-center gap-2">
            {on && <ColorControl value={value} onChange={onChange} />}
            <Switch value={on} onChange={v => onChange(v ? fallback : '')} />
        </div>
    );
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
    const { theme } = useDashboard();
    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value as T)}
            className={`w-full px-2 py-1 text-xs font-mono bg-midnight-surface border ${theme.border} text-midnight-text-body outline-none focus:border-midnight-accent transition-colors`}
        >
            {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
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
                <Row label="Font size"><SliderControl value={s.fontSize} min={6} max={24} unit="px" onChange={v => set('fontSize', v)} /></Row>
            </Section>

            <Section title="Axis titles">
                <Row label="X title"><TextControl value={s.xAxisLabel} placeholder="(column)" onChange={v => set('xAxisLabel', v)} /></Row>
                <Row label="Show X"><Switch value={s.showXLegend} onChange={v => set('showXLegend', v)} /></Row>
                <Row label="Y title"><TextControl value={s.yAxisLabel} placeholder="(column)" onChange={v => set('yAxisLabel', v)} /></Row>
                <Row label="Show Y"><Switch value={s.showYLegend} onChange={v => set('showYLegend', v)} /></Row>
                <Row label="Color"><ColorControl value={s.legendColor} onChange={v => set('legendColor', v)} /></Row>
                <Row label="Bold"><Switch value={s.legendBold} onChange={v => set('legendBold', v)} /></Row>
                <Row label="Highlight"><OptionalColor value={s.legendHighlight} onChange={v => set('legendHighlight', v)} /></Row>
            </Section>

            <Section title="Axis placement">
                <Row label="X pos"><Choice value={s.xLegendPosition} options={['start', 'middle', 'end'] as const} onChange={v => set('xLegendPosition', v)} /></Row>
                <Row label="X offset"><SliderControl value={s.xLegendOffset} min={-80} max={80} onChange={v => set('xLegendOffset', v)} /></Row>
                <Row label="Y pos"><Choice value={s.yLegendPosition} options={['start', 'middle', 'end'] as const} onChange={v => set('yLegendPosition', v)} /></Row>
                <Row label="Y offset"><SliderControl value={s.yLegendOffset} min={-80} max={80} onChange={v => set('yLegendOffset', v)} /></Row>
            </Section>

            <Section title="Ticks">
                <Row label="X angle"><SliderControl value={s.xTickRotation} min={-90} max={90} unit="°" onChange={v => set('xTickRotation', v)} /></Row>
                <Row label="Y angle"><SliderControl value={s.yTickRotation} min={-90} max={90} unit="°" onChange={v => set('yTickRotation', v)} /></Row>
                <Row label="Truncate"><SliderControl value={s.tickTruncate} min={0} max={40} onChange={v => set('tickTruncate', v)} /></Row>
            </Section>

            <Section title="Panel title">
                <Row label="Align"><Choice value={s.titleAlign} options={['left', 'center', 'right'] as const} onChange={v => set('titleAlign', v)} /></Row>
                <Row label="Bold"><Switch value={s.titleBold} onChange={v => set('titleBold', v)} /></Row>
                <Row label="Color"><OptionalColor value={s.titleColor} onChange={v => set('titleColor', v)} fallback="#e2e8f0" /></Row>
                <Row label="Background"><OptionalColor value={s.titleBackground} onChange={v => set('titleBackground', v)} fallback="#1e293b" /></Row>
            </Section>

            <Section title="Series legend">
                <Row label="Position"><Choice value={s.legendAnchor} options={['right', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'none'] as const} onChange={v => set('legendAnchor', v)} /></Row>
            </Section>
        </div>
    );
}

export default ChartStyleControls;
