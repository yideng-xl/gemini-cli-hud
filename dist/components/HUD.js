import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { ProgressBar } from './ProgressBar.js';
export const HUD = ({ state, model, workspace }) => {
    const progress = state.tokens.total > 0 ? state.tokens.used / state.tokens.total : 0;
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "cyan", paddingX: 1, children: [_jsxs(Box, { justifyContent: "space-between", children: [_jsx(Text, { bold: true, color: "green", children: model }), _jsx(Text, { color: "gray", children: workspace })] }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Context: " }), _jsx(ProgressBar, { progress: progress, width: 20 }), _jsxs(Text, { children: [" ", Math.round(progress * 100), "% (", state.tokens.used, "/", state.tokens.total, ")"] })] }), _jsxs(Box, { marginTop: 0, children: [_jsx(Text, { children: "Tools: " }), Array.from(state.tools.entries()).map(([name, count]) => (_jsxs(Text, { color: "yellow", children: [" ", name, " x", count] }, name)))] })] }));
};
