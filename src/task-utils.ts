/**
 * Gemini CLI HUD — Task/Todo progress tracking
 *
 * Extracts task progress from Gemini's model responses by detecting
 * markdown checklists (- [x], - [ ]) and numbered step patterns.
 * Also tracks sequential tool execution as implicit task progress.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TaskProgress {
  /** Total tasks detected */
  total: number;
  /** Completed tasks */
  completed: number;
  /** Task items (last detected checklist) */
  items: TaskItem[];
  /** Source of task detection */
  source: 'checklist' | 'steps' | 'tools' | 'none';
  /** Timestamp of last update */
  lastUpdated: number;
}

export interface TaskItem {
  label: string;
  done: boolean;
}

// ─── Checklist detection ────────────────────────────────────────────────────

/**
 * Parse markdown checklist items from text.
 * Matches patterns like:
 *   - [x] Complete this task
 *   - [ ] Pending task
 *   * [X] Also supports asterisk bullets
 */
export function parseChecklist(text: string): TaskItem[] {
  const items: TaskItem[] = [];
  // Match markdown checklist: - [x] or - [ ] or * [x] or * [ ]
  const regex = /^[\s]*[-*]\s+\[([ xX])\]\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    items.push({
      done: match[1].toLowerCase() === 'x',
      label: match[2].trim(),
    });
  }
  return items;
}

/**
 * Parse numbered step patterns from text.
 * Matches patterns like:
 *   1. First step ✓
 *   2. Second step (done)
 *   3. Third step
 *   Step 1: Do something ✅
 */
export function parseSteps(text: string): TaskItem[] {
  const items: TaskItem[] = [];
  // Match "N. text" or "Step N: text" patterns
  const regex = /^[\s]*(?:(?:Step\s+)?\d+[.):\s]+)(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const label = match[1].trim();
    // Detect completion markers
    const done = /[✓✅☑]|done|\(完成\)|completed/i.test(label);
    items.push({ done, label: label.replace(/\s*[✓✅☑]\s*/g, '').trim() });
  }
  // Only return if we found at least 2 steps (avoid false positives)
  return items.length >= 2 ? items : [];
}

// ─── Task state management ──────────────────────────────────────────────────

export function createInitialTaskProgress(): TaskProgress {
  return {
    total: 0,
    completed: 0,
    items: [],
    source: 'none',
    lastUpdated: 0,
  };
}

/**
 * Extract task progress from model response text.
 * Tries checklist first, then numbered steps.
 */
export function extractTaskProgress(text: string): TaskProgress | null {
  // Try markdown checklist first (highest confidence)
  const checklistItems = parseChecklist(text);
  if (checklistItems.length >= 2) {
    return {
      total: checklistItems.length,
      completed: checklistItems.filter(i => i.done).length,
      items: checklistItems,
      source: 'checklist',
      lastUpdated: Date.now(),
    };
  }

  // Try numbered steps
  const stepItems = parseSteps(text);
  if (stepItems.length >= 2) {
    return {
      total: stepItems.length,
      completed: stepItems.filter(i => i.done).length,
      items: stepItems,
      source: 'steps',
      lastUpdated: Date.now(),
    };
  }

  return null;
}

/**
 * Update task progress with a new model response.
 * Only updates if new response contains recognizable task patterns.
 */
export function updateTaskProgress(
  current: TaskProgress,
  responseText: string,
): TaskProgress {
  const extracted = extractTaskProgress(responseText);
  if (extracted) return extracted;
  return current;
}

// ─── Tool-based progress tracking ───────────────────────────────────────────

/**
 * Estimate tool-based task progress from sequential tool calls.
 * When no explicit checklist is available, we track the tool execution
 * sequence as an implicit progress indicator.
 */
export function toolBasedProgress(
  toolCounts: Record<string, number>,
): { totalCalls: number; uniqueTools: number } {
  const totalCalls = Object.values(toolCounts).reduce((a, b) => a + b, 0);
  const uniqueTools = Object.keys(toolCounts).length;
  return { totalCalls, uniqueTools };
}

// ─── HUD rendering ──────────────────────────────────────────────────────────

/**
 * Format task progress for HUD display.
 * Returns { ansi, width } for module rendering.
 */
export function formatTaskModule(
  progress: TaskProgress,
  lang: 'en' | 'zh' = 'en',
): { ansi: string; width: number } | null {
  if (progress.total === 0) return null;

  const label = lang === 'zh' ? '任务:' : 'Tasks:';
  const ratio = `${progress.completed}/${progress.total}`;

  // Color based on completion ratio
  const pct = progress.completed / progress.total;
  let color = '\x1b[33m'; // Yellow (in progress)
  if (pct >= 1) color = '\x1b[32m'; // Green (all done)
  if (pct === 0) color = '\x1b[90m'; // Gray (none done)

  const check = pct >= 1 ? ' \x1b[32m✓\x1b[0m' : '';
  const ansi = `${color}${label} ${ratio}${check}\x1b[0m`;

  // Calculate visible length
  const visibleText = `${label} ${ratio}${pct >= 1 ? ' ✓' : ''}`;
  return { ansi, width: visibleText.length };
}
