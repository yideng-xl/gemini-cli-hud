/**
 * Gemini CLI HUD — Daemon process (v3: DECSTBM bottom overlay)
 *
 * Uses DECSTBM to reserve the bottom 2 terminal rows for the HUD.
 * Gemini CLI's content and Ink UI scroll within the region above.
 * When content fills the screen, the HUD is right below Gemini's UI.
 */
import fs from 'fs';
import net from 'net';
import path from 'path';
import { execSync } from 'child_process';
import { createInitialState, formatElapsed, formatTokens, createProgressBar, visibleLen, buildSeparator, buildTitle, packModulesIntoLines, processEvent, countGeminiMd, countExtensions, } from './hud-utils.js';
const SOCKET_PATH = process.argv[2] || '/tmp/gemini-cli-hud.sock';
const HUD_HEIGHT = 2;
// Get workspace name from CWD
const workspace = path.basename(process.cwd());
// ─── Helpers ────────────────────────────────────────────────────────────────
function log(msg) {
    try {
        fs.appendFileSync('/tmp/gemini-hud.log', `[${new Date().toISOString()}] ${msg}\n`);
    }
    catch { /* ignore */ }
}
let state = createInitialState();
// Cached terminal size from hook (hook has access to real /dev/tty)
const cachedTermSize = { rows: 0, cols: 0 };
function getTerminalSize() {
    // Prefer cached size from hook (accurate)
    if (cachedTermSize.rows > 4 && cachedTermSize.cols > 20) {
        return { ...cachedTermSize };
    }
    // Fallback: try local detection
    try {
        const out = execSync('stty size </dev/tty 2>/dev/null', {
            encoding: 'utf8',
            timeout: 500,
        }).trim();
        const parts = out.split(' ');
        const r = parseInt(parts[0], 10);
        const c = parseInt(parts[1], 10);
        if (r > 4 && c > 20)
            return { rows: r, cols: c };
    }
    catch { /* fall through */ }
    return { rows: 24, cols: 80 };
}
// ─── Rendering ──────────────────────────────────────────────────────────────
function buildHUDBar() {
    const { cols } = getTerminalSize();
    // Before first AfterModel event, show waiting state
    if (!state.model) {
        return [buildSeparator(cols), ` \x1b[2mwaiting for session...\x1b[0m`];
    }
    const { used, total } = state.tokens;
    const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    const short = state.model.replace(/^models\//, '').replace(/-preview$|-latest$/, '');
    const elapsed = formatElapsed(state.sessionStart);
    const toolEntries = Object.entries(state.tools);
    const toolStr = toolEntries.length > 0
        ? toolEntries.map(([n, c]) => `\x1b[32m✓\x1b[0m ${n} \x1b[90m×${c}\x1b[0m`).join(' \x1b[90m|\x1b[0m ')
        : '-';
    const usedStr = formatTokens(used);
    const totalStr = formatTokens(total);
    const barWidth = Math.min(20, Math.max(4, Math.floor(cols * 0.12)));
    const bar = createProgressBar(pct, barWidth);
    const mdCount = countGeminiMd(state.cwd);
    const extCount = countExtensions();
    // Define modules — each is an atomic unit that never breaks mid-content
    const modules = [];
    const modelSeg = `\x1b[1;32m${short}\x1b[0m`;
    modules.push({ ansi: modelSeg, width: visibleLen(modelSeg) });
    const metaSeg = `\x1b[36m${mdCount} GEMINI.md\x1b[0m \x1b[35m${extCount} ext\x1b[0m`;
    modules.push({ ansi: metaSeg, width: visibleLen(metaSeg) });
    if (state.activeSkill) {
        const skillSeg = `\x1b[95m⚡${state.activeSkill}\x1b[0m`;
        modules.push({ ansi: skillSeg, width: visibleLen(skillSeg) });
    }
    const ctxSeg = `\x1b[1mCtx:\x1b[0m ${bar} ${pct}% \x1b[2m(${usedStr}/${totalStr})\x1b[0m`;
    modules.push({ ansi: ctxSeg, width: visibleLen(ctxSeg) });
    modules.push({ ansi: toolStr, width: visibleLen(toolStr) });
    const sessionSeg = `\x1b[36mSession: ${elapsed}\x1b[0m`;
    modules.push({ ansi: sessionSeg, width: visibleLen(sessionSeg) });
    const contentLines = packModulesIntoLines(modules, cols);
    return [buildSeparator(cols), ...contentLines];
}
// ─── Event processing ───────────────────────────────────────────────────────
// Auto-exit after 10 minutes of inactivity (prevents stale daemons)
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
let idleTimer;
function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => shutdown(), IDLE_TIMEOUT_MS);
}
resetIdleTimer();
function handleEvent(event) {
    resetIdleTimer();
    if (event['_termCols'])
        cachedTermSize.cols = event['_termCols'];
    if (event['_termRows'])
        cachedTermSize.rows = event['_termRows'];
    state = processEvent(state, event);
}
// ─── Socket server ──────────────────────────────────────────────────────────
if (fs.existsSync(SOCKET_PATH)) {
    try {
        fs.unlinkSync(SOCKET_PATH);
    }
    catch { /* ignore */ }
}
const server = net.createServer((socket) => {
    let buf = '';
    socket.on('data', (d) => { buf += d.toString(); });
    socket.on('error', () => { });
    socket.on('end', () => {
        try {
            const event = JSON.parse(buf);
            handleEvent(event);
            const title = buildTitle(state);
            const bar = buildHUDBar();
            socket.write(JSON.stringify({ title, bar }));
            socket.end();
        }
        catch { /* ignore malformed JSON */ }
    });
});
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        try {
            fs.unlinkSync(SOCKET_PATH);
        }
        catch { /* ignore */ }
        server.listen(SOCKET_PATH);
    }
});
server.listen(SOCKET_PATH);
// ─── Resize watcher — re-render HUD when terminal size changes ─────────────
// NOTE: Daemon does NOT write to /dev/tty directly.
// Only the hook process renders HUD (synchronous with Gemini CLI, no race conditions).
// ─── Graceful shutdown ──────────────────────────────────────────────────────
function shutdown() {
    server.close();
    try {
        fs.unlinkSync(SOCKET_PATH);
    }
    catch { /* ignore */ }
    process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('uncaughtException', (e) => {
    log(`Uncaught: ${e}`);
});
