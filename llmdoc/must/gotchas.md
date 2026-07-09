# MUST: Gotchas

Non-obvious traps. Read before assuming the obvious thing.

## Backend protocol is not in this repo

The JSON-RPC method names, param shapes, and the `error_message`-in-result convention are
**inferred from frontend call sites only**. There is no IDL/schema here. Before treating a
method's params as authoritative, consider verifying against the NodeGet server.

Known client-side patches that hint at backend drift:
- `useJsRuntime.getWorker` maps `id = res.name` (`worker.ts`): backend returns `name` where
  `id` used to be.
- Some fields appear as both `create_at` and `created_at` across features — verify which the
  backend emits for a given endpoint.

## Params shape is deliberately inconsistent across endpoints

Not a bug. Different method families take different param shapes:
- Most server-scope methods: an **object** with a `token` field, e.g. `{ token, ... }`.
- Monitoring detail methods (`agent_query_dynamic`, `agent_query_dynamic_summary`) and some
  lifecycle methods: a **positional array**, e.g. `[token, { fields, condition }]`.
- Heartbeat / lifecycle: `[]` or `[token, version]`.

Match the existing shape for the domain you're editing; don't "normalize" it.

## Default timeouts differ by call site

- `WsConnection.call` / `callBatch` default **8000 ms**.
- The `rpc` closure inside most composables and `makeRpcFunction` default to **5000 ms**.
- Blocking task RPCs (`task_create_task_blocking`) use `timeout_ms + 200`.

When adding a call that may legitimately exceed 5s, pass an explicit `timeoutMs`.

## `useLogs` is the lone non-pooled socket

Server pushes log events via a `nodeget-server_stream_log` **method** message (server-initiated
JSON-RPC). The shared `WsConnection` only dispatches responses to its own pending ids — it has
no server-initiated-notification hook. So `useLogs` clones the connection logic into
`LogWsClient`. If you need server push for another feature, either extend `WsConnection` with
an on-method dispatch hook or follow the `useLogs` dedicated-socket pattern.

## Pinia persistedstate plugin: installed but inert

`createPersistedState()` is applied in `main.ts:33`, but zero stores pass the `persist` option.
Do not assume adding `persist: true` to a new store "just works" alongside the hand-rolled
persistence — pick one mechanism per store and be consistent. See `must/conventions.md` §5.

## Dynamic single-fetchers toggle a hidden WS knob

`useDynamicSummarySingle` uses a **dedicated** `WsConnection` (`dedicatedWs = true`),
`useDynamicSingle` uses the **shared pool** (`dedicatedWs = false`). These are hardcoded
booleans, not user-facing. If you see weird connection behavior in monitoring detail views,
this is why.

## RPC debug panel ships in production

`installRpcDebugPanel` monkey-patches `window.WebSocket` in `main.ts:34` — **always**, even in
production builds. Capture is globally gated by `useSystemSettingsStore().config.rpcDebugPanelEnabled`
(default from `VITE_RPC_DEBUG_PANEL_ENABLED`). The floating button only renders when enabled.
Don't be alarmed that `DebugWebSocket` wraps every connection; if capture is off, `emit` is a
no-op.

## `components.json` CSS path is stale

`components.json` records the Tailwind stylesheet as `src/app.css`, but the actual file is
`src/style/app.css`. Prettier and the Tailwind plugin correctly point at `./src/style/app.css`.
This only affects shadcn-vue `add` codegen hints, not the running app. Update it if you start
adding new shadcn components and the path resolves wrong.

## Generated router types are absent in the source tree

`src/types/typed-router.d.ts` is produced at build/dev time (`unplugin-vue-router` `dts`
option) and is gitignored. Route-name strings passed to `useRoute("/dashboard/app-panel/[id]")`
are typed by that generated file. If types look missing in a fresh checkout, run
`pnpm generate:typed-router` (or `pnpm dev`).

## `index.deprecated.vue` is dead code

`src/pages/index.deprecated.vue` is not picked up by the router generator (only `index.vue` is)
and is referenced nowhere. Treat as legacy; safe to delete if cleaning up.

## Sidebar node sub-nav is hardcoded

The `/dashboard/node/:uuid/*` sub-navigation in `Sidebar.vue` is a **fixed list**, not derived
from routes (unlike the main menu). docker/firewall/process/update entries exist in code but are
**commented out**. Extension `node` routes are appended dynamically. If you add a new node
sub-page, you must also edit `Sidebar.vue`'s `nodeRoutes`.

## Polling cadences (don't double-poll)

- Agent status / overview dynamic: **1000 ms**.
- Overview static: **60000 ms**.
- Batch-run result polling: **1000 ms**.
- Worker-log pooling: **100 ms** steps.

Module-level singleton composables (`useOverviewData`, the monitoring single-fetchers) own
these timers app-wide. Instantiating them per-component would create duplicate intervals.
