/**
 * Gemini CLI HUD — Daemon process (v3: DECSTBM bottom overlay)
 *
 * Uses DECSTBM to reserve the bottom 2 terminal rows for the HUD.
 * Gemini CLI's content and Ink UI scroll within the region above.
 * When content fills the screen, the HUD is right below Gemini's UI.
 */

import fs   from 'fs';
import net  from 'net';
import path from 'path';
import { execSync } from 'child_process';

const SOCKET_PATH = '/tmp/gemini-cli-hud.sock';
const HUD_HEIGHT = 2;

// Get workspace name from CWD
const workspace = path.basename(process.cwd());

function countGeminiMd(dir: string): number {
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  try {
    fs.appendFileSync('/tmp/gemini-hud.log', `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* ignore */ }
}

// Context window sizes by model prefix (tokens)
const MODEL_CONTEXT: Record<string, number> = {
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

interface HUDState {
  model: string;
  tokens: { used: number; total: number };
  tools: Record<string, number>;
  activeSkill: string;
  cwd: string;
  sessionStart: number;
  lastUpdated: number;
}

let state: HUDState = {
  model: '',
  tokens: { used: 0, total: 0 },
  tools: {},
  activeSkill: '',
  cwd: '',
  sessionStart: Date.now(),
  lastUpdated: Date.now(),
};

function countExtensions(): number {
  try {
    const extDir = path.join(process.env['HOME'] || '', '.gemini', 'extensions');
    if (!fs.existsSync(extDir)) return 0;
    return fs.readdirSync(extDir).filter(name => {
      const full = path.join(extDir, name);
      return fs.statSync(full).isDirectory() && !name.startsWith('.');
    }).length;
  } catch { return 0; }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getContextSize(model: string): number {
  const m = model.toLowerCase();
  for (const [prefix, size] of Object.entries(MODEL_CONTEXT)) {
    if (m.includes(prefix)) return size;
  }
  return 1_000_000;
}

// Cached terminal size from hook (hook has access to real /dev/tty)
const cachedTermSize = { rows: 0, cols: 0 };

function getTerminalSize(): { rows: number; cols: number } {
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
    if (r > 4 && c > 20) return { rows: r, cols: c };
  } catch { /* fall through */ }
  return { rows: 24, cols: 80 };
}

function formatElapsed(startMs: number): string {
  const s = Math.floor((Date.now() - startMs) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}

function createProgressBar(pct: number, width: number): string {
  const fullBlocks = Math.floor((pct / 100) * width);
  const partials = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
  const remainder = ((pct / 100) * width) - fullBlocks;
  const partialIdx = Math.floor(remainder * 8);
  
  const bar = '█'.repeat(fullBlocks) + 
              (fullBlocks < width ? partials[partialIdx] : '') + 
              ' '.repeat(Math.max(0, width - fullBlocks - 1));
  
  // Apply colors based on usage
  let color = '\x1b[32m'; // Green
  if (pct > 70) color = '\x1b[33m'; // Yellow
  if (pct > 90) color = '\x1b[31m'; // Red
  
  return `${color}${bar}\x1b[0m`;
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function buildTitle(): string {
  if (!state.model) return '💎 gemini-cli-hud | waiting...';
  const { used, total } = state.tokens;
  const pct   = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const short = state.model.replace(/^models\//, '').replace(/-preview$|-latest$/, '');
  const toolCount = Object.values(state.tools).reduce((a, b) => a + b, 0);
  return `💎 ${short} | ${pct}% | ${toolCount} tools`;
}

// Strip ANSI codes to calculate visible width
function visibleLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function buildSeparator(cols: number): string {
  const label = ' gemini-cli-hud ';
  const sepLen = Math.max(0, cols - label.length);
  const left = Math.floor(sepLen / 2);
  const right = sepLen - left;
  return `\x1b[90m${'─'.repeat(left)}${label}${'─'.repeat(right)}\x1b[0m`;
}

function buildHUDBar(): string[] {
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
  const modules: { ansi: string; width: number }[] = [];

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

  // Pack modules into lines, wrapping at module boundaries
  const divider = ' \x1b[90m│\x1b[0m ';
  const divW = 3; // visible width of " │ "
  const pad = 1;  // leading space per line

  const lines: string[] = [];
  let curAnsi = '';
  let curWidth = 0;

  for (const mod of modules) {
    const needed = curWidth === 0 ? pad + mod.width : divW + mod.width;
    if (curWidth > 0 && curWidth + needed > cols) {
      // Wrap: flush current line, start new
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

  // Cap at 3 content lines max to not eat too much terminal
  const contentLines = lines.slice(0, 3);

  return [buildSeparator(cols), ...contentLines];
}

// ─── Event processing ───────────────────────────────────────────────────────

function processEvent(event: Record<string, unknown>): void {
  const name = event['hook_event_name'] as string | undefined;
  state.lastUpdated = Date.now();
  if (event['cwd']) state.cwd = event['cwd'] as string;
  if (event['_termCols']) cachedTermSize.cols = event['_termCols'] as number;
  if (event['_termRows']) cachedTermSize.rows = event['_termRows'] as number;

  switch (name) {
    case 'SessionStart':
      state.model        = '';
      state.tools        = {};
      state.tokens       = { used: 0, total: 0 };
      state.activeSkill  = '';
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
      if (usage?.['promptTokenCount']) {
        state.tokens.used = usage['promptTokenCount'];
      } else if (usage?.['totalTokenCount']) {
        state.tokens.used = usage['totalTokenCount'];
      }
      break;
    }

    case 'AfterTool': {
      const toolName = event['tool_name'] as string | undefined;
      if (toolName === 'activate_skill') {
        const input = event['tool_input'] as Record<string, unknown> | undefined;
        if (input?.['name']) {
          state.activeSkill = input['name'] as string;
        }
      } else if (toolName) {
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
      
      const title = buildTitle();
      const bar = buildHUDBar();
      socket.write(JSON.stringify({ title, bar }));
      socket.end();
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

// ─── Resize watcher — re-render HUD when terminal size changes ─────────────

// NOTE: Daemon does NOT write to /dev/tty directly.
// Only the hook process renders HUD (synchronous with Gemini CLI, no race conditions).

// ─── Graceful shutdown ──────────────────────────────────────────────────────

function shutdown(): void {
  server.close();
  try { fs.unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
process.on('uncaughtException', (e) => {
  log(`Uncaught: ${e}`);
});
