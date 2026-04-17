/**
 * Gemini CLI HUD — Star prompt
 *
 * After a user has used the HUD for a few sessions, gently remind them
 * to star the GitHub repo. The prompt is shown only once and persisted
 * to ~/.gemini/hud-star.json so it never appears again.
 */

import fs from 'fs';
import path from 'path';

// ─── Constants ──────────────────────────────────────────────────────────────

const REPO_URL = 'https://github.com/yideng-xl/gemini-cli-hud';

/** Number of sessions before showing the star prompt */
export const SESSION_THRESHOLD = 5;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StarState {
  /** Cumulative session count */
  sessionCount: number;
  /** Whether the star prompt has been shown */
  prompted: boolean;
}

// ─── Persistence ────────────────────────────────────────────────────────────

export function getStarStatePath(): string {
  const home = process.env['HOME'] || '';
  return path.join(home, '.gemini', 'hud-star.json');
}

export function loadStarState(): StarState {
  try {
    const p = getStarStatePath();
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      return {
        sessionCount: typeof raw.sessionCount === 'number' ? raw.sessionCount : 0,
        prompted: typeof raw.prompted === 'boolean' ? raw.prompted : false,
      };
    }
  } catch { /* ignore corrupt file */ }
  return { sessionCount: 0, prompted: false };
}

export function saveStarState(state: StarState): void {
  try {
    const p = getStarStatePath();
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
export function recordSession(): StarState {
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

// ─── Prompt rendering ───────────────────────────────────────────────────────

/**
 * Check if the star prompt should be shown this session.
 */
export function shouldShowStarPrompt(state: StarState): boolean {
  return !state.prompted && state.sessionCount >= SESSION_THRESHOLD;
}

/**
 * Render the star prompt line for the HUD.
 * Returns null if the prompt should not be shown.
 */
export function renderStarPrompt(
  state: StarState,
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
