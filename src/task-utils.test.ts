import { describe, it, expect } from 'vitest';
import {
  parseChecklist,
  parseSteps,
  extractTaskProgress,
  updateTaskProgress,
  createInitialTaskProgress,
  toolBasedProgress,
  formatTaskModule,
} from './task-utils.js';

describe('parseChecklist', () => {
  it('should parse markdown checklist items', () => {
    const text = `
Here's the plan:
- [x] Install dependencies
- [x] Configure TypeScript
- [ ] Write tests
- [ ] Deploy to production
    `;
    const items = parseChecklist(text);
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({ done: true, label: 'Install dependencies' });
    expect(items[1]).toEqual({ done: true, label: 'Configure TypeScript' });
    expect(items[2]).toEqual({ done: false, label: 'Write tests' });
    expect(items[3]).toEqual({ done: false, label: 'Deploy to production' });
  });

  it('should handle uppercase X', () => {
    const items = parseChecklist('- [X] Done task');
    expect(items).toHaveLength(1);
    expect(items[0].done).toBe(true);
  });

  it('should handle asterisk bullets', () => {
    const items = parseChecklist('* [x] Task one\n* [ ] Task two');
    expect(items).toHaveLength(2);
    expect(items[0].done).toBe(true);
    expect(items[1].done).toBe(false);
  });

  it('should return empty for non-checklist text', () => {
    const items = parseChecklist('Just a regular paragraph with no tasks.');
    expect(items).toHaveLength(0);
  });

  it('should handle indented checklist items', () => {
    const items = parseChecklist('  - [x] Indented task\n  - [ ] Another');
    expect(items).toHaveLength(2);
  });
});

describe('parseSteps', () => {
  it('should parse numbered steps', () => {
    const text = `
1. Set up the project
2. Write the parser ✓
3. Add tests
4. Deploy
    `;
    const items = parseSteps(text);
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({ done: false, label: 'Set up the project' });
    expect(items[1]).toEqual({ done: true, label: 'Write the parser' });
    expect(items[2]).toEqual({ done: false, label: 'Add tests' });
  });

  it('should detect completion markers', () => {
    const text = '1. First step ✅\n2. Second step done\n3. Third step';
    const items = parseSteps(text);
    expect(items).toHaveLength(3);
    expect(items[0].done).toBe(true);
    expect(items[1].done).toBe(true);
    expect(items[2].done).toBe(false);
  });

  it('should detect Chinese completion marker', () => {
    const text = '1. 安装依赖 (完成)\n2. 编写代码\n3. 运行测试';
    const items = parseSteps(text);
    expect(items).toHaveLength(3);
    expect(items[0].done).toBe(true);
    expect(items[1].done).toBe(false);
  });

  it('should require at least 2 steps to avoid false positives', () => {
    const items = parseSteps('1. Only one item here');
    expect(items).toHaveLength(0);
  });

  it('should handle Step N: format', () => {
    const text = 'Step 1: Do this\nStep 2: Do that ✓\nStep 3: Final step';
    const items = parseSteps(text);
    expect(items).toHaveLength(3);
    expect(items[1].done).toBe(true);
  });
});

describe('extractTaskProgress', () => {
  it('should prefer checklist over steps', () => {
    const text = `
1. First item
2. Second item
- [x] Checklist A
- [ ] Checklist B
- [ ] Checklist C
    `;
    const progress = extractTaskProgress(text);
    expect(progress).not.toBeNull();
    expect(progress!.source).toBe('checklist');
    expect(progress!.total).toBe(3);
    expect(progress!.completed).toBe(1);
  });

  it('should fall back to steps when no checklist', () => {
    const text = '1. Step one ✓\n2. Step two\n3. Step three';
    const progress = extractTaskProgress(text);
    expect(progress).not.toBeNull();
    expect(progress!.source).toBe('steps');
    expect(progress!.total).toBe(3);
    expect(progress!.completed).toBe(1);
  });

  it('should return null for text without tasks', () => {
    const progress = extractTaskProgress('Hello world, no tasks here.');
    expect(progress).toBeNull();
  });
});

describe('updateTaskProgress', () => {
  it('should update when new text has tasks', () => {
    const current = createInitialTaskProgress();
    const updated = updateTaskProgress(current, '- [x] A\n- [ ] B\n- [ ] C');
    expect(updated.total).toBe(3);
    expect(updated.completed).toBe(1);
    expect(updated.source).toBe('checklist');
  });

  it('should keep current state when text has no tasks', () => {
    const current = createInitialTaskProgress();
    current.total = 5;
    current.completed = 2;
    const updated = updateTaskProgress(current, 'No tasks in this response');
    expect(updated.total).toBe(5);
    expect(updated.completed).toBe(2);
  });
});

describe('toolBasedProgress', () => {
  it('should count total calls and unique tools', () => {
    const result = toolBasedProgress({ Read: 5, Bash: 3, Edit: 2 });
    expect(result.totalCalls).toBe(10);
    expect(result.uniqueTools).toBe(3);
  });

  it('should handle empty tool counts', () => {
    const result = toolBasedProgress({});
    expect(result.totalCalls).toBe(0);
    expect(result.uniqueTools).toBe(0);
  });
});

describe('formatTaskModule', () => {
  it('should return null when no tasks', () => {
    const progress = createInitialTaskProgress();
    expect(formatTaskModule(progress)).toBeNull();
  });

  it('should format in-progress tasks', () => {
    const progress = { total: 5, completed: 2, items: [], source: 'checklist' as const, lastUpdated: Date.now() };
    const result = formatTaskModule(progress);
    expect(result).not.toBeNull();
    expect(result!.ansi).toContain('Tasks:');
    expect(result!.ansi).toContain('2/5');
  });

  it('should show check mark when all tasks done', () => {
    const progress = { total: 3, completed: 3, items: [], source: 'checklist' as const, lastUpdated: Date.now() };
    const result = formatTaskModule(progress);
    expect(result).not.toBeNull();
    expect(result!.ansi).toContain('3/3');
    expect(result!.ansi).toContain('✓');
  });

  it('should format in Chinese', () => {
    const progress = { total: 4, completed: 1, items: [], source: 'checklist' as const, lastUpdated: Date.now() };
    const result = formatTaskModule(progress, 'zh');
    expect(result).not.toBeNull();
    expect(result!.ansi).toContain('任务:');
  });
});
