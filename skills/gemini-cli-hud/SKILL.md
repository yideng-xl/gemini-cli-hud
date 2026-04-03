---
name: gemini-cli-hud
description: Activates when user asks about HUD status, terminal display issues, or wants to check context usage and tool call statistics
---

# Gemini CLI HUD Extension

## Overview
This extension provides a real-time, sticky status bar (HUD) at the bottom of your terminal during Gemini CLI sessions. It tracks token usage, context progress, and tool activity.

## Capability
- **Sticky UI:** Stays at the bottom of the terminal using DECSTBM scroll regions.
- **Token Monitoring:** Real-time display of token consumption with progress bar.
- **Context Tracking:** Visual progress bar for context window usage percentage.
- **Tool Activity:** Summary of tool calls with counts (e.g., `✓ Read ×8 | ✓ Bash ×4`).
- **Session Info:** Model name, GEMINI.md count, extensions count, active skill, elapsed time.

## Troubleshooting
- If the HUD disappears, it will redraw on the next Gemini CLI event.
- If the terminal looks broken after exit, run `reset` to clear the scroll region.
- The HUD adjusts to terminal width — modules wrap to new lines on narrow terminals.

## Usage
Automatically loads when the session starts. No user action needed.
