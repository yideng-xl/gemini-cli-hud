/**
 * Gemini CLI HUD — Extension entry point (native statusLine API)
 *
 * This is a placeholder for when Google exposes a native UI injection API.
 * Currently the HUD is rendered via hook.ts + daemon.ts using DECSTBM.
 */
export default function init() {
    return {
        action: async (args) => {
            // Native statusLine API — used when available
            if (!args.gemini?.ui?.statusLine) {
                return { continue: true };
            }
            try {
                const used = args.usageMetadata?.totalTokenCount ?? 0;
                const total = 1_000_000;
                const percent = Math.min(100, Math.round((used / total) * 100));
                const barWidth = 10;
                const filled = Math.round((percent / 100) * barWidth);
                const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
                args.gemini.ui.statusLine.draw(`{magenta}[Gemini]{/magenta} {gray}|{/gray} {cyan}Context: ${bar} ${percent}% (${used}/${total}){/cyan}`);
            }
            catch { /* never block Gemini CLI */ }
            return { continue: true };
        },
    };
}
