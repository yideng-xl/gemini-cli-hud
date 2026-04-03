import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatTokens,
  formatTokenRate,
  formatCost,
  formatElapsed,
  visibleLen,
  createProgressBar,
  buildSeparator,
  buildTitle,
  getContextSize,
  getModelPricing,
  estimateCost,
  packModulesIntoLines,
  processEvent,
  createInitialState,
  type HUDState,
} from './hud-utils.js';

// ─── formatTokens ───────────────────────────────────────────────────────────

describe('formatTokens', () => {
  it('returns raw number for < 1000', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(500)).toBe('500');
    expect(formatTokens(999)).toBe('999');
  });

  it('returns K for >= 1000', () => {
    expect(formatTokens(1000)).toBe('1K');
    expect(formatTokens(1500)).toBe('2K');
    expect(formatTokens(42000)).toBe('42K');
    expect(formatTokens(999999)).toBe('1000K');
  });

  it('returns M for >= 1_000_000', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M');
    expect(formatTokens(2_500_000)).toBe('2.5M');
  });
});

// ─── formatElapsed ──────────────────────────────────────────────────────────

describe('formatElapsed', () => {
  it('formats seconds', () => {
    const now = Date.now();
    expect(formatElapsed(now - 30_000)).toBe('30s');
  });

  it('formats minutes and seconds', () => {
    const now = Date.now();
    expect(formatElapsed(now - 125_000)).toBe('2m5s');
  });

  it('formats hours and minutes', () => {
    const now = Date.now();
    expect(formatElapsed(now - 3_700_000)).toBe('1h1m');
  });
});

// ─── visibleLen ─────────────────────────────────────────────────────────────

describe('visibleLen', () => {
  it('returns length of plain text', () => {
    expect(visibleLen('hello')).toBe(5);
  });

  it('strips ANSI codes', () => {
    expect(visibleLen('\x1b[32mhello\x1b[0m')).toBe(5);
    expect(visibleLen('\x1b[1;32mmodel\x1b[0m')).toBe(5);
  });

  it('handles multiple ANSI codes', () => {
    expect(visibleLen('\x1b[32m✓\x1b[0m Read \x1b[90m×8\x1b[0m')).toBe('✓ Read ×8'.length);
  });
});

// ─── createProgressBar ──────────────────────────────────────────────────────

describe('createProgressBar', () => {
  it('returns a string with ANSI color codes', () => {
    const bar = createProgressBar(50, 10);
    expect(bar).toContain('\x1b[32m'); // green
    expect(bar).toContain('\x1b[0m');
  });

  it('uses yellow for > 70%', () => {
    const bar = createProgressBar(75, 10);
    expect(bar).toContain('\x1b[33m');
  });

  it('uses red for > 90%', () => {
    const bar = createProgressBar(95, 10);
    expect(bar).toContain('\x1b[31m');
  });

  it('visible width matches requested width', () => {
    const bar = createProgressBar(42, 10);
    expect(visibleLen(bar)).toBe(10);
  });
});

// ─── buildSeparator ─────────────────────────────────────────────────────────

describe('buildSeparator', () => {
  it('produces correct visible width', () => {
    const sep = buildSeparator(80);
    expect(visibleLen(sep)).toBe(80);
  });

  it('contains the label', () => {
    const sep = buildSeparator(80);
    expect(sep).toContain('gemini-cli-hud');
  });

  it('is centered', () => {
    const sep = buildSeparator(80);
    const plain = sep.replace(/\x1b\[[0-9;]*m/g, '');
    const labelIdx = plain.indexOf(' gemini-cli-hud ');
    const leftDashes = labelIdx;
    const rightDashes = 80 - labelIdx - ' gemini-cli-hud '.length;
    expect(Math.abs(leftDashes - rightDashes)).toBeLessThanOrEqual(1);
  });
});

// ─── buildTitle ─────────────────────────────────────────────────────────────

describe('buildTitle', () => {
  it('shows waiting when no model', () => {
    const state = createInitialState();
    expect(buildTitle(state)).toContain('waiting');
  });

  it('shows model, percentage, and tool count', () => {
    const state: HUDState = {
      ...createInitialState(),
      model: 'models/gemini-3-flash-preview',
      tokens: { used: 420_000, total: 1_000_000 },
      tools: { Read: 5, Bash: 3 },
    };
    const title = buildTitle(state);
    expect(title).toContain('gemini-3-flash');
    expect(title).toContain('42%');
    expect(title).toContain('8 tools');
    expect(title).not.toContain('preview');
    expect(title).not.toContain('models/');
  });
});

// ─── getContextSize ─────────────────────────────────────────────────────────

describe('getContextSize', () => {
  it('returns correct size for known models', () => {
    expect(getContextSize('gemini-3-flash')).toBe(1_000_000);
    expect(getContextSize('gemini-3-pro')).toBe(2_000_000);
    expect(getContextSize('gemini-1.5-pro-latest')).toBe(2_000_000);
  });

  it('returns 1M for unknown models', () => {
    expect(getContextSize('unknown-model-xyz')).toBe(1_000_000);
  });

  it('is case-insensitive', () => {
    expect(getContextSize('Gemini-3-Flash')).toBe(1_000_000);
  });
});

// ─── packModulesIntoLines ───────────────────────────────────────────────────

describe('packModulesIntoLines', () => {
  const mkMod = (text: string) => ({ ansi: text, width: text.length });

  it('packs all modules on one line if they fit', () => {
    const mods = [mkMod('AAA'), mkMod('BBB'), mkMod('CCC')];
    const lines = packModulesIntoLines(mods, 80);
    expect(lines).toHaveLength(1);
  });

  it('wraps modules to next line when exceeding cols', () => {
    const mods = [mkMod('A'.repeat(30)), mkMod('B'.repeat(30)), mkMod('C'.repeat(30))];
    const lines = packModulesIntoLines(mods, 40);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('caps at 3 content lines', () => {
    const mods = Array.from({ length: 20 }, (_, i) => mkMod(`mod${i}_`.padEnd(15, 'x')));
    const lines = packModulesIntoLines(mods, 30);
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it('each line starts with a space (padding)', () => {
    const mods = [mkMod('AAA'), mkMod('BBB')];
    const lines = packModulesIntoLines(mods, 80);
    for (const line of lines) {
      expect(line[0]).toBe(' ');
    }
  });
});

// ─── processEvent ───────────────────────────────────────────────────────────

describe('processEvent', () => {
  let state: HUDState;

  beforeEach(() => {
    state = createInitialState();
  });

  it('resets state on SessionStart', () => {
    state.model = 'gemini-3-flash';
    state.tools = { Read: 5 };
    const next = processEvent(state, { hook_event_name: 'SessionStart' });
    expect(next.model).toBe('');
    expect(next.tools).toEqual({});
    expect(next.tokens).toEqual({ used: 0, total: 0 });
  });

  it('updates model and tokens on AfterModel', () => {
    const event = {
      hook_event_name: 'AfterModel',
      llm_request: { model: 'gemini-3-flash' },
      llm_response: {
        usageMetadata: { promptTokenCount: 42000, totalTokenCount: 50000 },
      },
    };
    const next = processEvent(state, event);
    expect(next.model).toBe('gemini-3-flash');
    expect(next.tokens.used).toBe(42000);
    expect(next.tokens.total).toBe(1_000_000);
  });

  it('prefers promptTokenCount over totalTokenCount', () => {
    const event = {
      hook_event_name: 'AfterModel',
      llm_request: { model: 'gemini-3-flash' },
      llm_response: {
        usageMetadata: { promptTokenCount: 30000, totalTokenCount: 50000 },
      },
    };
    const next = processEvent(state, event);
    expect(next.tokens.used).toBe(30000);
  });

  it('falls back to totalTokenCount if no promptTokenCount', () => {
    const event = {
      hook_event_name: 'AfterModel',
      llm_request: { model: 'gemini-3-flash' },
      llm_response: {
        usageMetadata: { totalTokenCount: 50000 },
      },
    };
    const next = processEvent(state, event);
    expect(next.tokens.used).toBe(50000);
  });

  it('tracks tool calls on AfterTool', () => {
    let next = processEvent(state, {
      hook_event_name: 'AfterTool',
      tool_name: 'run_shell_command',
    });
    next = processEvent(next, {
      hook_event_name: 'AfterTool',
      tool_name: 'run_shell_command',
    });
    next = processEvent(next, {
      hook_event_name: 'AfterTool',
      tool_name: 'replace',
    });
    expect(next.tools).toEqual({ run_shell_command: 2, replace: 1 });
  });

  it('tracks activate_skill as activeSkill, not as tool', () => {
    const next = processEvent(state, {
      hook_event_name: 'AfterTool',
      tool_name: 'activate_skill',
      tool_input: { name: 'writing-plans' },
    });
    expect(next.activeSkill).toBe('writing-plans');
    expect(next.tools['activate_skill']).toBeUndefined();
  });

  it('updates cwd from event', () => {
    const next = processEvent(state, {
      hook_event_name: 'AfterModel',
      cwd: '/home/user/project',
      llm_request: { model: 'gemini-3-flash' },
      llm_response: { usageMetadata: { promptTokenCount: 1000 } },
    });
    expect(next.cwd).toBe('/home/user/project');
  });

  it('tracks lastModelTime and lastModelTokens on AfterModel', () => {
    const next = processEvent(state, {
      hook_event_name: 'AfterModel',
      llm_request: { model: 'gemini-3-flash' },
      llm_response: { usageMetadata: { promptTokenCount: 5000 } },
    });
    expect(next.lastModelTime).toBeGreaterThan(0);
    expect(next.lastModelTokens).toBe(5000);
  });

  it('resets token rate on SessionStart', () => {
    state.tokenRate = 500;
    state.lastModelTime = Date.now();
    state.lastModelTokens = 10000;
    const next = processEvent(state, { hook_event_name: 'SessionStart' });
    expect(next.tokenRate).toBe(0);
    expect(next.lastModelTime).toBe(0);
    expect(next.lastModelTokens).toBe(0);
  });
});

// ─── formatTokenRate ────────────────────────────────────────────────────────

describe('formatTokenRate', () => {
  it('returns empty string for zero rate', () => {
    expect(formatTokenRate(0)).toBe('');
  });

  it('returns empty string for negative rate', () => {
    expect(formatTokenRate(-10)).toBe('');
  });

  it('formats small rates as tok/s', () => {
    expect(formatTokenRate(500)).toBe('500 tok/s');
  });

  it('formats large rates as K tok/s', () => {
    expect(formatTokenRate(1500)).toBe('1.5K tok/s');
  });
});

// ─── Cost estimation ────────────────────────────────────────────────────────

describe('getModelPricing', () => {
  it('returns correct pricing for known models', () => {
    const flash = getModelPricing('gemini-3-flash');
    expect(flash.input).toBe(0.15);
    expect(flash.output).toBe(0.60);

    const pro = getModelPricing('gemini-3-pro');
    expect(pro.input).toBe(1.25);
    expect(pro.output).toBe(10.00);
  });

  it('returns default flash pricing for unknown models', () => {
    const unknown = getModelPricing('unknown-model');
    expect(unknown.input).toBe(0.15);
  });
});

describe('estimateCost', () => {
  it('calculates cost correctly', () => {
    // 100K input tokens at $0.15/1M = $0.015
    // 10K output tokens at $0.60/1M = $0.006
    const cost = estimateCost('gemini-3-flash', 100_000, 10_000);
    expect(cost).toBeCloseTo(0.021, 3);
  });

  it('handles zero tokens', () => {
    expect(estimateCost('gemini-3-flash', 0, 0)).toBe(0);
  });
});

describe('formatCost', () => {
  it('formats tiny costs with 4 decimals', () => {
    expect(formatCost(0.0012)).toBe('$0.0012');
  });

  it('formats small costs with 3 decimals', () => {
    expect(formatCost(0.123)).toBe('$0.123');
  });

  it('formats large costs with 2 decimals', () => {
    expect(formatCost(2.567)).toBe('$2.57');
  });
});

describe('processEvent cost tracking', () => {
  it('accumulates cost across AfterModel events', () => {
    let s = createInitialState();
    s = processEvent(s, {
      hook_event_name: 'AfterModel',
      llm_request: { model: 'gemini-3-flash' },
      llm_response: { usageMetadata: { promptTokenCount: 50000, candidatesTokenCount: 5000 } },
    });
    expect(s.totalInputTokens).toBe(50000);
    expect(s.totalOutputTokens).toBe(5000);
    expect(s.estimatedCost).toBeGreaterThan(0);

    const firstCost = s.estimatedCost;
    s = processEvent(s, {
      hook_event_name: 'AfterModel',
      llm_request: { model: 'gemini-3-flash' },
      llm_response: { usageMetadata: { promptTokenCount: 80000, candidatesTokenCount: 8000 } },
    });
    expect(s.totalInputTokens).toBe(130000);
    expect(s.estimatedCost).toBeGreaterThan(firstCost);
  });

  it('resets cost on SessionStart', () => {
    let s = createInitialState();
    s.estimatedCost = 0.5;
    s.totalInputTokens = 100000;
    s = processEvent(s, { hook_event_name: 'SessionStart' });
    expect(s.estimatedCost).toBe(0);
    expect(s.totalInputTokens).toBe(0);
    expect(s.totalOutputTokens).toBe(0);
  });
});
