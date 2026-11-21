# MargAI project harness

Use ECC's installed Codex plugin skills for scoped work. Codex owns plugin installation and hook trust; do not copy plugin files or install Claude hooks.

## Project map
- `apps/web`: React 18, TypeScript, Vite; primary public website and driver workflows.
- `services/api`: Express REST API and `/v1/relay` WebSocket server.
- `packages/contracts`: shared types and Zod schemas; change both together.
- `packages/risk-engine`: deterministic relevance policy; preserve opposite-lane suppression.
- `services/assistance`: optional Gemini integration with explicit template fallback.
- `margai-cloud-mvp`: independent upstream prototype; do not confuse its relay with the root application.

## Work loop
1. Inspect affected contracts and callers; preserve user work and latest upstream detection changes.
2. State completion checks before editing. Use `docs/DESIGN_CONTRACT.md` for interface work.
3. Make focused changes with explicit loading, empty, error and permission states. Never present seeded or simulated data as live observations, or local submissions as authority acknowledgements.
4. Run `npm run verify` (tests, real TypeScript checks, production build). With the API running, run `npm run test:integration`.
5. Inspect changed screens in ECC Chrome DevTools at 1440x1000 and 390x844. Record real evidence under `docs/verification`; do not mark untested states passed.
6. Summarize results and outstanding external-service limits. Never print secrets or commit `.env` files.

## Local startup and recovery
- `npm ci`, then `npm run build:packages`, then `npm run dev`.
- Web: http://localhost:5173; API: http://localhost:8080/health.
- Browser requests use `serviceUrl` / `serviceSocketUrl`; Vite proxies REST and WebSocket to port 8080.
- Production: `npm run build && npm start` serves frontend and backend on port 8080.
- For a split deployment set `VITE_API_ORIGIN` before building; keep camera models on the frontend origin.
- Fix a failed contract/build check before browser testing. Report network or credential failures accurately; do not hide them with fabricated success data.
