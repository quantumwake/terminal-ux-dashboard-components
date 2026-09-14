import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// @testing-library/react's auto-cleanup registers itself via the global
// afterEach — which we don't enable (see vitest.config.ts: globals: false,
// to keep `tsc --noEmit` clean without a vitest/globals types dependency).
// Unmount explicitly after every test instead.
afterEach(cleanup);
