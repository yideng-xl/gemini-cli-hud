<div align="center">

# Gemini CLI HUD 💎

A zero-interference, title-bar observability heads-up display (HUD) for [Gemini CLI](https://github.com/google/gemini-cli).

[![npm version](https://img.shields.io/npm/v/gemini-cli-hud.svg)](https://www.npmjs.com/package/gemini-cli-hud)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

*Read this in other languages: [🇬🇧 English](README.md), [🇨🇳 简体中文](README.zh-CN.md).*

</div>

---

**Gemini CLI HUD** is a real-time status monitor that runs seamlessly alongside your Gemini CLI sessions. It provides critical context about your AI agent's internal state without cluttering your terminal or interfering with standard inputs.

## ✨ Features

- **Real-Time Context Usage:** Instantly see the percentage of the context window consumed.
- **Active Model Tracking:** Always know which model (e.g., `gemini-2.0-flash`) is currently reasoning.
- **Tool Observability:** Monitor how many tools the agent has called during the session.
- **Zero Interference:** Exclusively utilizes the OS Terminal Title Bar (OSC 0) to ensure your typing, scrolling, and history remain 100% untouched.

## 🚀 Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/gemini-cli-hud.git
   cd gemini-cli-hud
   ```

2. **Install dependencies and build:**
   ```bash
   pnpm install
   pnpm run build
   ```

3. **Install to your Gemini extensions directory:**
   ```bash
   bash install.sh
   ```

## 🛠 The Journey: Why Title Bar? (A Call to the Community)

Our original goal was to perfectly replicate a sticky status bar pinned to the bottom of the terminal. However, we ran into fundamental architectural differences between Gemini CLI and native UI applications. 

Here is what we tried, why it failed, and why we need your help:

- **Attempt 1: `DECSTBM` (Scrolling Margins)**
  We tried using ANSI escape sequences (`DECSTBM`) to reserve the bottom 2 rows. 
  *Result:* Gemini CLI's underlying [Ink](https://github.com/vadimdemedes/ink) rendering engine does not track external scrolling margin changes. This led to massive screen corruption and jumpy cursors.
  
- **Attempt 2: Background Daemon with Absolute Positioning**
  We ran a background Node.js daemon that drew the HUD to the bottom row (`\x1b[H`) every 100ms.
  *Result:* Race conditions. The daemon and Gemini CLI's Ink engine fought over `/dev/tty`, causing the `Enter` key and text inputs to behave erratically.

- **Attempt 3: Synchronous Top-Row Rendering**
  We moved the HUD to the absolute top row (`\x1b[1;1H`) and only rendered it synchronously during hook events.
  *Result:* Ruined scroll history. As terminal text scrolled upwards, the HUD stamped over the chat history, leaving "ghosts" in the scrollback buffer.

### Native UI vs. External Hooks
**Claude HUD works perfectly** because Anthropic provides a native `statusline API` that injects data directly into the application's internal Ink render tree.
**Gemini CLI HUD is an external hook.** We operate in a separate process (`hook.js`) and have to fight the main Ink engine for control of `/dev/tty`.

### How You Can Help!
Until Google officially exposes a UI/statusline API for Gemini CLI extensions, the **Terminal Title Bar (OSC 0)** is the only 100% safe, zero-interference way to display stats. 

If you are a terminal wizard who knows a foolproof way to inject a sticky bottom row without breaking Ink, or if you work on Gemini CLI—please open an issue or submit a PR! We'd love to make the bottom HUD a reality.

## 💡 Inspiration

This project is heavily inspired by the amazing [Claude HUD](https://github.com/jarrodwatts/claude-hud) created by [Jarrod Watts](https://github.com/jarrodwatts) for Anthropic's Claude Code. We wanted to bring that same level of observability and elegance to the Gemini CLI ecosystem!

## 👥 Contributors

- **You (The Developer)** - Creator and maintainer
- **Gemini CLI (Gemini 2.0 Flash)** - AI pair programmer & co-architect (Current implementation and problem-solving)
- **Claude 3.7 Sonnet** - AI pair programmer (Initial explorations)
