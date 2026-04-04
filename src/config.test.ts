import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { loadConfig, DEFAULT_CONFIG, getConfigPath } from './config.js';

// Mock fs for isolated testing
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('loadConfig', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns defaults when no config file exists', () => {
    const config = loadConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('applies preset to set modules and display', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      preset: 'minimal',
    }));

    const config = loadConfig();
    expect(config.preset).toBe('minimal');
    expect(config.modules).toEqual(['model', 'context', 'session']);
    expect(config.display.showTools).toBe(false);
    expect(config.display.showCost).toBe(false);
    expect(config.display.showModel).toBe(true);
  });

  it('applies essential preset', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      preset: 'essential',
    }));

    const config = loadConfig();
    expect(config.modules).toEqual(['model', 'context', 'tools', 'session']);
    expect(config.display.showMeta).toBe(false);
    expect(config.display.showCost).toBe(false);
    expect(config.display.showTools).toBe(true);
  });

  it('overrides modules array explicitly', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      modules: ['model', 'context', 'cost'],
    }));

    const config = loadConfig();
    expect(config.modules).toEqual(['model', 'context', 'cost']);
  });

  it('filters out invalid module names', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      modules: ['model', 'invalid', 'context', 123],
    }));

    const config = loadConfig();
    expect(config.modules).toEqual(['model', 'context']);
  });

  it('overrides individual display flags', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      display: {
        showCost: false,
        showTokenRate: false,
      },
    }));

    const config = loadConfig();
    expect(config.display.showCost).toBe(false);
    expect(config.display.showTokenRate).toBe(false);
    // Other flags remain default
    expect(config.display.showModel).toBe(true);
    expect(config.display.showTools).toBe(true);
  });

  it('preset + display override works together', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      preset: 'minimal',
      display: { showCost: true },
    }));

    const config = loadConfig();
    // minimal turns off cost, but explicit override turns it back on
    expect(config.display.showCost).toBe(true);
    expect(config.display.showTools).toBe(false); // still minimal
  });

  it('sets language', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      language: 'zh',
    }));

    const config = loadConfig();
    expect(config.language).toBe('zh');
  });

  it('ignores invalid language', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      language: 'fr',
    }));

    const config = loadConfig();
    expect(config.language).toBe('en');
  });

  it('handles malformed JSON gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('not json{{{');

    const config = loadConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('ignores invalid preset', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      preset: 'ultra',
    }));

    const config = loadConfig();
    expect(config.preset).toBe('full'); // default
  });
});
