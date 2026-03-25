/**
 * Gemini CLI HUD — Daemon process (v3: DECSTBM bottom overlay)
 *
 * Uses DECSTBM to reserve the bottom 2 terminal rows for the HUD.
 * Gemini CLI's content and Ink UI scroll within the region above.
 * When content fills the screen, the HUD is right below Gemini's UI.
 */

import fs from 'fs';
import net from 'net';
import { execSync } from 'child_process';

const SOCKET_PATH = '/tmp/gemini-cli-hud.sock';
const LOG_FILE = '/tmp/gemini-hud-debug.log';
const HUD_HEIGHT = 2;

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

function buildHUD(cols: number): string {
  const { used, total } = state.tokens;
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  const barWidth = Math.max(8, Math.min(20, Math.floor(cols / 10)));
  const filled = Math.round((pct / 100) * barWidth);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);

  const modelName = state.model.replace(/^models\//, '').substring(0, 15);
  const elapsed   = formatElapsed(state.sessionStart);
  const usedK     = (used / 1_000).toFixed(0);
  const totalM    = (total / 1_000_000).toFixed(1);

  const segModel   = `\x1b[35;1m${modelName}\x1b[0m \x1b[90m${elapsed}\x1b[0m`;
  const segContext = `ctx \x1b[32m${bar}\x1b[0m \x1b[1m${pct}%\x1b[0m \x1b[90m(${usedK}k/${totalM}M)\x1b[0m`;

  const toolEntries = Object.entries(state.tools);
  const segTools = toolEntries.length > 0
    ? toolEntries.map(([n, c]) => `\x1b[33m${n}\x1b[0m×${c}`).join(' ')
    : '\x1b[90midle\x1b[0m';

  const sep  = `\x1b[90m${'─'.repeat(cols)}\x1b[0m`;
  const body = ` ${segModel} │ ${segContext} │ ${segTools}`;

  // Compact fallback for narrow terminals
  const visibleLen = body.replace(/\x1b\[[0-9;]*m/g, '').length;
  if (visibleLen > cols) {
    return `${sep}\n ${segModel} | ${pct}% | ${segTools}`;
  }

  return `${sep}\n${body}`;
}

function buildTitle(): string {
  const { used, total } = state.tokens;
  const pct   = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const short = state.model.replace(/^models\//, '').replace(/-preview$|-latest$/, '');
  const tools = Object.entries(state.tools).map(([n, c]) => `${n}×${c}`).join(' ') || 'idle';
  return `[HUD] ${short} | ${pct}% | ${tools}`;
}

/**
 * Write HUD to /dev/tty.
 *
 * DECSTBM reserves the bottom 2 rows (rows-1, rows) outside the scrolling
 * region. All terminal content (including Gemini CLI's Ink) scrolls within
 * rows 1..(rows-2). The HUD is painted at rows-1 and rows using cursor
 * save/restore so it never disturbs the cursor position.
 */
function writeHUD(): void {
  const { rows, cols } = getTerminalSize();
  const hud   = buildHUD(cols);
  const title = buildTitle();

  const scrollEnd = rows - HUD_HEIGHT;      // bottom of scrolling region
  const hudRow1   = rows - 1;               // separator
  const hudRow2   = rows;                   // data

  const seq =
    `\x1b[1;${scrollEnd}r`   +   // DECSTBM: scrolling in rows 1..scrollEnd
    `\x1b]0;${title}\x07`    +   // OSC: terminal title
    '\x1b7'                   +   // DECSC: save cursor
    `\x1b[${hudRow1};1H`      +   // move to separator row
    '\x1b[2K'                 +   // clear
    `\x1b[${hudRow2};1H`      +   // move to data row
    '\x1b[2K'                 +   // clear
    `\x1b[${hudRow1};1H`      +   // back to separator
    hud                       +   // write 2-line HUD
    '\x1b8';                      // DECRC: restore cursor

  try {
    const fd = fs.openSync('/dev/tty', 'w');
    fs.writeSync(fd, seq);
    fs.closeSync(fd);
  } catch (e) {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Render Error: ${e}\n`);
  }
}

function scheduleRender(): void {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(writeHUD, 100);
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
  socket.on('error', () => { /* ignore client errors */ });
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
  try {
    const { rows } = getTerminalSize();
    const fd = fs.openSync('/dev/tty', 'w');
    fs.writeSync(fd,
      '\x1b[r' +                             // reset DECSTBM
      '\x1b7' +                               // save cursor
      `\x1b[${rows - 1};1H\x1b[2K` +         // clear HUD separator
      `\x1b[${rows};1H\x1b[2K` +             // clear HUD data
      '\x1b8'                                 // restore cursor
    );
    fs.closeSync(fd);
  } catch { /* ignore */ }
  server.close();
  try { fs.unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
process.on('SIGWINCH', () => { scheduleRender(); });
process.on('uncaughtException', (e) => {
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Uncaught: ${e}\n`);
});
