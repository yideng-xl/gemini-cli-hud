import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HUDManager } from './HUDManager';

describe('HUDManager', () => {
  it('should initialize with default state', () => {
    const manager = new HUDManager({ model: 'test-model', workspace: 'test-ws' });
    expect(manager.getHUDState().tokens.used).toBe(0);
  });

  it('should update state when processing events', () => {
    const manager = new HUDManager({ model: 'test-model', workspace: 'test-ws' });
    manager.processEvent({ type: 'usage', usedTokens: 100, totalTokens: 1000 });
    expect(manager.getHUDState().tokens.used).toBe(100);
  });
});
