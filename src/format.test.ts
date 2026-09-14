import { describe, it, expect } from 'vitest';
import { formatBytes } from './format';

describe('formatBytes', () => {
    it('renders sub-KB values as whole bytes', () => {
        expect(formatBytes(999)).toBe('999 B');
    });

    it('renders exactly 1024 bytes as 1.0 KB', () => {
        expect(formatBytes(1024)).toBe('1.0 KB');
    });

    it('renders 1.5 MB with one decimal', () => {
        expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    });

    it('appends /s for a per-second byte rate', () => {
        expect(formatBytes(2 * 1024 * 1024 * 1024, true)).toBe('2.0 GB/s');
    });

    it('caps at TB — does not roll over to PB', () => {
        expect(formatBytes(1536 * 1024 ** 4)).toBe('1536.0 TB');
    });

    it('rounds sub-KB values to the nearest whole byte', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(512.6)).toBe('513 B');
    });

    it('preserves sign for negative deltas', () => {
        expect(formatBytes(-2048)).toBe('-2.0 KB');
    });
});
