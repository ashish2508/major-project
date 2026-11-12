import { afterEach, vi } from 'vitest';

// Reset all mocks after each test to prevent cross-test pollution
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
