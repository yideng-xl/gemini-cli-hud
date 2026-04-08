/**
 * Gemini CLI HUD — Git status detection utilities
 *
 * Detects branch, dirty state, and ahead/behind counts for the HUD.
 */

import { execSync } from 'child_process';
import { visibleLen } from './hud-utils.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GitInfo {
  branch: string;
  dirty: boolean;
  ahead: number;
  behind: number;
}

// ─── Git status detection ───────────────────────────────────────────────────

const EXEC_OPTS = { timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'] };

export function parseGitStatus(cwd: string): GitInfo | null {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { ...EXEC_OPTS, cwd })
      .toString()
      .trim();

    const porcelain = execSync('git status --porcelain', { ...EXEC_OPTS, cwd })
      .toString();
    const dirty = porcelain.length > 0;

    let ahead = 0;
    let behind = 0;
    try {
      const counts = execSync('git rev-list --left-right --count HEAD...@{upstream}', { ...EXEC_OPTS, cwd })
        .toString()
        .trim();
      const parts = counts.split(/\s+/);
      ahead = parseInt(parts[0], 10) || 0;
      behind = parseInt(parts[1], 10) || 0;
    } catch {
      // No upstream configured — ahead/behind stay 0
    }

    return { branch, dirty, ahead, behind };
  } catch {
    return null;
  }
}

// ─── Formatting ─────────────────────────────────────────────────────────────

export function formatGitModule(info: GitInfo): { ansi: string; width: number } {
  // oh-my-zsh style: git:(main*) ↑3 ↓1
  const branch = info.branch + (info.dirty ? '*' : '');
  let ansi = `\x1b[34mgit:(\x1b[31m${branch}\x1b[34m)\x1b[0m`;

  if (info.ahead > 0) {
    ansi += ` \x1b[32m↑${info.ahead}\x1b[0m`;
  }

  if (info.behind > 0) {
    ansi += ` \x1b[31m↓${info.behind}\x1b[0m`;
  }

  return { ansi, width: visibleLen(ansi) };
}
