import { describe, it, expect } from 'vitest';
import init from './index.js';

describe('Extension entry point', () => {
  it('should export a default init function', () => {
    expect(typeof init).toBe('function');
  });

  it('should return an action function from init', () => {
    const extension = init();
    expect(typeof extension.action).toBe('function');
  });

  it('should return continue: true from action', async () => {
    const extension = init();
    const mockArgs = {
      gemini: {
        ui: {
          statusLine: {
            draw: () => {}
          }
        }
      }
    };
    const result = await extension.action(mockArgs);
    expect(result).toEqual({ continue: true });
  });
});
