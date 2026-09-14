import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// ResponsiveLine wraps its SVG rendering in a ResizeObserver-driven
// container — not meaningful to exercise in jsdom, and not what needs
// covering here. Stub it with a component that surfaces the two props
// that actually carry the y-axis formatter: axisLeft.format (the tick
// label) and yFormat (Nivo's tooltip/crosshair value formatter).
vi.mock('@nivo/line', () => ({
    ResponsiveLine: (props: { axisLeft?: { format?: (v: unknown) => string }; yFormat?: (v: unknown) => string }) => (
        <div>
            <span data-testid="tick">{props.axisLeft?.format ? props.axisLeft.format(1536) : ''}</span>
            <span data-testid="tooltip">{props.yFormat ? props.yFormat(1536) : ''}</span>
        </div>
    ),
}));

import { LineView } from './LineView';
import { formatBytes } from '../../format';

const data = [{ id: 'bytes', data: [{ x: 'a', y: 1024 }, { x: 'b', y: 1536 }] }];

describe('LineView yFormat', () => {
    it('defaults the tick to Number(value).toLocaleString() and leaves the tooltip unwired (unchanged from before yFormat existed)', () => {
        render(<LineView data={data} xColumn="x" yColumn="y" style={{ tickWrap: false }} />);
        expect(screen.getByTestId('tick')).toHaveTextContent((1536).toLocaleString());
        expect(screen.getByTestId('tooltip')).toHaveTextContent('');
    });

    it('applies a custom yFormat to both the y-axis tick and the tooltip', () => {
        render(<LineView data={data} xColumn="x" yColumn="y" style={{ tickWrap: false }} yFormat={formatBytes} />);
        expect(screen.getByTestId('tick')).toHaveTextContent(formatBytes(1536));
        expect(screen.getByTestId('tooltip')).toHaveTextContent(formatBytes(1536));
    });
});
