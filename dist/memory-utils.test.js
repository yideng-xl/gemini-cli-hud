import { describe, it, expect } from 'vitest';
import { getMemoryUsage, formatMemoryModule } from './memory-utils.js';
// ─── getMemoryUsage ─────────────────────────────────────────────────────────
describe('getMemoryUsage', () => {
    it('returns non-null on macOS with valid fields', () => {
        if (process.platform !== 'darwin')
            return;
        const info = getMemoryUsage();
        expect(info).not.toBeNull();
        expect(info.usedGB).toBeGreaterThan(0);
        expect(info.totalGB).toBeGreaterThan(0);
        expect(info.percent).toBeGreaterThanOrEqual(0);
        expect(info.percent).toBeLessThanOrEqual(100);
    });
    it('returns usedGB <= totalGB', () => {
        const info = getMemoryUsage();
        if (!info)
            return;
        expect(info.usedGB).toBeLessThanOrEqual(info.totalGB);
    });
});
// ─── formatMemoryModule ─────────────────────────────────────────────────────
describe('formatMemoryModule', () => {
    it('uses green for percent <= 70', () => {
        const info = { usedGB: 5.6, totalGB: 16.0, percent: 35 };
        const mod = formatMemoryModule(info);
        expect(mod.ansi).toContain('\x1b[32m'); // green
        expect(mod.ansi).not.toContain('\x1b[33m');
        expect(mod.ansi).not.toContain('\x1b[31m');
    });
    it('uses yellow for percent > 70', () => {
        const info = { usedGB: 12.3, totalGB: 16.0, percent: 77 };
        const mod = formatMemoryModule(info);
        expect(mod.ansi).toContain('\x1b[33m'); // yellow
        expect(mod.ansi).not.toContain('\x1b[31m');
    });
    it('uses red for percent > 90', () => {
        const info = { usedGB: 15.0, totalGB: 16.0, percent: 94 };
        const mod = formatMemoryModule(info);
        expect(mod.ansi).toContain('\x1b[31m'); // red
    });
    it('formats output string correctly', () => {
        const info = { usedGB: 12.3, totalGB: 16.0, percent: 77 };
        const mod = formatMemoryModule(info);
        // Should contain the readable text
        expect(mod.ansi).toContain('Mem:');
        expect(mod.ansi).toContain('77%');
        expect(mod.ansi).toContain('12.3/16.0GB');
    });
    it('calculates width matching visible characters', () => {
        const info = { usedGB: 12.3, totalGB: 16.0, percent: 77 };
        const mod = formatMemoryModule(info);
        // Width should equal the length of text without ANSI codes
        const stripped = mod.ansi.replace(/\x1b\[[0-9;]*m/g, '');
        expect(mod.width).toBe(stripped.length);
    });
});
