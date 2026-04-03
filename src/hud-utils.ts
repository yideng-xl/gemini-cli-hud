/**
 * Gemini CLI HUD — Core utility functions
 *
 * Extracted for testability. Pure functions + filesystem helpers.
 */

import fs   from 'fs';
import path from 'path';

// ─── Filesystem helpers ─────────────────────────────────────────────────────

export function countGeminiMd(dir: string): number {
  const found = new Set<string>();
  try {
    // 1. Current dir and parents
    let d = dir;
    while (true) {
      const p = path.join(d, 'GEMINI.md');
      if (fs.existsSync(p)) found.add(fs.realpathSync(p));
      const parent = path.dirname(d);
      if (parent === d) break;
      d = parent;
    }
    // 2. Global ~/.gemini/GEMINI.md
    const home = process.env['HOME'] || '';
    const globalMd = path.join(home, '.gemini', 'GEMINI.md');
    if (fs.existsSync(globalMd)) found.add(fs.realpathSync(globalMd));
    // 3. Extensions GEMINI.md (~/.gemini/extensions/*/GEMINI.md)
    const extDir = path.join(home, '.gemini', 'extensions');
    if (fs.existsSync(extDir)) {
      for (const name of fs.readdirSync(extDir)) {
        const extMd = path.join(extDir, name, 'GEMINI.md');
        if (fs.existsSync(extMd)) found.add(fs.realpathSync(extMd));
      }
    }
  } catch {}
  return found.size;
}

export function countExtensions(): number {
  try {
    const extDir = path.join(process.env['HOME'] || '', '.gemini', 'extensions');
    if (!fs.existsSync(extDir)) return 0;
    return fs.readdirSync(extDir).filter(name => {
      const full = path.join(extDir, name);
      return fs.statSync(full).isDirectory() && !name.startsWith('.');
    }).length;
  } catch { return 0; }
}

// ─── Pure functions ─────────────────────────────────────────────────────────

// Context window sizes by model prefix (tokens)
export const MODEL_CONTEXT: Record<string, number> = {
  'gemini-3-flash':       1_000_000,
  'gemini-3-pro':         2_000_000,
  'gemini-2.5-flash':     1_000_000,
  'gemini-2.5-pro':       1_000_000,
  'gemini-2.0-flash-exp': 1_000_000,
  'gemini-2.0-flash':     1_000_000,
  'gemini-2.0-pro':       2_000_000,
  'gemini-1.5-pro':       2_000_000,
  'gemini-1.5-flash':     1_000_000,
  'gemini-flash':         1_000_000,
  'gemini-pro':           2_000_000,
};

export interface HUDState {
  model: string;
  tokens: { used: number; total: number };
  tools: Record<string, number>;
  activeSkill: string;
  cwd: string;
  sessionStart: number;
  lastUpdated: number;
  tokenRate: number;           // tokens/sec (smoothed)
  lastModelTime: number;       // timestamp of last AfterModel
  lastModelTokens: number;     // token count at last AfterModel
}

export function createInitialState(): HUDState {
  return {
    model: '',
    tokens: { used: 0, total: 0 },
    tools: {},
    activeSkill: '',
    cwd: '',
    sessionStart: Date.now(),
    lastUpdated: Date.now(),
    tokenRate: 0,
    lastModelTime: 0,
    lastModelTokens: 0,
  };
}

export function getContextSize(model: string): number {
  const m = model.toLowerCase();
  for (const [prefix, size] of Object.entries(MODEL_CONTEXT)) {
    if (m.includes(prefix)) return size;
  }
  return 1_000_000;
}

export function formatElapsed(startMs: number): string {
  const s = Math.floor((Date.now() - startMs) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}

export function formatTokenRate(rate: number): string {
  if (rate <= 0) return '';
  if (rate >= 1000) return `${(rate / 1000).toFixed(1)}K tok/s`;
  return `${rate} tok/s`;
}

export function visibleLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

export function createProgressBar(pct: number, width: number): string {
  const fullBlocks = Math.floor((pct / 100) * width);
  const partials = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
  const remainder = ((pct / 100) * width) - fullBlocks;
  const partialIdx = Math.floor(remainder * 8);

  const bar = '█'.repeat(fullBlocks) +
              (fullBlocks < width ? partials[partialIdx] : '') +
              ' '.repeat(Math.max(0, width - fullBlocks - 1));

  let color = '\x1b[32m'; // Green
  if (pct > 70) color = '\x1b[33m'; // Yellow
  if (pct > 90) color = '\x1b[31m'; // Red

  return `${color}${bar}\x1b[0m`;
}

export function buildSeparator(cols: number): string {
  const label = ' gemini-cli-hud ';
  const sepLen = Math.max(0, cols - label.length);
  const left = Math.floor(sepLen / 2);
  const right = sepLen - left;
  return `\x1b[90m${'─'.repeat(left)}${label}${'─'.repeat(right)}\x1b[0m`;
}

export function buildTitle(state: HUDState): string {
  if (!state.model) return '💎 gemini-cli-hud | waiting...';
  const { used, total } = state.tokens;
  const pct   = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const short = state.model.replace(/^models\//, '').replace(/-preview$|-latest$/, '');
  const toolCount = Object.values(state.tools).reduce((a, b) => a + b, 0);
  return `💎 ${short} | ${pct}% | ${toolCount} tools`;
}

interface HUDModule { ansi: string; width: number }

export function packModulesIntoLines(modules: HUDModule[], cols: number): string[] {
  const divider = ' \x1b[90m│\x1b[0m ';
  const divW = 3;
  const pad = 1;

  const lines: string[] = [];
  let curAnsi = '';
  let curWidth = 0;

  for (const mod of modules) {
    const needed = curWidth === 0 ? pad + mod.width : divW + mod.width;
    if (curWidth > 0 && curWidth + needed > cols) {
      lines.push(curAnsi);
      curAnsi = ' ' + mod.ansi;
      curWidth = pad + mod.width;
    } else if (curWidth === 0) {
      curAnsi = ' ' + mod.ansi;
      curWidth = pad + mod.width;
    } else {
      curAnsi += divider + mod.ansi;
      curWidth += divW + mod.width;
    }
  }
  if (curAnsi) lines.push(curAnsi);

  return lines.slice(0, 3);
}

export function processEvent(state: HUDState, event: Record<string, unknown>): HUDState {
  const name = event['hook_event_name'] as string | undefined;
  const next = { ...state, lastUpdated: Date.now() };
  if (event['cwd']) next.cwd = event['cwd'] as string;

  switch (name) {
    case 'SessionStart':
      next.model          = '';
      next.tools          = {};
      next.tokens         = { used: 0, total: 0 };
      next.activeSkill    = '';
      next.sessionStart   = Date.now();
      next.tokenRate      = 0;
      next.lastModelTime  = 0;
      next.lastModelTokens = 0;
      break;

    case 'AfterModel': {
      const req   = event['llm_request']  as Record<string, unknown> | undefined;
      const res   = event['llm_response'] as Record<string, unknown> | undefined;
      const usage = res?.['usageMetadata'] as Record<string, number>  | undefined;

      if (req?.['model']) {
        next.model        = req['model'] as string;
        next.tokens = { ...next.tokens, total: getContextSize(next.model) };
      }
      let newUsed = 0;
      if (usage?.['promptTokenCount']) {
        newUsed = usage['promptTokenCount'];
      } else if (usage?.['totalTokenCount']) {
        newUsed = usage['totalTokenCount'];
      }
      if (newUsed > 0) {
        next.tokens = { ...next.tokens, used: newUsed };
        // Calculate token rate (tokens/sec between AfterModel events)
        const now = Date.now();
        if (next.lastModelTime > 0 && newUsed > next.lastModelTokens) {
          const dtSec = (now - next.lastModelTime) / 1000;
          if (dtSec > 0.5) {
            const delta = newUsed - next.lastModelTokens;
            next.tokenRate = Math.round(delta / dtSec);
          }
        }
        next.lastModelTime = now;
        next.lastModelTokens = newUsed;
      }
      break;
    }

    case 'AfterTool': {
      const toolName = event['tool_name'] as string | undefined;
      if (toolName === 'activate_skill') {
        const input = event['tool_input'] as Record<string, unknown> | undefined;
        if (input?.['name']) {
          next.activeSkill = input['name'] as string;
        }
      } else if (toolName) {
        next.tools = { ...next.tools, [toolName]: (next.tools[toolName] ?? 0) + 1 };
      }
      break;
    }
  }

  return next;
}
