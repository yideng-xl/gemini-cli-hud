/**
 * Gemini CLI HUD — Hook entry point
 *
 * Invoked by Gemini CLI for each hook event (SessionStart, AfterModel, AfterTool).
 * Responsibilities:
 *   1. Ensure the HUD daemon is running
 *   2. Forward the event to the daemon via Unix socket
 *   3. Return {"continue": true} to Gemini CLI on stdout
 */
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_ID = process.ppid || process.pid; // Gemini CLI's PID
const SOCKET_PATH = `/tmp/gemini-cli-hud-${SESSION_ID}.sock`;
const DAEMON_FILE = path.join(__dirname, 'daemon.js');
// ─── Daemon lifecycle ────────────────────────────────────────────────────────
async function ensureDaemon() {
    if (fs.existsSync(SOCKET_PATH))
        return; // already running
    if (!fs.existsSync(DAEMON_FILE))
        return; // not built yet
    const child = spawn(process.execPath, [DAEMON_FILE, SOCKET_PATH], {
        stdio: 'ignore',
    });
    child.unref();
    // Wait up to 2s for the socket to appear
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (fs.existsSync(SOCKET_PATH))
            return;
    }
}
// ─── Socket communication ────────────────────────────────────────────────────
async function sendEvent(event) {
    return new Promise((resolve) => {
        const client = net.createConnection(SOCKET_PATH, () => {
            const termSize = getTerminalSize();
            client.write(JSON.stringify({ ...event, _termCols: termSize.cols, _termRows: termSize.rows }));
            client.end(); // Half-close, finish writing
        });
        let reply = '';
        client.on('data', (d) => { reply += d.toString(); });
        client.on('end', () => {
            try {
                const res = JSON.parse(reply);
                // Set terminal title via OSC 0
                if (res.title) {
                    const seq = `\x1b]0;${res.title}\x07`;
                    try {
                        fs.writeFileSync('/dev/tty', seq);
                    }
                    catch {
                        process.stderr.write(seq);
                    }
                }
                // Render bottom HUD bar
                if (res.bar && res.bar.length > 0) {
                    renderHUD(res.bar);
                }
            }
            catch { /* ignore malformed reply */ }
            resolve();
        });
        client.on('error', () => resolve());
        setTimeout(() => resolve(), 500);
    });
}
// ─── Session cleanup ────────────────────────────────────────────────────────
function cleanupHUD() {
    // Reset DECSTBM scroll region and clear HUD area
    try {
        const { rows } = getTerminalSize();
        let seq = '\x1b[?2026h'; // Begin synchronized output
        seq += '\x1b7'; // save cursor
        seq += '\x1b[?25l'; // hide cursor
        // Clear bottom rows where HUD was
        for (let i = rows - 3; i <= rows; i++) {
            seq += `\x1b[${i};1H\x1b[2K`;
        }
        seq += '\x1b[r'; // reset scroll region to full terminal
        seq += '\x1b[?25h'; // show cursor
        seq += '\x1b8'; // restore cursor
        seq += '\x1b[?2026l'; // End synchronized output
        fs.writeFileSync('/dev/tty', seq);
    }
    catch { /* ignore */ }
    // Remove socket file to signal daemon to exit
    try {
        fs.unlinkSync(SOCKET_PATH);
    }
    catch { /* ignore */ }
}
// ─── Terminal rendering ─────────────────────────────────────────────────────
function getTerminalSize() {
    try {
        const out = execSync('stty size </dev/tty 2>/dev/null', {
            encoding: 'utf8',
            timeout: 500,
        }).trim();
        const [r, c] = out.split(' ').map(Number);
        if (r > 4 && c > 20)
            return { rows: r, cols: c };
    }
    catch { }
    return { rows: 24, cols: 80 };
}
// Track previous scroll region to avoid unnecessary resets
let prevScrollBottom = 0;
function renderHUD(bar) {
    const { rows } = getTerminalSize();
    const hudHeight = bar.length;
    const scrollBottom = rows - hudHeight;
    if (scrollBottom < 4)
        return; // terminal too small
    let seq = '';
    // Begin Synchronized Output — Ghostty/kitty/WezTerm batch all writes
    // into a single frame, eliminating flicker and ghosting
    seq += '\x1b[?2026h';
    seq += '\x1b7'; // DECSC: save cursor
    seq += '\x1b[?25l'; // Hide cursor during update
    // Set scroll region directly — skip \x1b[r reset to avoid the brief
    // "full-screen scrollable" intermediate state that causes ghosting
    seq += `\x1b[1;${scrollBottom}r`; // DECSTBM: set scroll region
    // Clear and write HUD lines (outside the scroll region)
    for (let i = 0; i < bar.length; i++) {
        const row = scrollBottom + 1 + i;
        seq += `\x1b[${row};1H`; // CUP: move to HUD row
        seq += '\x1b[2K'; // EL: clear entire line first
        seq += bar[i]; // Write content
    }
    // Clear any leftover rows if HUD height shrunk
    if (prevScrollBottom > 0 && prevScrollBottom < scrollBottom) {
        for (let i = prevScrollBottom + 1; i <= scrollBottom; i++) {
            seq += `\x1b[${i};1H\x1b[2K`;
        }
    }
    prevScrollBottom = scrollBottom;
    seq += '\x1b[?25h'; // Show cursor
    seq += '\x1b8'; // DECRC: restore cursor
    // End Synchronized Output — terminal renders everything at once
    seq += '\x1b[?2026l';
    try {
        fs.writeFileSync('/dev/tty', seq);
    }
    catch { /* ignore tty write errors */ }
}
// ─── Main ────────────────────────────────────────────────────────────────────
async function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (c) => { data += c; });
        process.stdin.on('end', () => resolve(data));
        setTimeout(() => resolve(data), 1_000);
    });
}
async function main() {
    const raw = await readStdin();
    let event = {};
    try {
        if (raw.trim())
            event = JSON.parse(raw);
    }
    catch { /* not JSON — pass empty event so daemon gets a heartbeat */ }
    try {
        if (event['hook_event_name'] === 'SessionEnd') {
            cleanupHUD();
        }
        else {
            await ensureDaemon();
            await sendEvent(event);
        }
    }
    catch { /* never block Gemini CLI */ }
    // Gemini CLI requires a valid JSON response on stdout
    process.stdout.write(JSON.stringify({ continue: true }) + '\n');
}
main().catch(() => {
    process.stdout.write(JSON.stringify({ continue: true }) + '\n');
});
