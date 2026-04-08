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
  it('formats a clean branch with no ahead/behind', () => {
    const info: GitInfo = { branch: 'main', dirty: false, ahead: 0, behind: 0 };
    const mod = formatGitModule(info);
    expect(mod.ansi).toContain('\x1b[34m'); // blue branch
    expect(mod.ansi).toContain('main');
    expect(mod.ansi).not.toContain('*');
    expect(mod.ansi).not.toContain('↑');
    expect(mod.ansi).not.toContain('↓');
    expect(mod.width).toBe(4); // "main"
  });

  it('shows dirty indicator when dirty', () => {
    const info: GitInfo = { branch: 'main', dirty: true, ahead: 0, behind: 0 };
    const mod = formatGitModule(info);
    expect(mod.ansi).toContain('\x1b[33m*\x1b[0m'); // yellow asterisk
    expect(mod.width).toBe(5); // "main*"
  });

  it('shows ahead count', () => {
    const info: GitInfo = { branch: 'feat', dirty: false, ahead: 3, behind: 0 };
    const mod = formatGitModule(info);
    expect(mod.ansi).toContain('\x1b[32m↑3\x1b[0m'); // green up arrow
    expect(mod.width).toBe('feat ↑3'.length);
  });

  it('shows behind count', () => {
    const info: GitInfo = { branch: 'feat', dirty: false, ahead: 0, behind: 2 };
    const mod = formatGitModule(info);
    expect(mod.ansi).toContain('\x1b[31m↓2\x1b[0m'); // red down arrow
    expect(mod.width).toBe('feat ↓2'.length);
  });

  it('shows all indicators together', () => {
    const info: GitInfo = { branch: 'dev', dirty: true, ahead: 1, behind: 5 };
    const mod = formatGitModule(info);
    expect(mod.ansi).toContain('dev');
    expect(mod.ansi).toContain('*');
    expect(mod.ansi).toContain('↑1');
    expect(mod.ansi).toContain('↓5');
    // "dev* ↑1 ↓5"
    expect(mod.width).toBe('dev* ↑1 ↓5'.length);
  });
});
