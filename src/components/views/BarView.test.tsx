import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// ResponsiveBar wraps its SVG rendering in a ResizeObserver-driven
// container — not meaningful to exercise in jsdom, and not what needs
// covering here. Stub it with a component that surfaces the props that
// carry the value formatter: the value axis's .format (the tick label)
// and valueFormat (Nivo's tooltip + in-bar label formatter).
vi.mock('@nivo/bar', () => ({
    ResponsiveBar: (props: {
        axisLeft?: { format?: (v: unknown) => string } | null;
        axisBottom?: { format?: (v: unknown) => string } | null;
        valueFormat?: (v: unknown) => string;
    }) => (
        <div>
            <span data-testid="left-tick">{props.axisLeft?.format ? props.axisLeft.format(1536) : ''}</span>
            <span data-testid="bottom-tick">{props.axisBottom?.format ? props.axisBottom.format(1536) : ''}</span>
            <span data-testid="tooltip">{props.valueFormat ? props.valueFormat(1536) : ''}</span>
        </div>
    ),
}));

import { BarView } from './BarView';
import { formatBytes } from '../../format';

const data = [{ group: 'a', value: 1024 }, { group: 'b', value: 1536 }];

describe('BarView yFormat', () => {
    it('vertical (default): defaults the left (value) axis tick to toLocaleString() and leaves the tooltip/label unwired (unchanged)', () => {
        render(<BarView data={data} groupColumn="group" valueColumn="value" style={{ tickWrap: false }} />);
        expect(screen.getByTestId('left-tick')).toHaveTextContent((1536).toLocaleString());
        expect(screen.getByTestId('tooltip')).toHaveTextContent('');
    });

    it('vertical: applies a custom yFormat to the left (value) axis tick and the tooltip', () => {
        render(<BarView data={data} groupColumn="group" valueColumn="value" style={{ tickWrap: false }} yFormat={formatBytes} />);
        expect(screen.getByTestId('left-tick')).toHaveTextContent(formatBytes(1536));
        expect(screen.getByTestId('tooltip')).toHaveTextContent(formatBytes(1536));
    });

    it('horizontal: the value axis moves to the bottom — yFormat follows it there', () => {
        render(
            <BarView
                data={data}
                groupColumn="group"
                valueColumn="value"
                layout="horizontal"
                style={{ tickWrap: false }}
                yFormat={formatBytes}
            />,
        );
        expect(screen.getByTestId('bottom-tick')).toHaveTextContent(formatBytes(1536));
        expect(screen.getByTestId('tooltip')).toHaveTextContent(formatBytes(1536));
    });
});
