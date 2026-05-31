import { describe, it, expect, vi, afterEach } from 'vitest';
import { navGuard } from './navGuard.js';

afterEach(() => {
  vi.restoreAllMocks();
  // Ensure no guard leaks between tests.
  navGuard.register(() => false)();
});

describe('navGuard', () => {
  it('allows navigation when no guard is registered', () => {
    expect(navGuard.confirmLeave()).toBe(true);
  });

  it('allows navigation when the guard reports not blocked', () => {
    const confirm = vi.spyOn(window, 'confirm');
    const unregister = navGuard.register(() => false);
    expect(navGuard.confirmLeave()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    unregister();
  });

  it('confirms with the user when the guard reports blocked', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const unregister = navGuard.register(() => true);
    expect(navGuard.confirmLeave()).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
    unregister();
  });

  it('blocks navigation when the user declines the confirm', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const unregister = navGuard.register(() => true);
    expect(navGuard.confirmLeave()).toBe(false);
    unregister();
  });

  it('stops consulting a predicate once unregistered', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const unregister = navGuard.register(() => true);
    unregister();
    expect(navGuard.confirmLeave()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
