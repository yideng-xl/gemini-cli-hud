# Project Context

This project uses the Superpowers framework for AI assistance.

## Core Directives

1. **Test-Driven Development (TDD) Enforced:**
   - You MUST strictly adhere to the Test-Driven Development process.
   - Always activate and follow the `test-driven-development` skill before writing any implementation code for features or bug fixes.
   - Workflow: Write failing tests -> Verify failure -> Write minimal code to pass -> Verify success -> Refactor.

2. **Package Management (PNPM):**
   - This project strictly uses **pnpm** for package and dependency management.
   - DO NOT use `npm` or `yarn`.
   - Use `pnpm install`, `pnpm add`, and `pnpm run <script>` for all related operations.