# Startup

The fastest path to orient in NodeGet-board. Read this first.

## What this is

NodeGet-board is the **dashboard (frontend)** for NodeGet — a self-hosted, multi-backend
server/node monitoring and remote-management platform. Built with Vue 3.5 + TypeScript +
Vite 7. It talks to NodeGet servers over **JSON-RPC 2.0 via WebSocket**.

This repo is frontend-only. The NodeGet **server** (backend) is not in this repo; its API is
inferred from the RPC call sites here (see `architecture/backend-communication.md` and
`reference/rpc-methods.md`).

## Run it

```sh
pnpm install
pnpm dev          # dev server on :5173, host 0.0.0.0
```

Requires Node `^20.19.0 || >=22.12.0` and pnpm.

### First-run dev setup

1. `cp example.env.development .env.development`
2. Set a reachable NodeGet server address + token:
   - `VITE_BACKEND_WS` — full WebSocket URL, e.g. `wss://host/nodeget/rpc`
   - `VITE_BACKEND_TOKEN` — a NodeGet API token for that server
3. `pnpm dev`. In dev mode with no saved backends, the env values seed a "Dev" backend
   automatically (`useBackendStore.ts:43-59`). In production the user adds backends via the
   `BackendSwitcher` dialog; both live in `localStorage` under `nodeget_backends`.

## Build

```sh
pnpm build        # generate:typed-router -> type-check + vite build
pnpm type-check   # vue-tsc --build
pnpm test         # node --test --experimental-strip-types tests/*.test.ts
pnpm format       # prettier --write .
```

`build` first generates the file-based router types (`scripts/typed-router.d.ts/`), then runs
type-check and the Vite build in parallel. The `versionPlugin` post-build step writes
`dist/.vite/version.json` (SHA-256 of `manifest.json`), polled client-side for update prompts.

## Where to look first (orientation map)

| You want to… | Read this |
|---|---|
| Understand the backend protocol | `architecture/backend-communication.md` |
| Add / change a page or route | `architecture/routing-and-layout.md` |
| Add a server interaction | `reference/rpc-methods.md` + a `src/composables/*` sibling |
| Understand state / permissions / theme | `architecture/state-and-theme.md` |
| Know the UI kit rules | `architecture/components-and-ui.md` |
| Know the project at a glance | `overview/project-overview.md` |
| Avoid breaking load-bearing conventions | `must/conventions.md`, `must/gotchas.md` |

## Entry-point files (read order)

1. `src/main.ts` — app bootstrap (Pinia + persistedstate plugin, router, i18n, RPC debug panel).
2. `src/App.vue` — root: mounts `RouterView`, the global `RpcDebugPanelDialog`, the toaster;
   watches `currentBackend` to refresh permissions on every backend switch.
3. `src/router/index.ts` — hash-history router built from file-based routes + the prefetch plugin.
4. `src/composables/useWsConnection.ts` — **the single RPC transport primitive** (connection
   pool, JSON-RPC framing, heartbeat, in-flight multiplexing). Everything server-bound flows
   through here.
5. `src/composables/useBackendStore.ts` — multi-backend selection, `localStorage`-persisted.
6. `src/layout/index.vue` — dashboard shell (Sidebar + Header + AppMain).

## Key facts that surprise newcomers

- **No REST API.** All server interaction is JSON-RPC over one persistent WebSocket per
  backend URL, multiplexed by request id. A few features also do plain `fetch` (HTTP) for
  large uploads / static routes, with `Authorization: Bearer <token>`.
- **Auth is per-RPC.** The WebSocket itself is unauthenticated; every call carries a `token`
  in its params. `username === "root"` is the super token (bypasses all permission checks).
- **"Token" always means the NodeGet auth credential** — never a UI/theme token. (`ThemeToken`
  presets are *saved auth tokens*, despite the name.)
- **File-based routing with a twist:** `unplugin-vue-router` maps `src/pages/` to routes, and
  files prefixed `__` become nested-route *parent layouts* (not routable pages).
- **Pinia persistedstate plugin is installed but unused** — all persistence is hand-rolled
  (`localStorage` for settings/color-theme/backends, cookie for dark mode).
- Two persistence layers side-by-side: Pinia (3 stores) for reactive app state, and
  module-level singleton composables (`useBackendStore`, etc.) for app-wide services.
