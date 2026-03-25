import { jsxs as _jsxs } from "react/jsx-runtime";
import { Text } from 'ink';
export const ProgressBar = ({ progress, width }) => {
    const filledWidth = Math.max(0, Math.min(width, Math.round(progress * width)));
    const emptyWidth = width - filledWidth;
    return (_jsxs(Text, { children: ['#'.repeat(filledWidth), '-'.repeat(emptyWidth)] }));
};
