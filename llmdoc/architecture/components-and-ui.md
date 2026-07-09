# Architecture: Components & UI Kit

- Last verified: 2026-07-09 · revision `1814ad0d`

## UI Kit (`src/components/ui/`) — shadcn-vue

Confirmed by `components.json` (`$schema: shadcn-vue`): `style: new-york`, `baseColor: zinc`,
`cssVariables: true`, `iconLibrary: lucide`. Aliases: `@/components`, `@/components/ui`,
`@/lib/utils`, `@/lib`, `@/composables`.

### Styling stack

- **Tailwind v4** (`tailwindcss ^4.1.18`) via `@tailwindcss/vite`, CSS-first config in
  `src/style/app.css`. `@tailwindcss/typography` + `tw-animate-css`.
- **`reka-ui` ^2.9.2** — headless Vue primitives (the shadcn-vue primitive layer).
- **`class-variance-authority`** (`cva`) for variants (e.g. `ui/button/index.ts`).
- **`cn()`** (`src/lib/utils.ts`) = `twMerge(clsx(inputs))` — the universal class glue, imported
  by every UI component and feature component. Never hand-concatenate conditional classes.
- **`lucide-vue-next`** — icon set.

### Component inventory (33 dirs)

alert, alert-dialog, badge, button (`cva` variants + 6 sizes), card (+ Action/Content/...),
checkbox, collapsible, command (cmdk-style), dialog (9 parts), dropdown-menu (minimal),
flickering-grid (custom animated background, used by `App.vue`), input, label, number-field,
pagination, pop-confirm (custom), popover, progress, radio-group, **rainbow-button** (custom
animated gradient), scroll-area, select (10 parts), separator, skeleton, spinner, switch,
table (TanStack-friendly, 9 parts + utils), tabs, tags-input, textarea, tooltip.

Each lives in `src/components/ui/<name>/` with an `index.ts` barrel + `.vue` files, following
the shadcn-vue convention: a reka-ui primitive wrapped with `cn()` + `cva`.

## Feature components (`src/components/<feature>/`, 19 dirs)

Each maps 1:1 to a platform capability and a `src/pages/dashboard/*` route, composes the UI kit,
and talks to the backend **exclusively** through `src/composables/*`. One-sentence purposes:

| Feature dir | Purpose |
|---|---|
| `agents/` | Onboard a new agent: generate install token + display the one-line install command. |
| `batch-exec/` (+`widgets/`) | Run a shell/script snippet across selected nodes; render per-node results. |
| `cron/` | Create/edit cron tasks, assign target nodes, browse execution history. |
| `extensions/` | Install/uninstall extensions (bundled worker + static frontend + `global`/`node` routes). |
| `js-runtime/` | Edit/list JS Workers-style scripts (`onCall`/`onInlineCall`/`onCron`/`onRoute`); CodeMirror. |
| `kv/` | Browse/edit the server KV store by namespace/entry, with per-node and flat views. |
| `logsPanel/` (+`components/`) | Streaming log viewer (subscribe/pause/resume/clear, target+level filters). |
| `map/` | World-map of nodes: ECharts flat map **and** Three.js 3D globe (switchable). |
| `misc/` | Small shared utilities (loaders, QR, mock input). |
| `node/` (root) | `NodeMetadataForm` (custom name, region, etc.). |
| `node/latency/` | Latency monitoring: UPlot time-series + canvas quality viz. |
| `node/setting/` | Tabbed node config: basic, raw TOML, storage, upstream chain, delete. |
| `node/status/` (+`composables/`) | Real-time CPU/Disk/Memory/Network dashboard (UPlot + live labels). |
| `node/traffic/` | ECharts per-node traffic bar chart. |
| `node-manage/` | Management hub: registered backends + agents, share/version dialogs. |
| `ping/` | Ping/tcp-ping probes vs fixed Chinese ISP nodes (`src/data/pingNodes.ts`); China map + histogram + quality canvas + table. |
| `rpc-debug-panel/` (+`components/`) | Dev console: compose raw JSON-RPC, method catalog, auth/network/streams; patches `window.WebSocket`. |
| `script/` | CRUD for reusable shell snippets. |
| `servers-detail/` | Backend-level database storage usage (ECharts). |
| `static-bucket/` | Static-file buckets: create, upload files/dirs, browse tree, preview (CodeMirror). |
| `theme-management/` | Author/import runtime themes (JSON token presets + CSS/JS), upload to a bucket. |
| `token/` (+ subdirs) | Full token lifecycle: create (templates), edit, import, detail/list + per-module permission editors. |

### Token subsystem (`src/components/token/`)

Entry cards: `create-token/`, `detailToken/`, `editToken/`, `importToken/`, `token-list/`.
Shared workspace: `TokenEditorWorkspace.vue`, `TokenCreateModeSelect.vue`,
`TokenSuccessDialog.vue`, `TokenTemplateList.vue`, base-info/limit forms, JSON previews.
**Per-resource permission editors** under `components/permissions/`: Crontab, CrontabResult,
DynamicMonitoring, DynamicMonitoringSummary, JsResult, JsWorker, Kv, NodeGet,
StaticMonitoring, Task, Terminal (+ `permissionsCard`, `permissionsState.ts`,
`kvPermissionState.ts`, `usePermissionModuleOpen.ts`). Codec: `scopeCodec.ts`
(`serializeTokenPayload`, `mapTokenDetailToForm`, `buildOptionalFieldPayload`,
`createDefaultToken`). Templates: `tokenTemplates.ts`, `tokenPermissionTemplates.ts`.

### Top-level `src/components/*.vue`

- `BackendSwitcher.vue` — dialog to add/select/remove backends (builds
  `wss://host/nodeget/rpc`, uses `RainbowButton` CTA, persists via `useBackendStore`).
- `UPlotChart.vue` — generic UPlot time-series wrapper (1–3 series, zoom, area mode, loading
  spinner). Consumed by all `node/status/*Tab.vue` and `node/latency/latency.vue`.
- `WebTerminal.vue` — xterm.js WebShell via WebSocket `/terminal` (creates a `web_shell` task
  via `task_create_task`); slide-out script panel pastes saved snippets.
- `SettingsDialog.vue`, `HeaderView.vue`, `FooterView.vue`, `WorkInProcessPage.vue`.

## Visualization library homes (non-overlapping)

| Library | Used in |
|---|---|
| **uPlot** | `UPlotChart.vue` → `node/status/*Tab.vue`, `node/latency/latency.vue` (monitoring time-series) |
| **ECharts 6** | `map/FlatWorldMap.vue`, `node/traffic/TrafficBarChart.vue`, `ping/PingChinaMapNative.vue`, `ping/PingHistogram.vue`, `servers-detail/DatabaseStorageTab.vue` |
| **Three.js** | `map/Globe3DMap.vue` (the single 3D globe; procedural earth texture from `public/geo/world.json`, country hit-testing, arc routes, starfield) |
| **xterm 6** | `WebTerminal.vue` (the only terminal) |
| **CodeMirror 6** | ~10 call sites: `agents/*`, `extensions/ExtensionDetail`, `js-runtime/WorkerFormDialog`, `kv/KvSet|ViewDialog`, `node-manage/codeCopy`, `static-bucket/StaticBucketFileView`, `theme-management/ThemeDetail`, `pages/dashboard/js-runtime/[id]`, `pages/dashboard/servers-detail/[backendName]` |
| **markdown-it** | `extensions/ExtensionDetail` |
| **modern-screenshot** | `composables/useScreenshot` |
| **qrcode / vue3-colorpicker** | `misc/qrcode.vue`, theme color picking |

### Data files backing visualizations

- `src/data/mapRegionCoords.ts` — `REGION_COORDS` (China provinces + countries → `[lon,lat]`).
- `src/data/regions.ts` — `REGIONS` (ISO-3166 alpha-2 + Chinese name) for the region selector.
- `src/data/pingNodes.ts` — `PING_NODES` (Chinese ISP + international ping targets).
- `public/geo/world.json`, `public/geo/100000_full.json` — GeoJSON for the maps.

## RPC debug panel (`src/components/rpc-debug-panel/`)

Opt-in network inspector for JSON-RPC-over-WebSocket traffic.

- **`install.ts`** → `installRpcDebugWebSocketPatch` (`main.ts:34`, always wired).
- **`websocketPatch.ts`** — replaces `window.WebSocket` with `DebugWebSocket` subclass tracking
  connections + emitting `RpcDebugWebSocketEvent`s. `emit` no-ops unless `captureEnabled`
  (gated by `useSystemSettingsStore().config.rpcDebugPanelEnabled`). Ships in production but
  only records when enabled.
- **`rpcDebugStore.ts`** — module-level (not Pinia) store: `records`, `selectedRecordId`,
  `isPaused`, `settings` (`maxRecords 500`, `maskTokens`, `captureNotifications`,
  `captureRawFrames`, `formatJson`), `connections`. Correlates req/res by `connectionId:id`.
  Masks sensitive keys (`token`, `supertoken`, `father_token`, `password`, `authorization`,
  `secret`, `token_secret`) and first-array-param for `agent_/task_/kv_/crontab_/js-/js_/token_/nodeget-server_`
  methods. `stream_*` methods tracked as `subscription`.
- **`rpcMethodCatalog.ts`** — canonical RPC method templates (with `无鉴权`/`Token`/`SuperToken`
  hints) for the Composer tab.
- **UI** — `RpcDebugPanelDialog.vue` (floating button + dialog, globally mounted `App.vue:69`).
  Tabs: `network`, `composer`, `subscription`, `auth`, `settings` (`RpcNetworkView`,
  `RpcComposerView`, `RpcStreamsView`, `RpcAuthView`, `RpcSettingsView` + `RpcNetworkDrawer`,
  `RpcDebugDataTable`). `RpcAuthView` calls `permissionStore.refreshByBackend`.

## Flickering background

`App.vue` `provide`s `background` (`"default"|"flickering"`) + `setBackground`. `setBackground`
writes a 1-year `background=<val>` cookie (`App.vue:14-17`). When `"flickering"`, `FlickeringGrid`
renders in a `fixed inset-0 z-[-1]` masked layer. The toggle UI (consumer side) lives in the
settings dialog / settings page.
