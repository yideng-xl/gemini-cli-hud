import { jsx as _jsx } from "react/jsx-runtime";
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { HUD } from './HUD';
describe('HUD', () => {
    it('should render model, tokens progress and tool usage', () => {
        const state = {
            tokens: { used: 500, total: 1000 },
            tools: new Map([['Bash', 2], ['Read', 1]])
        };
        const { lastFrame } = render(_jsx(HUD, { state: state, model: "gemini-2.0-flash", workspace: "gemini-cli-hud" }));
        const frame = lastFrame();
        expect(frame).toContain('gemini-2.0-flash');
        expect(frame).toContain('gemini-cli-hud');
        // Progress bar for 500/1000 should have half '#' (assuming width 20, 10 '#')
        expect(frame).toContain('##########----------');
        expect(frame).toContain('Bash x2');
        expect(frame).toContain('Read x1');
    });
});
