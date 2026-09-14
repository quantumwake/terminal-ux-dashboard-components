import { describe, it, expect } from 'vitest';
import { formatBytes } from './format';

describe('formatBytes', () => {
    it('renders sub-KB values as whole bytes', () => {
        expect(formatBytes(999)).toBe('999 B');
    });

    it('renders exactly 1000 bytes as 1.0 KB', () => {
        expect(formatBytes(1000)).toBe('1.0 KB');
    });

    it('renders 1.5 MB with one decimal', () => {
        expect(formatBytes(1500000)).toBe('1.5 MB');
    });

    it('appends /s for a per-second byte rate', () => {
        expect(formatBytes(2 * 1000 * 1000 * 1000, true)).toBe('2.0 GB/s');
    });

    it('rolls over to PB above 1000 TB', () => {
        expect(formatBytes(1.5 * 1000 ** 5)).toBe('1.5 PB');
    });

    it('rounds sub-KB values to the nearest whole byte', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(512.6)).toBe('513 B');
    });

    it('preserves sign for negative deltas', () => {
        expect(formatBytes(-2000)).toBe('-2.0 KB');
    });
});
