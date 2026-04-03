import { jsx as _jsx } from "react/jsx-runtime";
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { ProgressBar } from './ProgressBar';
describe('ProgressBar', () => {
    it('should render a bar with correct fill percentage', () => {
        const { lastFrame } = render(_jsx(ProgressBar, { progress: 0.5, width: 10 }));
        // 50% of 10 is 5. We expect 5 filled characters and 5 empty characters.
        // Assuming '#' for filled and '-' for empty.
        expect(lastFrame()).toContain('#####-----');
    });
});
