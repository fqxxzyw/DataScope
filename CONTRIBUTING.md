# Contributing

DataScope includes ContextMap as a local text exploration module. Keep changes small and explain the user-visible behavior.

1. Install Node.js 24 and run `npm ci`.
2. Run `npm run dev`. Use the included synthetic demos; never commit personal corpora.
3. Keep NLP functions independent from React. Add numeric tests for algorithm changes and interaction tests for workflows.
4. Run `npm run lint`, `npm test`, `npm run build` and `npm run test:ui` (install Chromium with `npx playwright install chromium`).
5. Open a pull request with the problem, solution and validation. CI checks the real Windows executable at 100%, 125%, 150% and 200% scaling.

All processing must remain local. Do not add telemetry, cloud NLP APIs, model training or backend services. Explain algorithm boundaries and privacy effects. Follow the existing TypeScript strict, ESLint and Prettier configuration; use `npm run format` for formatting. Contributions are licensed under MIT.
