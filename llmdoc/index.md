# NodeGet-board — llmdoc Index

- Project: NodeGet-board — the Vue 3 dashboard for NodeGet (multi-backend server/node monitoring).
- Last doc update: 2026-07-09 · verified at revision `1814ad0d`.
- **Code is the source of truth.** These docs may lag — on conflict, trust the code and
  consider running `/llmdoc:update`.

## Read order for newcomers

1. [`startup.md`](startup.md) — run/build + orientation map.
2. [`overview/project-overview.md`](overview/project-overview.md) — what NodeGet is + tech stack.
3. [`must/conventions.md`](must/conventions.md) + [`must/gotchas.md`](must/gotchas.md) —
   load-bearing rules and traps.

## MUST (read before editing)

- [`must/conventions.md`](must/conventions.md) — the conventions you must not silently break:
  RPC transport, file-based routing `__` rule, route meta contract, hand-rolled persistence,
  `cn()`/`cva`/Tailwind v4, RPC naming.
- [`must/gotchas.md`](must/gotchas.md) — non-obvious traps: backend protocol not in repo,
  inconsistent param shapes, timeout differences, `useLogs` lone socket, persistedstate inert,
  debug panel ships in prod, stale `components.json`, generated router types, hardcoded node
  sub-nav, polling cadences.

## Overview

- [`overview/project-overview.md`](overview/project-overview.md) — capabilities →
  components/routes map, tech stack, high-level data flow, repo layout.

## Architecture

- [`architecture/backend-communication.md`](architecture/backend-communication.md) — the single
  RPC transport: `WsConnection` pool, JSON-RPC framing, heartbeat, two error paths, backend
  store/selection, server discovery, dedupe, the `useLogs` exception, polling cadences.
- [`architecture/routing-and-layout.md`](architecture/routing-and-layout.md) — file-based
  routing, the `__`-prefix rule, route hierarchy, the ~1000-line prefetch engine, the dashboard
  shell, sidebar generation (router-driven main menu + hardcoded node sub-nav).
- [`architecture/state-and-theme.md`](architecture/state-and-theme.md) — the 3 Pinia stores +
  module-level singletons, hand-rolled persistence, permission model internals, the Token
  domain concept, the two-layer theme system (cookie bootstrap + CSS-var palettes), i18n.
- [`architecture/components-and-ui.md`](architecture/components-and-ui.md) — shadcn-vue UI kit
  (33 components), the 19 feature dirs, token subsystem, visualization library homes, the RPC
  debug panel, flickering background.

## Reference

- [`reference/rpc-methods.md`](reference/rpc-methods.md) — JSON-RPC method catalog by domain
  (inferred from call sites), naming convention, param-shape reminder.
- [`reference/build-and-env.md`](reference/build-and-env.md) — commands, Vite/tsconfig,
  router type-gen, lint/format/hooks, CI, env vars.

## Guides

- [`guides/adding-a-feature.md`](guides/adding-a-feature.md) — the canonical
  component→composable→`useWsConnection`→RPC walkthrough for adding a server-backed feature.

## Memory (not stable docs — separate from the map above)

- `memory/reflections/` — post-task reflections (populated by the workflow over time).
- `memory/decisions/` — recorded design decisions.

> Scratch investigation material lives in `.llmdoc-tmp/investigations/` and is **not** part of
> the stable doc set. The four initial-investigation reports there
> (`01-pages-routing`, `02-composables-data-layer`, `03-state-config`,
> `04-components-features`) are the raw source these docs were condensed from; consult them only
> for deeper detail not carried into the stable docs.
