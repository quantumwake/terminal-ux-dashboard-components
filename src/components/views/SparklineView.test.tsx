import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SparklineView } from './SparklineView';
import { formatBytes } from '../../format';

describe('SparklineView value readout', () => {
    it('defaults to locale formatting', () => {
        render(<SparklineView data={[1024, 1536]} showValue />);
        expect(screen.getByText((1536).toLocaleString(undefined, { maximumFractionDigits: 1 }))).toBeInTheDocument();
    });

    it('applies yFormat to the latest-value readout', () => {
        render(<SparklineView data={[1024, 1536]} showValue yFormat={formatBytes} />);
        expect(screen.getByText(formatBytes(1536))).toBeInTheDocument();
    });

    it('format still wins when both format and yFormat are given', () => {
        render(<SparklineView data={[1024, 1536]} showValue format={() => 'FORMAT'} yFormat={() => 'YFORMAT'} />);
        expect(screen.getByText('FORMAT')).toBeInTheDocument();
    });
});
