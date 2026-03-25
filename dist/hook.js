import fs from 'fs';
const STATE_FILE = '/tmp/gemini-cli-hud-state.json';
// Context window sizes by model prefix
const MODEL_CONTEXT = {
    'gemini-2.0-flash': 1_000_000,
    'gemini-2.5-pro': 1_000_000,
    'gemini-2.5-flash': 1_000_000,
    'gemini-1.5-pro': 2_000_000,
    'gemini-1.5-flash': 1_000_000,
};
function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        }
    }
    catch {
        // ignore
    }
    return { model: 'gemini', tokens: { used: 0, total: 1_000_000 }, tools: {} };
}
function saveState(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf-8');
    }
    catch {
        // ignore
    }
}
function getContextSize(model) {
    for (const prefix of Object.keys(MODEL_CONTEXT)) {
        if (model.startsWith(prefix))
            return MODEL_CONTEXT[prefix];
    }
    return 1_000_000;
}
function renderHUD(state) {
    const { used, total } = state.tokens;
    const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    const barWidth = 20;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    const toolEntries = Object.entries(state.tools);
    const toolStr = toolEntries.length > 0
        ? toolEntries.map(([name, count]) => `\x1b[33m${name}\x1b[0m x${count}`).join('  ')
        : '\x1b[90m(no tools yet)\x1b[0m';
    const modelDisplay = `\x1b[36m[${state.model}]\x1b[0m`;
    const contextDisplay = `Context: \x1b[32m${bar}\x1b[0m \x1b[1m${percent}%\x1b[0m (${used.toLocaleString()}/${(total / 1000).toFixed(0)}k)`;
    const toolDisplay = `Tools: ${toolStr}`;
    return `\x1b[90m──────────────────────────────────────────────────────────────────────\x1b[0m
 ${modelDisplay}  ${contextDisplay}  │  ${toolDisplay}
\x1b[90m──────────────────────────────────────────────────────────────────────\x1b[0m`;
}
function writeToTTY(text) {
    try {
        const fd = fs.openSync('/dev/tty', 'w');
        fs.writeSync(fd, `\n${text}\n`);
        fs.closeSync(fd);
    }
    catch {
        // TTY not available (e.g. in CI), silently skip
    }
}
async function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => { data += chunk; });
        process.stdin.on('end', () => resolve(data));
        setTimeout(() => resolve(data), 1000);
    });
}
async function main() {
    const raw = await readStdin();
    let event = {};
    try {
        if (raw.trim())
            event = JSON.parse(raw);
    }
    catch {
        // not JSON, ignore
    }
    const state = loadState();
    const eventName = event['hook_event_name'];
    if (eventName === 'SessionStart') {
        // Reset tool counts for new session
        state.tools = {};
        state.tokens = { used: 0, total: state.tokens.total };
    }
    else if (eventName === 'AfterModel') {
        const req = event['llm_request'];
        const res = event['llm_response'];
        const usage = res?.['usageMetadata'];
        if (req?.['model']) {
            state.model = req['model'];
            state.tokens.total = getContextSize(state.model);
        }
        if (usage?.['totalTokenCount']) {
            state.tokens.used = usage['totalTokenCount'];
        }
        else if (usage?.['promptTokenCount']) {
            state.tokens.used = usage['promptTokenCount'];
        }
    }
    else if (eventName === 'AfterTool') {
        const toolName = event['tool_name'];
        if (toolName) {
            state.tools[toolName] = (state.tools[toolName] ?? 0) + 1;
        }
    }
    saveState(state);
    // Only render HUD after meaningful events
    if (eventName === 'AfterModel' || eventName === 'AfterTool') {
        writeToTTY(renderHUD(state));
    }
    // Must output valid JSON to stdout for Gemini CLI
    process.stdout.write(JSON.stringify({ continue: true }) + '\n');
}
main().catch(() => {
    process.stdout.write(JSON.stringify({ continue: true }) + '\n');
});
