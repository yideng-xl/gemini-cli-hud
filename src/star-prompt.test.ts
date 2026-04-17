import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import {
  loadStarState,
  saveStarState,
  recordSession,
  markPrompted,
  shouldShowStarPrompt,
  renderStarPrompt,
  SESSION_THRESHOLD,
  type StarState,
} from './star-prompt.js';

vi.mock('fs');

beforeEach(() => {
  vi.resetAllMocks();
});

describe('loadStarState', () => {
  it('should return defaults when no file exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const state = loadStarState();
    expect(state).toEqual({ sessionCount: 0, prompted: false });
  });

  it('should parse existing state file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ sessionCount: 3, prompted: false }),
    );
    const state = loadStarState();
    expect(state.sessionCount).toBe(3);
    expect(state.prompted).toBe(false);
  });

  it('should handle corrupt JSON gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('not json!!!');
    const state = loadStarState();
    expect(state).toEqual({ sessionCount: 0, prompted: false });
  });

  it('should handle missing fields gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ foo: 'bar' }));
    const state = loadStarState();
    expect(state).toEqual({ sessionCount: 0, prompted: false });
  });
});

describe('saveStarState', () => {
  it('should write state as JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    saveStarState({ sessionCount: 5, prompted: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('hud-star.json'),
      expect.stringContaining('"sessionCount": 5'),
    );
  });

  it('should create directory if missing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    saveStarState({ sessionCount: 1, prompted: false });
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.any(String),
      { recursive: true },
    );
  });
});

describe('shouldShowStarPrompt', () => {
  it('should return false when below threshold', () => {
    expect(shouldShowStarPrompt({ sessionCount: 2, prompted: false })).toBe(false);
  });

  it('should return true at threshold', () => {
    expect(shouldShowStarPrompt({ sessionCount: SESSION_THRESHOLD, prompted: false })).toBe(true);
  });

  it('should return true above threshold if not prompted', () => {
    expect(shouldShowStarPrompt({ sessionCount: 10, prompted: false })).toBe(true);
  });

  it('should return false if already prompted', () => {
    expect(shouldShowStarPrompt({ sessionCount: 10, prompted: true })).toBe(false);
  });
});

describe('renderStarPrompt', () => {
  it('should return null when below threshold', () => {
    const result = renderStarPrompt({ sessionCount: 1, prompted: false });
    expect(result).toBeNull();
  });

  it('should return null when already prompted', () => {
    const result = renderStarPrompt({ sessionCount: 10, prompted: true });
    expect(result).toBeNull();
  });

  it('should render English prompt at threshold', () => {
    const result = renderStarPrompt({ sessionCount: SESSION_THRESHOLD, prompted: false }, 'en', 120);
    expect(result).not.toBeNull();
    expect(result).toContain('Enjoying gemini-cli-hud');
    expect(result).toContain('github.com');
    expect(result).toContain('⭐');
  });

  it('should render Chinese prompt', () => {
    const result = renderStarPrompt({ sessionCount: SESSION_THRESHOLD, prompted: false }, 'zh', 120);
    expect(result).not.toBeNull();
    expect(result).toContain('喜欢 gemini-cli-hud');
    expect(result).toContain('⭐');
  });
});

describe('recordSession', () => {
  it('should increment session count', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ sessionCount: 4, prompted: false }),
    );
    const state = recordSession();
    expect(state.sessionCount).toBe(5);
  });
});

describe('markPrompted', () => {
  it('should set prompted to true', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ sessionCount: 5, prompted: false }),
    );
    markPrompted();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('"prompted": true'),
    );
  });
});
