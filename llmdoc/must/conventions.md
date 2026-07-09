# MUST: Conventions

Load-bearing conventions. Violating these silently breaks the app. Read before editing.

## 1. All server interaction goes through `useWsConnection`

- **Never** `new WebSocket()` directly for RPC — except `useLogs.ts`, which needs its own
  socket for server-pushed log streams. Any other feature must obtain a connection via
  `getWsConnection(url)` from `src/composables/useWsConnection.ts`.
- Frame format is **JSON-RPC 2.0**: `{ jsonrpc: "2.0", id, method, params }`. Batch sends one
  array frame; responses come back **per-id**, not as an array.
- Auth is **per-RPC** (the `token` lives in `params`, never in a header). `username === "root"`
  is the super token and bypasses all permission checks.

## 2. Two error paths on every RPC

`WsConnection.handleMessage` rejects the caller's promise on **both** (`useWsConnection.ts:177-197`):
1. Standard JSON-RPC `msg.error`.
2. **Result-wrapped error**: a *successful* envelope whose `msg.result` is an object with
   `error_message !== null`.

Composables therefore always receive a rejected promise for backend errors and should
`try/catch` + surface via `vue-sonner` toast. Do not assume a resolved result means success —
but you don't need to check `error_message` yourself, the transport does it.

## 3. File-based routing: `__`-prefix means parent layout

`unplugin-vue-router` is configured with `exclude: ["**/__*.vue"]`
(`scripts/typed-router.d.ts/shared.ts`). Consequences:

- A file named `__foo.vue` becomes the **nested-route parent layout**, not a routable page.
  Its children render into the parent's `<router-view />`. E.g. `dashboard/__app.vue` is the
  parent of `dashboard/app/__docker.vue` → route `/dashboard/app/docker`.
- The leading `__` is stripped from the URL segment.
- Regular filenames (lowercase, `[param]` for dynamics) map to routes as-is.

When adding a page that should host child tabs, name it `__name.vue` and give it a
`<router-view />` (directly or via `RouterViewLayout.vue`).

## 4. Route metadata is the shared contract

`RouteMeta` (`src/types/router.d.ts`) drives **both** the sidebar and the prefetch engine:

| Field | Sidebar use | Prefetch use |
|---|---|---|
| `title` | i18n key for the label | — |
| `icon` | Lucide component OR URL string (extension icon) | — |
| `hidden` | hides from menu | **disables prefetch** |
| `order` | sort within group (default 99) | — |
| `group` | i18n key of sidebar group | — |
| `isClosed` | collapsed-by-default | **disables prefetch** |
| `prefetch` | — | overrides priority (`false`/`"off"` skip; `"high"`/`"normal"`/`"low"`; number) |

Set `definePage({ meta })` in the page's `<script setup>`.

## 5. Persistence is hand-rolled (Pinia persistedstate is unused)

The `pinia-plugin-persistedstate` is registered in `main.ts:33` but **no store uses `persist`**.
Each subsystem persists itself:

- Settings: `localStorage["nodeget.system-settings"]`.
- Theme accent: `localStorage["color-theme"]` / `["color-theme-custom"]`.
- Dark mode: the **`theme` cookie**, via `public/theme-init.js` (`window.__NODEGET_THEME__`) —
  *not* localStorage, to prevent FOUC.
- Backends: `localStorage["nodeget_backends"]` / `["nodeget_current_backend"]` (in
  `useBackendStore`, not Pinia).
- Locale: `localStorage["locale"]`.

Don't switch a store to `persist:` without understanding these hand-rolled paths, and don't
migrate dark-mode persistence to localStorage (it would reintroduce flash).

## 6. Backend argument threading

Most data composables accept `backend = useBackendStore().currentBackend` as an optional
`Ref<Backend|null>` param and derive `backendUrl`/`backendToken` via `computed`. This lets a
feature target a **non-current** backend (used by `useBackendExtra`, `useLifecycle`, extension
install). Keep this param when adding a composable; don't hardcode the current backend.

## 7. Styling: `cn()` + `cva`, Tailwind v4 CSS-first

- Merge classes with `cn()` from `@/lib/utils` (`twMerge(clsx(...))`). Never hand-concatenate
  conditional class strings.
- Define component variants with `class-variance-authority` (`cva`), as in `ui/button`.
- Tailwind v4 has **no `tailwind.config.js`**. Config is CSS-first via `@theme inline` in
  `src/style/app.css`. Design tokens are CSS variables in `:root` / `.dark` (oklch).
- Dark mode is the `.dark` class on `<html>` (`@custom-variant dark (&:is(.dark *))`).

## 8. RPC method naming

`{domain}_{verb_object}`, snake_case. Multi-word domains use hyphens
(`static-bucket-file_*`, `js-worker_*`, `crontab-result_*`). See
`reference/rpc-methods.md` for the full domain list.
