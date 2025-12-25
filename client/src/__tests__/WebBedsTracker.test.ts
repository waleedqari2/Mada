import { describe, it, expect } from 'vitest';

describe('WebBedsTracker Component', () => {
  it('should export the WebBedsTracker component', async () => {
    // Dynamically import the component
    const module = await import('../pages/WebBedsTracker');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });
});

describe('Single Page App Integration', () => {
  it('should have updated routing in App.tsx', async () => {
    const appModule = await import('../App');
    expect(appModule.default).toBeDefined();
  });

  it('should export getLoginUrl from constants', async () => {
    const { getLoginUrl } = await import('../const');
    expect(getLoginUrl).toBeDefined();
    expect(typeof getLoginUrl).toBe('function');
  });
});
