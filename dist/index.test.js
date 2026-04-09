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
    it('should return continue: true when no statusLine API', async () => {
        const extension = init();
        const result = await extension.action({});
        expect(result).toEqual({ continue: true });
    });
    it('should call statusLine.draw when API is available', async () => {
        const extension = init();
        let drawn = '';
        const result = await extension.action({
            gemini: { ui: { statusLine: { draw: (s) => { drawn = s; } } } },
            usageMetadata: { totalTokenCount: 50000 },
        });
        expect(result).toEqual({ continue: true });
        expect(drawn).toContain('Context:');
        expect(drawn).toContain('5%');
    });
});
