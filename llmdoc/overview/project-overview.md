# Project Overview

- Last verified: 2026-07-09 · revision `1814ad0d` · see `index.md` for doc map.

## What NodeGet-board is

The Vue 3 dashboard ("board") for **NodeGet** — a self-hosted, **multi-backend** server/node
monitoring and remote-management platform. This repository is **frontend-only**. A NodeGet
deployment consists of:

- A **NodeGet server** ("backend" / "main controller") exposing a **JSON-RPC API over
  WebSocket** at `/nodeget/rpc`, with tiered auth (no-auth / Token / SuperToken).
- **Agents** (controlled nodes) that register with a server via an install command + token.

The board lets one operator manage **several NodeGet servers at once**, switching the active
backend and re-scoping permissions/data on each switch (`App.vue:35-50`).

## Platform capabilities (map 1:1 to feature dirs + routes)

| Capability | Component dir(s) | Composable(s) | Dashboard route |
|---|---|---|---|
| Node management & live monitoring | `node/status`, `node/latency`, `node/traffic`, `node-manage`, `agents` | `useOverviewData`, `monitoring/*`, `useAgentInfo`, `useAgentConfig` | `/dashboard/node/:uuid/*`, `/dashboard/node-manage`, `/dashboard/overview` |
| Geographic map of nodes | `map` (ECharts flat + Three.js globe) | — | `/dashboard/map` |
| Remote execution | `batch-exec`, `WebTerminal.vue`, `script` | `useBatchExec`, `useBatchRun`, `useScripts` | `/dashboard/batch-exec`, `/dashboard/scripts` |
| Scheduling | `cron` | `useCron`, `useCronHistory` | `/dashboard/cron`, `/dashboard/cron-history/:name` |
| JS runtime (Workers-style) | `js-runtime` | `useJsRuntime` | `/dashboard/js-runtime`, `/dashboard/js-runtime/:id` |
| KV store | `kv` | `useKv` | `/dashboard/kv` |
| Static hosting / buckets | `static-bucket` | `useStaticBucket`, `useStaticBucketFile` | `/dashboard/static-bucket`, `/dashboard/bucket/:name` |
| Extensions | `extensions` | `useExtensions` | `/dashboard/app-panel`, `/dashboard/app/:route`, `/dashboard/node/:uuid/:route` |
| Tokens & permissions | `token` (+ per-module permission editors) | `composables/token/*` | `/dashboard/token` (+ create/edit/import/detail) |
| Themes (runtime) | `theme-management` | `useThemeBucketUpload`, `useThemeTokenPresets` | `/dashboard/theme-management` |
| Streaming logs | `logsPanel` | `useLogs` (dedicated socket) | `/dashboard/logs` |
| RPC debug console | `rpc-debug-panel` | — (patches `window.WebSocket`) | global dialog (always mounted) |
| Settings | `SettingsDialog.vue`, pages | `useBackendExtra` | `/dashboard/settings/*` |

## Tech stack

- **Framework**: Vue 3.5 (`<script setup lang="ts">`), Vite 7, TypeScript ~5.9.
- **Routing**: `vue-router` 4 + `unplugin-vue-router` (file-based, hash history).
- **State**: Pinia 3 (+ `pinia-plugin-persistedstate`, installed but unused). Many app-wide
  services live in module-level singleton composables instead.
- **i18n**: `vue-i18n` 11 (composition mode), `en` + `zh_cn` bundled.
- **UI**: shadcn-vue (`new-york` style, zinc base) → Tailwind v4 (CSS-first) + `reka-ui` +
  `class-variance-authority` + `cn()` (`twMerge(clsx())`).
- **Visualization**: ECharts 6 (maps/traffic/ping/storage), Three.js (3D globe), uPlot
  (monitoring time-series via shared `UPlotChart.vue`), xterm 6 (WebShell), CodeMirror 6
  (code/JSON editing, ~10 call sites).
- **Misc**: `markdown-it`, `modern-screenshot`, `qrcode`, `vue3-colorpicker`, `fflate`,
  `diff`, `compare-versions`, `smol-toml`, `lucide-vue-next`.

## High-level data flow

```
User ──> Vue components (src/components/<feature>)
            │
            ▼
      composables (src/composables/*)        ← business logic / state / polling
            │
            ▼
   useWsConnection (pool, JSON-RPC frame)    ← single transport primitive
            │
            ▼
   WebSocket ──wss://backend/nodeget/rpc────> NodeGet server
```

Every server-bound feature follows **component → composable → `useWsConnection` → RPC**.
Exceptions: `useLogs` uses its own dedicated socket (server-pushed log stream);
`useExtensions` / `useJsRuntime` also do plain HTTP `fetch` for large uploads / static routes.

## Repository layout (essentials)

```
src/
  main.ts, App.vue            app bootstrap + root
  pages/                      file-based routes (→ vue-router)
  router/                     index.ts + prefetchPlugin.ts (~1000 lines)
  layout/                     dashboard shell: Sidebar / Header / AppMain
  components/
    ui/                       shadcn-vue kit (33 components)
    <feature>/                one dir per platform capability (19 dirs)
  composables/                data/business layer (37 files incl. monitoring/, token/)
  stores/                     Pinia: systemSettings, theme, permission/
  lib/                        cn(), base64, delay, Defered, password, migration
  types/                      domain types: task, agent, monitoring, worker, theme, router
  theme/                      dom.ts (FOUC bootstrap), palettes.ts (accent colors)
  style/app.css               Tailwind v4 + shadcn tokens
  locales/                    en, zh_cn
  data/                       static: mapRegionCoords, regions, pingNodes
scripts/typed-router.d.ts/    unplugin-vue-router instance + type-gen config
versionPlugin.ts              post-build manifest hashing
public/                       theme-init.js, geo/*.json
demo-extension/, demo-static-bucket/   sample extension + hosted site
```

## Out of scope of this repo

- The NodeGet **server** implementation and its RPC IDL (the method contract is inferred here
  from frontend call sites — see `reference/rpc-methods.md` for the convention).
- `tests/` and the `demo-*` directories are not documented in depth.
