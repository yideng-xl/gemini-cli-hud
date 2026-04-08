/**
 * Gemini CLI HUD — Configuration
 *
 * Reads user config from ~/.gemini/hud.json.
 * All fields are optional — missing fields use defaults.
 */
import fs from 'fs';
import path from 'path';
// ─── Presets ────────────────────────────────────────────────────────────────
const PRESET_MODULES = {
    full: ['model', 'meta', 'skill', 'context', 'git', 'tools', 'cost', 'memory', 'quota', 'session'],
    essential: ['model', 'context', 'git', 'tools', 'session'],
    minimal: ['model', 'context', 'session'],
};
const PRESET_DISPLAY = {
    full: {
        showModel: true,
        showAuth: true,
        showContext: true,
        showTokenRate: true,
        showTools: true,
        showCost: true,
        showSkill: true,
        showSession: true,
        showMeta: true,
        showGit: true,
        showMemory: true,
        showQuota: true,
    },
    essential: {
        showModel: true,
        showAuth: true,
        showContext: true,
        showTokenRate: false,
        showTools: true,
        showCost: false,
        showSkill: false,
        showSession: true,
        showMeta: false,
        showGit: true,
        showMemory: false,
        showQuota: false,
    },
    minimal: {
        showModel: true,
        showAuth: false,
        showContext: true,
        showTokenRate: false,
        showTools: false,
        showCost: false,
        showSkill: false,
        showSession: true,
        showMeta: false,
        showGit: false,
        showMemory: false,
        showQuota: false,
    },
};
// ─── Defaults ───────────────────────────────────────────────────────────────
export const DEFAULT_CONFIG = {
    modules: PRESET_MODULES.full,
    display: PRESET_DISPLAY.full,
    preset: 'full',
    language: 'en',
};
// ─── Validation helpers ─────────────────────────────────────────────────────
const VALID_MODULES = new Set([
    'model', 'meta', 'skill', 'context', 'tools', 'cost', 'session', 'git', 'memory', 'quota',
]);
const VALID_PRESETS = new Set(['full', 'essential', 'minimal']);
function isValidModule(m) {
    return typeof m === 'string' && VALID_MODULES.has(m);
}
// ─── Config loading ─────────────────────────────────────────────────────────
export function getConfigPath() {
    const home = process.env['HOME'] || '';
    return path.join(home, '.gemini', 'hud.json');
}
export function loadConfig() {
    const configPath = getConfigPath();
    let raw = {};
    try {
        if (fs.existsSync(configPath)) {
            const text = fs.readFileSync(configPath, 'utf8')
                .replace(/^\s*\/\/.*$/gm, ''); // strip // comments for user convenience
            raw = JSON.parse(text);
        }
    }
    catch {
        return { ...DEFAULT_CONFIG };
    }
    // Start with defaults
    const config = { ...DEFAULT_CONFIG };
    // Apply preset first (provides base modules and display)
    if (typeof raw['preset'] === 'string' && VALID_PRESETS.has(raw['preset'])) {
        const preset = raw['preset'];
        config.preset = preset;
        config.modules = [...PRESET_MODULES[preset]];
        config.display = { ...PRESET_DISPLAY[preset] };
    }
    // Override modules if explicitly provided
    if (Array.isArray(raw['modules'])) {
        const validModules = raw['modules'].filter(isValidModule);
        if (validModules.length > 0) {
            config.modules = validModules;
        }
    }
    // Override individual display flags
    if (raw['display'] && typeof raw['display'] === 'object') {
        const d = raw['display'];
        for (const key of Object.keys(config.display)) {
            if (typeof d[key] === 'boolean') {
                config.display[key] = d[key];
            }
        }
    }
    // Language
    if (raw['language'] === 'en' || raw['language'] === 'zh') {
        config.language = raw['language'];
    }
    return config;
}
