import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { loadStarState, saveStarState, recordSession, markPrompted, markQuotaHintShown, shouldShowStarPrompt, shouldShowQuotaHint, renderStarPrompt, renderQuotaHint, SESSION_THRESHOLD, QUOTA_HINT_THRESHOLD, } from './star-prompt.js';
vi.mock('fs');
const DEFAULT_STATE = { sessionCount: 0, prompted: false, quotaHintShown: false };
beforeEach(() => {
    vi.resetAllMocks();
});
describe('loadStarState', () => {
    it('should return defaults when no file exists', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        const state = loadStarState();
        expect(state).toEqual(DEFAULT_STATE);
    });
    it('should parse existing state file', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ sessionCount: 3, prompted: false, quotaHintShown: false }));
        const state = loadStarState();
        expect(state.sessionCount).toBe(3);
        expect(state.prompted).toBe(false);
        expect(state.quotaHintShown).toBe(false);
    });
    it('should handle corrupt JSON gracefully', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('not json!!!');
        const state = loadStarState();
        expect(state).toEqual(DEFAULT_STATE);
    });
    it('should handle missing fields gracefully (legacy file)', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ sessionCount: 3, prompted: true }));
        const state = loadStarState();
        expect(state.sessionCount).toBe(3);
        expect(state.prompted).toBe(true);
        expect(state.quotaHintShown).toBe(false); // defaults to false for legacy files
    });
});
describe('saveStarState', () => {
    it('should write state as JSON', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        saveStarState({ sessionCount: 5, prompted: true, quotaHintShown: false });
        expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('hud-prompts.json'), expect.stringContaining('"sessionCount": 5'));
    });
    it('should create directory if missing', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        saveStarState({ sessionCount: 1, prompted: false, quotaHintShown: false });
        expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });
});
// ─── Star prompt ────────────────────────────────────────────────────────────
describe('shouldShowStarPrompt', () => {
    it('should return false when below threshold', () => {
        expect(shouldShowStarPrompt({ ...DEFAULT_STATE, sessionCount: 2 })).toBe(false);
    });
    it('should return true at threshold', () => {
        expect(shouldShowStarPrompt({ ...DEFAULT_STATE, sessionCount: SESSION_THRESHOLD })).toBe(true);
    });
    it('should return true above threshold if not prompted', () => {
        expect(shouldShowStarPrompt({ ...DEFAULT_STATE, sessionCount: 10 })).toBe(true);
    });
    it('should return false if already prompted', () => {
        expect(shouldShowStarPrompt({ ...DEFAULT_STATE, sessionCount: 10, prompted: true })).toBe(false);
    });
});
describe('renderStarPrompt', () => {
    it('should return null when below threshold', () => {
        const result = renderStarPrompt({ ...DEFAULT_STATE, sessionCount: 1 });
        expect(result).toBeNull();
    });
    it('should return null when already prompted', () => {
        const result = renderStarPrompt({ ...DEFAULT_STATE, sessionCount: 10, prompted: true });
        expect(result).toBeNull();
    });
    it('should render English prompt at threshold', () => {
        const result = renderStarPrompt({ ...DEFAULT_STATE, sessionCount: SESSION_THRESHOLD }, 'en', 120);
        expect(result).not.toBeNull();
        expect(result).toContain('Enjoying gemini-cli-hud');
        expect(result).toContain('github.com');
        expect(result).toContain('⭐');
    });
    it('should render Chinese prompt', () => {
        const result = renderStarPrompt({ ...DEFAULT_STATE, sessionCount: SESSION_THRESHOLD }, 'zh', 120);
        expect(result).not.toBeNull();
        expect(result).toContain('喜欢 gemini-cli-hud');
        expect(result).toContain('⭐');
    });
});
// ─── Quota API hint ─────────────────────────────────────────────────────────
describe('shouldShowQuotaHint', () => {
    it('should return false when below threshold', () => {
        expect(shouldShowQuotaHint({ ...DEFAULT_STATE, sessionCount: 10 }, false)).toBe(false);
    });
    it('should return true at threshold when quotaApi is off', () => {
        expect(shouldShowQuotaHint({ ...DEFAULT_STATE, sessionCount: QUOTA_HINT_THRESHOLD }, false)).toBe(true);
    });
    it('should return false when quotaApi is already enabled', () => {
        expect(shouldShowQuotaHint({ ...DEFAULT_STATE, sessionCount: 20 }, true)).toBe(false);
    });
    it('should return false when already shown', () => {
        expect(shouldShowQuotaHint({ ...DEFAULT_STATE, sessionCount: 20, quotaHintShown: true }, false)).toBe(false);
    });
});
describe('renderQuotaHint', () => {
    it('should return null when below threshold', () => {
        const result = renderQuotaHint({ ...DEFAULT_STATE, sessionCount: 5 }, false);
        expect(result).toBeNull();
    });
    it('should return null when quotaApi enabled', () => {
        const result = renderQuotaHint({ ...DEFAULT_STATE, sessionCount: 20 }, true);
        expect(result).toBeNull();
    });
    it('should render English hint at threshold', () => {
        const result = renderQuotaHint({ ...DEFAULT_STATE, sessionCount: QUOTA_HINT_THRESHOLD }, false, 'en', 120);
        expect(result).not.toBeNull();
        expect(result).toContain('quotaApi');
        expect(result).toContain('hud.json');
    });
    it('should render Chinese hint', () => {
        const result = renderQuotaHint({ ...DEFAULT_STATE, sessionCount: QUOTA_HINT_THRESHOLD }, false, 'zh', 120);
        expect(result).not.toBeNull();
        expect(result).toContain('quotaApi');
        expect(result).toContain('订阅等级');
    });
});
// ─── Session tracking ───────────────────────────────────────────────────────
describe('recordSession', () => {
    it('should increment session count', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ sessionCount: 4, prompted: false, quotaHintShown: false }));
        const state = recordSession();
        expect(state.sessionCount).toBe(5);
    });
});
describe('markPrompted', () => {
    it('should set prompted to true', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ sessionCount: 5, prompted: false, quotaHintShown: false }));
        markPrompted();
        expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('"prompted": true'));
    });
});
describe('markQuotaHintShown', () => {
    it('should set quotaHintShown to true', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ sessionCount: 15, prompted: true, quotaHintShown: false }));
        markQuotaHintShown();
        expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('"quotaHintShown": true'));
    });
});
