import { describe, it, expect } from 'vitest';
import { parseGitStatus, formatGitModule, type GitInfo } from './git-utils.js';

// ─── parseGitStatus ─────────────────────────────────────────────────────────

describe('parseGitStatus', () => {
  it('returns GitInfo for a real git repo', () => {
    const info = parseGitStatus(process.cwd());
    expect(info).not.toBeNull();
    expect(info!.branch).toBeTypeOf('string');
    expect(info!.branch.length).toBeGreaterThan(0);
    expect(info!.dirty).toBeTypeOf('boolean');
    expect(info!.ahead).toBeTypeOf('number');
    expect(info!.behind).toBeTypeOf('number');
    expect(info!.ahead).toBeGreaterThanOrEqual(0);
    expect(info!.behind).toBeGreaterThanOrEqual(0);
  });

  it('returns null for a non-repo path', () => {
    const info = parseGitStatus('/tmp');
    expect(info).toBeNull();
  });
});

// ─── formatGitModule ────────────────────────────────────────────────────────

describe('formatGitModule', () => {
  it('formats clean branch in git:(branch) style', () => {
    const info: GitInfo = { branch: 'main', dirty: false, ahead: 0, behind: 0 };
    const mod = formatGitModule(info);
    expect(mod.ansi).toContain('git:(');
    expect(mod.ansi).toContain('main');
    expect(mod.ansi).toContain(')');
    expect(mod.ansi).not.toContain('*');
    expect(mod.width).toBe('git:(main)'.length);
  });

  it('shows dirty indicator inside parentheses', () => {
    const info: GitInfo = { branch: 'main', dirty: true, ahead: 0, behind: 0 };
    const mod = formatGitModule(info);
    expect(mod.ansi).toContain('main*');
    expect(mod.width).toBe('git:(main*)'.length);
  });

  it('shows ahead count after parentheses', () => {
    const info: GitInfo = { branch: 'feat', dirty: false, ahead: 3, behind: 0 };
    const mod = formatGitModule(info);
    expect(mod.ansi).toContain('git:(');
    expect(mod.ansi).toContain('↑3');
    expect(mod.width).toBe('git:(feat) ↑3'.length);
  });

  it('shows behind count', () => {
    const info: GitInfo = { branch: 'feat', dirty: false, ahead: 0, behind: 2 };
    const mod = formatGitModule(info);
    expect(mod.ansi).toContain('↓2');
    expect(mod.width).toBe('git:(feat) ↓2'.length);
  });

  it('shows all indicators together', () => {
    const info: GitInfo = { branch: 'dev', dirty: true, ahead: 1, behind: 5 };
    const mod = formatGitModule(info);
    expect(mod.ansi).toContain('git:(');
    expect(mod.ansi).toContain('dev*');
    expect(mod.ansi).toContain('↑1');
    expect(mod.ansi).toContain('↓5');
    expect(mod.width).toBe('git:(dev*) ↑1 ↓5'.length);
  });
});
