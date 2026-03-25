import { describe, it, expect } from 'vitest';
import { action } from './index.js';

describe('Extension entry point', () => {
  it('should export an action function', () => {
    expect(typeof action).toBe('function');
  });

  it('should return continue: true from action', async () => {
    const mockArgs = {
      gemini: {
        ui: {
          statusLine: {
            draw: () => {}
          }
        }
      }
    };
    const result = await action(mockArgs);
    expect(result).toEqual({ continue: true });
  });
});
