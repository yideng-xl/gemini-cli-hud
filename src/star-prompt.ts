/**
 * Gemini CLI HUD — User prompts (star + quota API hint)
 *
 * Manages one-time, non-intrusive prompts shown after usage milestones.
 * All state is persisted to ~/.gemini/hud-prompts.json.
 *
 * - Star prompt: after 5 sessions, ask user to star the repo
 * - Quota hint: after 15 sessions (if quotaApi not enabled), suggest
 *   enabling quotaApi for precise subscription tier display
 */

import fs from 'fs';
import path from 'path';

// ─── Constants ──────────────────────────────────────────────────────────────

const REPO_URL = 'https://github.com/yideng-xl/gemini-cli-hud';

/** Number of sessions before showing the star prompt */
export const SESSION_THRESHOLD = 5;

/** Number of sessions before showing the quota API hint */
export const QUOTA_HINT_THRESHOLD = 15;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PromptState {
  /** Cumulative session count */
  sessionCount: number;
  /** Whether the star prompt has been shown */
  prompted: boolean;
  /** Whether the quota API hint has been shown */
  quotaHintShown: boolean;
}

// Keep backward-compatible alias
export type StarState = PromptState;

// ─── Persistence ────────────────────────────────────────────────────────────

export function getStarStatePath(): string {
  const home = process.env['HOME'] || '';
  // Check new path first, fall back to legacy path
  const newPath = path.join(home, '.gemini', 'hud-prompts.json');
  const legacyPath = path.join(home, '.gemini', 'hud-star.json');
  if (fs.existsSync(newPath)) return newPath;
  if (fs.existsSync(legacyPath)) return legacyPath;
  return newPath;
}

export function loadStarState(): PromptState {
  try {
    // Try new path, then legacy
    const home = process.env['HOME'] || '';
    const newPath = path.join(home, '.gemini', 'hud-prompts.json');
    const legacyPath = path.join(home, '.gemini', 'hud-star.json');
    const p = fs.existsSync(newPath) ? newPath : legacyPath;
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      return {
        sessionCount: typeof raw.sessionCount === 'number' ? raw.sessionCount : 0,
        prompted: typeof raw.prompted === 'boolean' ? raw.prompted : false,
        quotaHintShown: typeof raw.quotaHintShown === 'boolean' ? raw.quotaHintShown : false,
      };
    }
  } catch { /* ignore corrupt file */ }
  return { sessionCount: 0, prompted: false, quotaHintShown: false };
}

export function saveStarState(state: PromptState): void {
  try {
    const home = process.env['HOME'] || '';
    const p = path.join(home, '.gemini', 'hud-prompts.json');
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(p, JSON.stringify(state, null, 2));
  } catch { /* ignore write errors */ }
}

// ─── Session tracking ───────────────────────────────────────────────────────

/**
 * Increment the session counter. Called once per SessionStart event.
 * Returns the updated state.
 */
export function recordSession(): PromptState {
  const state = loadStarState();
  state.sessionCount += 1;
  saveStarState(state);
  return state;
}

/**
 * Mark the star prompt as shown so it never appears again.
 */
export function markPrompted(): void {
  const state = loadStarState();
  state.prompted = true;
  saveStarState(state);
}

/**
 * Mark the quota API hint as shown so it never appears again.
 */
export function markQuotaHintShown(): void {
  const state = loadStarState();
  state.quotaHintShown = true;
  saveStarState(state);
}

// ─── Star prompt ────────────────────────────────────────────────────────────

/**
 * Check if the star prompt should be shown this session.
 */
export function shouldShowStarPrompt(state: PromptState): boolean {
  return !state.prompted && state.sessionCount >= SESSION_THRESHOLD;
}

/**
 * Render the star prompt line for the HUD.
 * Returns null if the prompt should not be shown.
 */
export function renderStarPrompt(
  state: PromptState,
  lang: 'en' | 'zh' = 'en',
  cols: number = 80,
): string | null {
  if (!shouldShowStarPrompt(state)) return null;

  const messages = {
    en: `Enjoying gemini-cli-hud? Give us a ⭐ → ${REPO_URL}`,
    zh: `喜欢 gemini-cli-hud 吗？给我们一个 ⭐ → ${REPO_URL}`,
  };

  const msg = messages[lang];
  // Center the message
  const pad = Math.max(0, Math.floor((cols - msg.length) / 2));
  return `\x1b[2m${' '.repeat(pad)}${msg}\x1b[0m`;
}

// ─── Quota API hint ─────────────────────────────────────────────────────────

/**
 * Check if the quota API hint should be shown this session.
 * Only shown when quotaApi is not yet enabled.
 */
export function shouldShowQuotaHint(state: PromptState, quotaApiEnabled: boolean): boolean {
  if (quotaApiEnabled) return false;          // already enabled, no need
  if (state.quotaHintShown) return false;     // already shown once
  return state.sessionCount >= QUOTA_HINT_THRESHOLD;
}

/**
 * Render the quota API hint line for the HUD.
 */
export function renderQuotaHint(
  state: PromptState,
  quotaApiEnabled: boolean,
  lang: 'en' | 'zh' = 'en',
  cols: number = 80,
): string | null {
  if (!shouldShowQuotaHint(state, quotaApiEnabled)) return null;

  const messages = {
    en: 'Want to see your subscription tier? Add "quotaApi": true to ~/.gemini/hud.json',
    zh: '想查看订阅等级？在 ~/.gemini/hud.json 中添加 "quotaApi": true',
  };

  const msg = messages[lang];
  const pad = Math.max(0, Math.floor((cols - msg.length) / 2));
  return `\x1b[2m${' '.repeat(pad)}${msg}\x1b[0m`;
}
