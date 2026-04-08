import { execSync } from 'child_process';
import os from 'os';
import { visibleLen } from './hud-utils.js';

export interface MemoryInfo {
  usedGB: number;
  totalGB: number;
  percent: number;
}

export function getMemoryUsage(): MemoryInfo | null {
  try {
    const totalBytes = os.totalmem();

    if (process.platform === 'darwin') {
      const vmstat = execSync('vm_stat', { encoding: 'utf-8' });

      // Parse page size (e.g. "Mach Virtual Memory Statistics: (page size of 16384 bytes)")
      const pageSizeMatch = vmstat.match(/page size of (\d+) bytes/);
      const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 16384;

      const parse = (label: string): number => {
        const re = new RegExp(`${label}:\\s+(\\d+)`);
        const m = vmstat.match(re);
        return m ? parseInt(m[1], 10) : 0;
      };

      const free = parse('Pages free');
      const inactive = parse('Pages inactive');
      const speculative = parse('Pages speculative');

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
  } catch {
    return null;
  }
}

export function formatMemoryModule(info: MemoryInfo): { ansi: string; width: number } {
  let color: string;
  if (info.percent > 90) {
    color = '\x1b[31m'; // red
  } else if (info.percent > 70) {
    color = '\x1b[33m'; // yellow
  } else {
    color = '\x1b[32m'; // green
  }

  const ansi = `${color}Mem: ${info.percent}% (${info.usedGB.toFixed(1)}/${info.totalGB.toFixed(1)}GB)\x1b[0m`;
  return { ansi, width: visibleLen(ansi) };
}
