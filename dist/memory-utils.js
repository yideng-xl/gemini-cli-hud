/**
 * Gemini CLI HUD — System memory monitoring
 *
 * Reads system memory usage via macOS vm_stat with cross-platform fallback.
 */
import { execSync } from 'child_process';
import os from 'os';
import { visibleLen } from './hud-utils.js';
export function getMemoryUsage() {
    try {
        const totalBytes = os.totalmem();
        if (process.platform === 'darwin') {
            const vmstat = execSync('vm_stat', { encoding: 'utf-8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] });
            // Parse page size (e.g. "Mach Virtual Memory Statistics: (page size of 16384 bytes)")
            const pageSizeMatch = vmstat.match(/page size of (\d+) bytes/);
            const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 16384;
            const parse = (label) => {
                const re = new RegExp(`${label}:\\s+(\\d+)`);
                const m = vmstat.match(re);
                return m ? parseInt(m[1], 10) : 0;
            };
            const free = parse('Pages free');
            const inactive = parse('Pages inactive');
            const speculative = parse('Pages speculative');
            // "used" = total minus reclaimable pages (free + inactive + speculative).
            // Wired pages are implicitly counted. Approximates memory pressure
            // rather than matching Activity Monitor's active+wired+compressed.
            const freeBytes = (free + inactive + speculative) * pageSize;
            const usedBytes = totalBytes - freeBytes;
            const usedGB = Math.round((usedBytes / 1073741824) * 10) / 10;
            const totalGB = Math.round((totalBytes / 1073741824) * 10) / 10;
            const percent = Math.round((usedBytes / totalBytes) * 100);
            return { usedGB, totalGB, percent };
        }
        // Fallback for non-macOS
        const freeBytes = os.freemem();
        const usedBytes = totalBytes - freeBytes;
        const usedGB = Math.round((usedBytes / 1073741824) * 10) / 10;
        const totalGB = Math.round((totalBytes / 1073741824) * 10) / 10;
        const percent = Math.round((usedBytes / totalBytes) * 100);
        return { usedGB, totalGB, percent };
    }
    catch {
        return null;
    }
}
export function formatMemoryModule(info) {
    let color;
    if (info.percent > 90) {
        color = '\x1b[31m'; // red
    }
    else if (info.percent > 70) {
        color = '\x1b[33m'; // yellow
    }
    else {
        color = '\x1b[32m'; // green
    }
    const ansi = `${color}Mem: ${info.percent}% (${info.usedGB.toFixed(1)}/${info.totalGB.toFixed(1)}GB)\x1b[0m`;
    return { ansi, width: visibleLen(ansi) };
}
