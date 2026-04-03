import fs from 'fs';
/**
 * Gemini CLI 扩展入口
 * 此函数直接运行在 CLI 进程中，可以操作 UI 对象
 */
export default function init() {
    return {
        action: async (args) => {
            const { gemini, usageMetadata } = args;
            // 核心诊断日志
            fs.appendFileSync('/tmp/gemini-extension-load.log', `[HUD] Action called at ${new Date().toISOString()} | UI: ${!!gemini?.ui} | StatusLine: ${!!gemini?.ui?.statusLine}\n`);
            if (!gemini || !gemini.ui || !gemini.ui.statusLine) {
                return { continue: true };
            }
            try {
                const used = usageMetadata?.totalTokenCount || 0;
                const total = 1000000;
                const percent = Math.min(100, Math.round((used / total) * 100));
                // 渲染进度条 (使用标准 ANSI 兼容字符)
                const barWidth = 10;
                const filled = Math.round((percent / 100) * barWidth);
                const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
                // 使用 CLI 支持的标签语法进行着色
                const statusLine = `{magenta}[Gemini 1.5 Pro]{/magenta} {gray}|{/gray} {cyan}Context: ${bar} ${percent}% (${used}/${total}){/cyan}`;
                // 执行渲染
                gemini.ui.statusLine.draw(statusLine);
                fs.appendFileSync('/tmp/gemini-extension-load.log', `[HUD] Render success: ${used} tokens\n`);
            }
            catch (e) {
                fs.appendFileSync('/tmp/gemini-extension-load.log', `[HUD] Render Error: ${e.message}\n`);
            }
            return { continue: true };
        }
    };
}
