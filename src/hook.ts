import fs from 'fs';

const STATE_FILE = '/tmp/gemini-cli-hud-state.json';

// Context window sizes by model prefix
const MODEL_CONTEXT: Record<string, number> = {
  'gemini-2.0-flash': 1_000_000,
  'gemini-2.5-pro': 1_000_000,
  'gemini-2.5-flash': 1_000_000,
  'gemini-1.5-pro': 2_000_000,
  'gemini-1.5-flash': 1_000_000,
};

interface HUDState {
  model: string;
  tokens: { used: number; total: number };
  tools: Record<string, number>;
}

function loadState(): HUDState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as HUDState;
    }
  } catch {
    // ignore
  }
  return { model: 'gemini', tokens: { used: 0, total: 1_000_000 }, tools: {} };
}

function saveState(state: HUDState): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf-8');
  } catch {
    // ignore
  }
}

function getContextSize(model: string): number {
  for (const prefix of Object.keys(MODEL_CONTEXT)) {
    if (model.startsWith(prefix)) return MODEL_CONTEXT[prefix];
  }
  return 1_000_000;
}

function renderHUD(state: HUDState): string {
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

function renderTitle(state: HUDState): string {
  const { used, total } = state.tokens;
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const shortModel = state.model.replace('gemini-', 'g-').replace('-preview', '').replace('-latest', '');
  const toolEntries = Object.entries(state.tools);
  const toolStr = toolEntries.length > 0
    ? toolEntries.map(([n, c]) => `${n}×${c}`).join(' ')
    : 'idle';
  return `[HUD] ${shortModel} | ctx ${percent}% (${(used / 1000).toFixed(0)}k) | ${toolStr}`;
}

function writeToTTY(text: string, titleText: string): void {
  try {
    const fd = fs.openSync('/dev/tty', 'w');
    // Set terminal window title (OSC 0) - persists through Ink re-renders
    fs.writeSync(fd, `\x1b]0;${titleText}\x07`);
    // Also try writing inline - may be overwritten by Ink but worth trying
    fs.writeSync(fd, `\n${text}\n`);
    fs.closeSync(fd);
  } catch {
    // TTY not available (e.g. in CI), silently skip
  }
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    setTimeout(() => resolve(data), 1000);
  });
}

async function main(): Promise<void> {
  const raw = await readStdin();

  let event: Record<string, unknown> = {};
  try {
    if (raw.trim()) event = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // not JSON, ignore
  }

  const state = loadState();
  const eventName = event['hook_event_name'] as string | undefined;

  if (eventName === 'SessionStart') {
    // Reset tool counts for new session
    state.tools = {};
    state.tokens = { used: 0, total: state.tokens.total };
  } else if (eventName === 'AfterModel') {
    const req = event['llm_request'] as Record<string, unknown> | undefined;
    const res = event['llm_response'] as Record<string, unknown> | undefined;
    const usage = res?.['usageMetadata'] as Record<string, number> | undefined;

    if (req?.['model']) {
      state.model = req['model'] as string;
      state.tokens.total = getContextSize(state.model);
    }
    if (usage?.['totalTokenCount']) {
      state.tokens.used = usage['totalTokenCount'];
    } else if (usage?.['promptTokenCount']) {
      state.tokens.used = usage['promptTokenCount'];
    }
  } else if (eventName === 'AfterTool') {
    const toolName = event['tool_name'] as string | undefined;
    if (toolName) {
      state.tools[toolName] = (state.tools[toolName] ?? 0) + 1;
    }
  }

  saveState(state);

  // Only render HUD after meaningful events
  if (eventName === 'AfterModel' || eventName === 'AfterTool') {
    const titleText = renderTitle(state);
    writeToTTY(renderHUD(state), titleText);
  }

  // Must output valid JSON to stdout for Gemini CLI
  process.stdout.write(JSON.stringify({ continue: true }) + '\n');
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ continue: true }) + '\n');
});
