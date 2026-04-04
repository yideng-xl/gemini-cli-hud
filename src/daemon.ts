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
import {
  type HUDState,
  createInitialState,
  getContextSize,
  formatElapsed,
  formatTokens,
  formatTokenRate,
  formatCost,
  detectAuthType,
  createProgressBar,
  visibleLen,
  buildSeparator,
  buildTitle,
  packModulesIntoLines,
  processEvent,
  countGeminiMd,
  countExtensions,
} from './hud-utils.js';
import { loadConfig, type HudConfig } from './config.js';

const SOCKET_PATH = process.argv[2] || '/tmp/gemini-cli-hud.sock';
const HUD_HEIGHT = 2;

// Get workspace name from CWD
const workspace = path.basename(process.cwd());

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  try {
    fs.appendFileSync('/tmp/gemini-hud.log', `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* ignore */ }
}

let state: HUDState = createInitialState();

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

// ─── i18n ────────────────────────────────────────────────────────────────────

const I18N = {
  en: {
    waiting: 'waiting for session...',
    ctx: 'Ctx:',
    session: 'Session:',
    ext: 'ext',
    tokPerSec: (r: string) => `${r} tok/s`,
  },
  zh: {
    waiting: '等待会话...',
    ctx: '上下文:',
    session: '会话:',
    ext: '扩展',
    tokPerSec: (r: string) => `${r} 词元/秒`,
  },
} as const;

// ─── Rendering ──────────────────────────────────────────────────────────────

function buildHUDBar(): string[] {
  const { cols } = getTerminalSize();
  const config = loadConfig();
  const t = I18N[config.language];

  // Before first AfterModel event, show waiting state
  if (!state.model) {
    return [buildSeparator(cols), ` \x1b[2m${t.waiting}\x1b[0m`];
  }

  const { used, total } = state.tokens;
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const short = state.model.replace(/^models\//, '').replace(/-preview$|-latest$/, '');
  const elapsed = formatElapsed(state.sessionStart);

  // Define modules — each is an atomic unit that never breaks mid-content
  // Order follows config.modules; display flags control sub-options
  const modules: { ansi: string; width: number }[] = [];

  for (const mod of config.modules) {
    switch (mod) {
      case 'model': {
        let modelSeg = `\x1b[1;32m${short}\x1b[0m`;
        if (config.display.showAuth) {
          const authType = detectAuthType();
          const authColor = authType === 'OAuth' ? '\x1b[36m' : '\x1b[33m';
          modelSeg += ` ${authColor}${authType}\x1b[0m`;
        }
        modules.push({ ansi: modelSeg, width: visibleLen(modelSeg) });
        break;
      }
      case 'meta': {
        if (config.display.showMeta) {
          const mdCount = countGeminiMd(state.cwd);
          const extCount = countExtensions();
          const metaSeg = `\x1b[36m${mdCount} GEMINI.md\x1b[0m \x1b[35m${extCount} ${t.ext}\x1b[0m`;
          modules.push({ ansi: metaSeg, width: visibleLen(metaSeg) });
        }
        break;
      }
      case 'skill': {
        if (config.display.showSkill && state.activeSkill) {
          const skillSeg = `\x1b[95m⚡${state.activeSkill}\x1b[0m`;
          modules.push({ ansi: skillSeg, width: visibleLen(skillSeg) });
        }
        break;
      }
      case 'context': {
        if (config.display.showContext) {
          const usedStr = formatTokens(used);
          const totalStr = formatTokens(total);
          const barWidth = Math.min(20, Math.max(4, Math.floor(cols * 0.12)));
          const bar = createProgressBar(pct, barWidth);
          const rateNum = config.display.showTokenRate ? state.tokenRate : 0;
          let rateSuffix = '';
          if (rateNum > 0) {
            const rateVal = rateNum >= 1000 ? `${(rateNum / 1000).toFixed(1)}K` : `${rateNum}`;
            rateSuffix = ` \x1b[33m${t.tokPerSec(rateVal)}\x1b[0m`;
          }
          const ctxSeg = `\x1b[1m${t.ctx}\x1b[0m ${bar} ${pct}% \x1b[2m(${usedStr}/${totalStr})\x1b[0m${rateSuffix}`;
          modules.push({ ansi: ctxSeg, width: visibleLen(ctxSeg) });
        }
        break;
      }
      case 'tools': {
        if (config.display.showTools) {
          const toolEntries = Object.entries(state.tools);
          const toolStr = toolEntries.length > 0
            ? toolEntries.map(([n, c]) => `\x1b[32m✓\x1b[0m ${n} \x1b[90m×${c}\x1b[0m`).join(' \x1b[90m|\x1b[0m ')
            : '-';
          modules.push({ ansi: toolStr, width: visibleLen(toolStr) });
        }
        break;
      }
      case 'cost': {
        if (config.display.showCost && state.estimatedCost > 0) {
          const inStr = formatTokens(state.totalInputTokens);
          const outStr = formatTokens(state.totalOutputTokens);
          const costSeg = `\x1b[33m↑${inStr} ↓${outStr} ${formatCost(state.estimatedCost)}\x1b[0m`;
          modules.push({ ansi: costSeg, width: visibleLen(costSeg) });
        }
        break;
      }
      case 'session': {
        if (config.display.showSession) {
          const sessionSeg = `\x1b[36m${t.session} ${elapsed}\x1b[0m`;
          modules.push({ ansi: sessionSeg, width: visibleLen(sessionSeg) });
        }
        break;
      }
    }
  }

  const contentLines = packModulesIntoLines(modules, cols);

  return [buildSeparator(cols), ...contentLines];
}

// ─── Event processing ───────────────────────────────────────────────────────

// Auto-exit after 10 minutes of inactivity (prevents stale daemons)
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
let idleTimer: ReturnType<typeof setTimeout>;

function resetIdleTimer(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => shutdown(), IDLE_TIMEOUT_MS);
}

resetIdleTimer();

function handleEvent(event: Record<string, unknown>): void {
  resetIdleTimer();
  if (event['_termCols']) cachedTermSize.cols = event['_termCols'] as number;
  if (event['_termRows']) cachedTermSize.rows = event['_termRows'] as number;
  state = processEvent(state, event);
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
      handleEvent(event);

      const title = buildTitle(state);
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
