/**
 * Gemini CLI HUD — Daemon process
 *
 * Runs in the background, receives hook events via Unix socket,
 * and renders the HUD at the terminal bottom using VT100 cursor
 * save/restore (DECSC/DECRC) — no Ink, no React, no terminal-specific APIs.
 *
 * Compatible with: Terminal.app, iTerm2, Tabby, WezTerm, Kitty, etc.
 */

import fs from 'fs';
import net from 'net';
import { execSync } from 'child_process';

const SOCKET_PATH = '/tmp/gemini-cli-hud.sock';

// Context window sizes by model prefix (tokens)
const MODEL_CONTEXT: Record<string, number> = {
  'gemini-3':        1_000_000,
  'gemini-2.5':      1_000_000,
  'gemini-2.0':      1_000_000,
  'gemini-1.5-pro':  2_000_000,
  'gemini-1.5-flash':1_000_000,
};

interface HUDState {
  model: string;
  tokens: { used: number; total: number };
  tools: Record<string, number>;
  sessionStart: number;
}

let state: HUDState = {
  model: 'gemini',
  tokens: { used: 0, total: 1_000_000 },
  tools: {},
  sessionStart: Date.now(),
};

let renderTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getContextSize(model: string): number {
  for (const prefix of Object.keys(MODEL_CONTEXT)) {
    if (model.includes(prefix)) return MODEL_CONTEXT[prefix];
  }
  return 1_000_000;
}

function getTerminalSize(): { rows: number; cols: number } {
  try {
    const out = execSync('stty size </dev/tty 2>/dev/null', {
      encoding: 'utf8',
      timeout: 500,
    }).trim();
    const parts = out.split(' ');
    const r = parseInt(parts[0], 10);
    const c = parseInt(parts[1], 10);
    if (r > 4 && c > 20) return { rows: r, cols: c };
  } catch { /* fall through */ }
  return { rows: 24, cols: 80 };
}

function formatElapsed(startMs: number): string {
  const s = Math.floor((Date.now() - startMs) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
}

// ─── Rendering ──────────────────────────────────────────────────────────────

/**
 * Build the 2-line HUD string (no trailing newline on last line).
 * Line 1: separator
 * Line 2: model | context bar | tools
 */
function buildHUD(cols: number): string {
  const { used, total } = state.tokens;
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  // Progress bar — scales with terminal width
  const barWidth = Math.max(8, Math.min(20, Math.floor(cols / 8)));
  const filled = Math.round((pct / 100) * barWidth);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);

  // Segments
  const modelName = state.model.replace(/^models\//, '');
  const elapsed   = formatElapsed(state.sessionStart);
  const usedK     = (used / 1_000).toFixed(0);
  const totalM    = (total / 1_000_000).toFixed(0);

  const segModel   = `\x1b[36;1m${modelName}\x1b[0m \x1b[90m${elapsed}\x1b[0m`;
  const segContext = `ctx \x1b[32m${bar}\x1b[0m \x1b[1m${pct}%\x1b[0m \x1b[90m(${usedK}k/${totalM}M)\x1b[0m`;

  const toolEntries = Object.entries(state.tools);
  const segTools = toolEntries.length > 0
    ? toolEntries.map(([n, c]) => `\x1b[33m${n}\x1b[0m×${c}`).join('  ')
    : '\x1b[90midle\x1b[0m';

  const sep  = `\x1b[90m${'─'.repeat(cols)}\x1b[0m`;
  const body = ` ${segModel}  \x1b[90m│\x1b[0m  ${segContext}  \x1b[90m│\x1b[0m  ${segTools}`;

  return `${sep}\n${body}`;
}

/**
 * Build the compact terminal title string (no ANSI colour codes).
 */
function buildTitle(): string {
  const { used, total } = state.tokens;
  const pct   = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const short = state.model.replace(/^models\//, '').replace(/-preview$|-latest$/, '');
  const tools = Object.entries(state.tools).map(([n, c]) => `${n}×${c}`).join(' ') || 'idle';
  return `[HUD] ${short} | ctx ${pct}% (${(used / 1000).toFixed(0)}k) | ${tools}`;
}

/**
 * Write HUD to /dev/tty using cursor save/restore overlay.
 * The sequence is built as a single string and written in one call
 * to minimise the race-condition window with Gemini CLI's Ink renders.
 */
function writeHUD(): void {
  const { rows, cols } = getTerminalSize();
  const hud   = buildHUD(cols);
  const title = buildTitle();

  // Row indices where HUD lives (1-based)
  const row1 = rows - 1; // separator line
  const row2 = rows;     // content line

  const seq =
    `\x1b]0;${title}\x07`  +   // OSC: set terminal title
    '\x1b7'                +   // DECSC: save cursor
    `\x1b[${row1};1H`     +   // move to separator row
    '\x1b[2K'             +   // clear separator row
    `\x1b[${row2};1H`     +   // move to content row
    '\x1b[2K'             +   // clear content row
    `\x1b[${row1};1H`     +   // back to separator row
    hud                   +   // write 2-line HUD
    '\x1b8';                   // DECRC: restore cursor

  try {
    const fd = fs.openSync('/dev/tty', 'w');
    fs.writeSync(fd, seq);
    fs.closeSync(fd);
  } catch {
    // /dev/tty unavailable (CI / non-interactive), silently skip
  }
}

function scheduleRender(): void {
  if (renderTimer) clearTimeout(renderTimer);
  // 150 ms debounce — gives Gemini CLI's Ink time to finish its own re-render
  renderTimer = setTimeout(writeHUD, 150);
}

// ─── Event processing ───────────────────────────────────────────────────────

function processEvent(event: Record<string, unknown>): void {
  const name = event['hook_event_name'] as string | undefined;

  switch (name) {
    case 'SessionStart':
      state.tools        = {};
      state.tokens.used  = 0;
      state.sessionStart = Date.now();
      break;

    case 'AfterModel': {
      const req   = event['llm_request']  as Record<string, unknown> | undefined;
      const res   = event['llm_response'] as Record<string, unknown> | undefined;
      const usage = res?.['usageMetadata'] as Record<string, number>  | undefined;

      if (req?.['model']) {
        state.model        = req['model'] as string;
        state.tokens.total = getContextSize(state.model);
      }
      if (usage?.['totalTokenCount']) {
        state.tokens.used = usage['totalTokenCount'];
      } else if (usage?.['promptTokenCount']) {
        state.tokens.used = usage['promptTokenCount'];
      }
      break;
    }

    case 'AfterTool': {
      const toolName = event['tool_name'] as string | undefined;
      if (toolName) {
        state.tools[toolName] = (state.tools[toolName] ?? 0) + 1;
      }
      break;
    }
  }
}

// ─── Socket server ──────────────────────────────────────────────────────────

if (fs.existsSync(SOCKET_PATH)) {
  try { fs.unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
}

const server = net.createServer((socket) => {
  let buf = '';
  socket.on('data',  (d) => { buf += d.toString(); });
  socket.on('error', ()  => { /* ignore */ });
  socket.on('end',   ()  => {
    try {
      const event = JSON.parse(buf) as Record<string, unknown>;
      processEvent(event);
      scheduleRender();
    } catch { /* ignore malformed JSON */ }
  });
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    try { fs.unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
    server.listen(SOCKET_PATH);
  }
});

server.listen(SOCKET_PATH);

// ─── Graceful shutdown ──────────────────────────────────────────────────────

function shutdown(): void {
  if (renderTimer) clearTimeout(renderTimer);
  server.close();
  try { fs.unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
process.on('uncaughtException', () => { /* stay alive on unexpected errors */ });
