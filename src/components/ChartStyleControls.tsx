import { type ReactNode } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { withStyleDefaults } from '../chartStyle';
import type { ChartStyle } from '../chartStyle';

// A single labelled control row — fixed label column + control, so every row in
// the panel lines up on the same grid (consistent spacing/alignment).
interface RowProps {
    label: string;
    children: ReactNode;
}

function Row({ label, children }: RowProps) {
    const { theme } = useDashboard();
    return (
        <div className="flex items-center justify-between gap-3 min-h-[28px]">
            <span className={`text-xs ${theme.font} text-midnight-text-muted`}>{label}</span>
            <div className="flex items-center">{children}</div>
        </div>
    );
}

interface ColorControlProps {
    value: string;
    onChange: (value: string) => void;
}

function ColorControl({ value, onChange }: ColorControlProps) {
    const { theme } = useDashboard();
    return (
        <input type="color" value={/^#/.test(value) ? value : '#94a3b8'} onChange={e => onChange(e.target.value)}
            className={`w-9 h-6 bg-transparent border ${theme.border} cursor-pointer`} />
    );
}

interface NumberControlProps {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
}

function NumberControl({ value, onChange, min, max }: NumberControlProps) {
    const { theme } = useDashboard();
    return (
        <input type="number" value={value} min={min} max={max} onChange={e => onChange(Number(e.target.value))}
            className={`w-20 px-2 py-1 text-xs ${theme.font} bg-midnight-surface border ${theme.border} text-midnight-text-body outline-none focus:border-midnight-accent`} />
    );
}

interface ChoiceProps<T extends string> {
    value: T;
    options: readonly T[];
    onChange: (value: T) => void;
}

// Themed native <select> for a simple string-option choice. (Replaces the
// host-coupled TerminalDropdown so the component stays host-agnostic.)
function Choice<T extends string>({ value, options, onChange }: ChoiceProps<T>) {
    const { theme } = useDashboard();
    return (
        <div className="w-28">
            <select value={value} onChange={e => onChange(e.target.value as T)}
                className={`w-full px-2 py-1 text-xs ${theme.font} bg-midnight-surface border ${theme.border} text-midnight-text-body outline-none focus:border-midnight-accent`}>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        </div>
    );
}

interface GroupProps {
    children: ReactNode;
    last?: boolean;
}

function Group({ children, last }: GroupProps) {
    const { theme } = useDashboard();
    return <div className={`space-y-2 pb-3 ${last ? '' : `mb-3 border-b ${theme.border}`}`}>{children}</div>;
}

export interface ChartStyleControlsProps {
    style?: Partial<ChartStyle> | null;
    onChange: (next: ChartStyle) => void;
}

/**
 * ChartStyleControls — the standardized appearance editor used across all
 * charts. Edits a plain style object (see chartStyle.ts); theme-aware via the
 * host-injected DashboardContext theme. Parent persists the style and passes it
 * to the views.
 */
export function ChartStyleControls({ style, onChange }: ChartStyleControlsProps) {
    const s = withStyleDefaults(style);
    const set = <K extends keyof ChartStyle>(key: K, value: ChartStyle[K]) => onChange({ ...s, [key]: value });

    return (
        <div>
            <Group>
                <Row label="Background"><ColorControl value={s.background} onChange={v => set('background', v)} /></Row>
                <Row label="Text color"><ColorControl value={s.textColor} onChange={v => set('textColor', v)} /></Row>
                <Row label="Title color"><ColorControl value={s.legendColor} onChange={v => set('legendColor', v)} /></Row>
                <Row label="Grid color"><ColorControl value={s.gridColor} onChange={v => set('gridColor', v)} /></Row>
                <Row label="Font size"><NumberControl value={s.fontSize} min={6} max={24} onChange={v => set('fontSize', v)} /></Row>
            </Group>

            <Group>
                <Row label="X title pos"><Choice value={s.xLegendPosition} options={['start', 'middle', 'end'] as const} onChange={v => set('xLegendPosition', v)} /></Row>
                <Row label="X title offset"><NumberControl value={s.xLegendOffset} onChange={v => set('xLegendOffset', v)} /></Row>
                <Row label="Y title pos"><Choice value={s.yLegendPosition} options={['start', 'middle', 'end'] as const} onChange={v => set('yLegendPosition', v)} /></Row>
                <Row label="Y title offset"><NumberControl value={s.yLegendOffset} onChange={v => set('yLegendOffset', v)} /></Row>
            </Group>

            <Group last>
                <Row label="Legend"><Choice value={s.legendAnchor} options={['right', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'none'] as const} onChange={v => set('legendAnchor', v)} /></Row>
                <Row label="Title align"><Choice value={s.titleAlign} options={['left', 'center', 'right'] as const} onChange={v => set('titleAlign', v)} /></Row>
            </Group>
        </div>
    );
}

export default ChartStyleControls;
