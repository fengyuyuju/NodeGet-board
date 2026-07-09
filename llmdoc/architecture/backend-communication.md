# Architecture: Backend Communication

- Last verified: 2026-07-09 · revision `1814ad0d`

The single transport for all server interaction. Every feature flows through here.

## Transport: `src/composables/useWsConnection.ts`

**JSON-RPC 2.0 over WebSocket**, one persistent connection per backend URL, multiplexed by
request id. This is the only RPC primitive (the sole exception is `useLogs`, see below).

### `WsConnection` class (`useWsConnection.ts:70`)

One instance per backend URL. Holds a single `WebSocket`, a `connectPromise`, a
`pending: Map<string, PendingRequest>`, and a heartbeat timer.

- **`call<T>(method, params, timeoutMs = 8000, options?)`** (`:103`): awaits connection,
  registers a pending entry with a `setTimeout` reject, sends the frame, resolves/rejects on
  response. `options.onRequestId` lets a caller capture the assigned id; `options.idPrefix`
  prefixes it.
- **`callBatch<T>(requests, timeoutMs = 8000)`** (`:127`): mints an id per item, sends the
  array frame in one `ws.send`, returns `Promise.all` of per-id promises. Used for bulk KV
  writes/deletes and bulk task queries.
- **Request ids** (`generateId`, `:41`): `crypto.randomUUID()` when available, else a v4-style
  fallback; optionally prefixed.

### Heartbeat (`:81-94`)

Every `HEARTBEAT_INTERVAL_MS = 30_000` (`:16`), if the socket is OPEN, fires
`call("nodeget-server_hello", [])`. On heartbeat failure it closes the socket so
`ensureConnected` reconnects on the next real call. Detects silent network failures early.

### Connection lifecycle (`ensureConnected`, `:202`)

Lazy: created on first call, re-established automatically after a drop. On `onclose`, all
in-flight pending requests are rejected with `"<method> connection closed"` so nothing hangs
until timeout (`:222-232`). `onerror` rejects the connect promise; `onopen` starts the heartbeat.

### Module-level pool (`:262-277`)

- `pool = new Map<string, WsConnection>()` — one connection per backend URL, app-wide.
- `getWsConnection(url)` lazily creates + caches.
- `releaseWsConnection(url)` closes + deletes.
- `makeRpcFunction(backendUrl?)` (`:279`) — convenience factory returning a bound
  `rpc<T>(method, params, timeoutMs=5000)` closure; defaults to `currentBackend.value?.url`.

## Error contract (two paths)

`handleMessage` (`:169-200`) rejects on **both**:

1. Standard JSON-RPC `msg.error` → `formatRpcError(msg.error)` (`:177`).
2. **Result-wrapped error**: a success envelope whose `msg.result` is a non-array object with
   `error_message !== null` (`:185-197`). This is the backend's convention for returning
   application errors inside a successful RPC envelope.

Composables therefore always receive a rejected promise for backend errors.

## Backend selection: `src/composables/useBackendStore.ts`

A **module-level singleton composable** (not Pinia) managing multiple backends.

- **`Backend` = `{ name, url, token }`** (`:6`).
- localStorage keys: `nodeget_backends` (array), `nodeget_current_backend` (object) (`:9-10`).
- Module-level singleton refs (`:12-13`); state shared app-wide.
- **Dev-mode auto-add** (`:43-59`): when `DEV && backends.empty && VITE_BACKEND_WS`, pushes a
  `Dev` backend from `VITE_BACKEND_WS` + `VITE_BACKEND_TOKEN`, selects it if none current.
- Deep watchers persist + re-sync current on removal (`:71-103`).
- Ops: `addBackend` (selects if none current), `removeBackend` (match by url+token),
  `selectBackend`.

## Server discovery: `src/composables/useBackendExtra.ts`

Augments each `Backend` with runtime `ServerInfo` (`uuid`, `version`, `ip`,
`agentConfigWsUrl`). Fetches in parallel per backend on any `backends` change. Also orchestrates
server self-update (`nodeget-server_self_update`).

- `uuid`/`version`: `nodeget-server_uuid`, `nodeget-server_version`.
- `agentConfigWsUrl`: read/written via `useKv` namespace `"global"`, key `agent_config_ws_url`.
- `ip`: discovered by running a JS worker task `server-task-worker` (`{ task: { name: "ip" } }`)
  and polling its logs — server IP discovery is delegated to the JS runtime, not a direct RPC.

## Request dedupe: `src/composables/useInFlightDedupe.ts`

Generic wrapper exposing `{ data, error, isLoading, execute }`. If `execute` is called while a
promise is in flight, it returns the same promise (`:14-16`). Used by `useAgentInfo` and all
monitoring composables.

## The exception: streaming logs (`src/composables/useLogs.ts`)

The only composable that **does not use the shared pool**. The server pushes log events via a
`nodeget-server_stream_log` **method** message (server-initiated JSON-RPC), which the shared
`WsConnection` cannot dispatch. So `useLogs` maintains its own `LogWsClient` class — a
near-clone of `WsConnection`'s connect/pending/error handling — plus a push handler keyed on
`msg.method === LOG_STREAM_METHOD`, a `subscriptionId`, and pause/resume state.

- Methods: `nodeget-server_stream_log` (subscribe → returns subscription id),
  `nodeget-server_unsubscribe_stream_log`.

## Calling-convention summary

- **Wire format**: JSON-RPC 2.0 over one persistent WebSocket per backend URL. Batch = one
  array frame; responses per-id (not an array).
- **Default timeouts**: `call`/`callBatch` = 8000 ms; the `rpc` closures in most composables
  and `makeRpcFunction` = 5000 ms; blocking task RPCs = `timeout_ms + 200`.
- **Params shape varies by domain** (deliberate backend API shape — see `must/gotchas.md`):
  object-with-`token` for most server methods; positional array `[token, {fields, condition}]`
  for monitoring detail; `[]` / `[token, version]` for lifecycle/heartbeat.
- **HTTP fallback**: `useExtensions` and `useJsRuntime` also do plain `fetch` (ws→http URL
  rewrite) for large uploads and worker static routes, with `Authorization: Bearer <token>`.

## Polling cadences

| Feature | Cadence |
|---|---|
| Agent status / overview dynamic | 1000 ms |
| Overview static | 60000 ms |
| Batch-run result polling | 1000 ms |
| Worker-log pooling | 100 ms steps |

These timers are owned by module-level singleton composables — instantiating them
per-component would create duplicate intervals.
