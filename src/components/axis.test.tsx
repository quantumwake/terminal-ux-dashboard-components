import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { makeAxis } from './axis';
import { formatBytes } from '../format';

// makeAxis has two code paths for a numeric axis's tick text: a plain
// `format` function (tickWrap: false) and a `renderTick` React renderer
// (tickWrap: true, the library default) that wraps the same formatted
// string onto <tspan> lines. Both must honor a custom `format` opt (a
// view's yFormat prop) the same way they honor the default toLocaleString().

describe('makeAxis numeric format opt', () => {
    it('format path: defaults to toLocaleString()', () => {
        const axis = makeAxis({ tickWrap: false }, 'y', 'col', { numeric: true });
        expect(axis.format(1536)).toBe((1536).toLocaleString());
    });

    it('format path: a custom format opt overrides the default', () => {
        const axis = makeAxis({ tickWrap: false }, 'y', 'col', { numeric: true, format: (v: unknown) => formatBytes(Number(v)) });
        expect(axis.format(1536)).toBe(formatBytes(1536));
    });

    it('renderTick path (tickWrap default on): a custom format opt reaches the wrapped tick text', () => {
        const axis = makeAxis({ tickWrap: true, tickWrapWidth: 40 }, 'y', 'col', { numeric: true, format: (v: unknown) => formatBytes(Number(v)) });
        const tick = axis.renderTick({ x: 0, y: 0, value: 1536, textX: 0, textY: 0, textAnchor: 'middle', textBaseline: 'central' });
        const { container } = render(<svg>{tick}</svg>);
        expect(container.textContent).toBe(formatBytes(1536));
    });

    it('renderTick path: defaults to toLocaleString() when no format opt is given', () => {
        const axis = makeAxis({ tickWrap: true, tickWrapWidth: 40 }, 'y', 'col', { numeric: true });
        const tick = axis.renderTick({ x: 0, y: 0, value: 1536, textX: 0, textY: 0, textAnchor: 'middle', textBaseline: 'central' });
        const { container } = render(<svg>{tick}</svg>);
        expect(container.textContent).toBe((1536).toLocaleString());
    });
});
