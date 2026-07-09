# Architecture: State, Permissions, Theme & i18n

- Last verified: 2026-07-09 · revision `1814ad0d`

## State management overview

Two side-by-side layers:

1. **Pinia** — exactly 3 stores (`systemSettings`, `theme`, `permission`). Setup-style.
   `pinia-plugin-persistedstate` is registered (`main.ts:33`) but **unused by any store**.
2. **Module-level singleton composables** — app-wide services holding refs at module scope
   (`useBackendStore`, `useBackendExtra`, `useLogs`, `useOverviewData`, monitoring
   single-fetchers, `useAgentInfo` pooled per-URL).

Persistence is hand-rolled everywhere (see `must/conventions.md` §5).

## Pinia stores

### `useSystemSettingsStore` — `src/stores/systemSettings.ts`

- Store id `"system-settings"`. Single field: `rpcDebugPanelEnabled: boolean`.
- localStorage key `nodeget.system-settings` (`:8`); hand-rolled read + deep `watch` write.
- Default from `VITE_RPC_DEBUG_PANEL_ENABLED` (`getDefaultConfig`, `:20-27`); stored value
  overrides.
- Returns `{ config }` (a `reactive`). Gates RPC debug panel capture (see below).

### `useThemeStore` — `src/stores/theme.ts`

- Store id `"theme"`. Refs: `isDark`, `colorTheme` (`ColorThemeName`), `customColor` (hex).
- Persistence (localStorage, hand-rolled): `color-theme` → `colorTheme` (default `"zinc"`);
  `color-theme-custom` → `customColor` (validated `#rgb`/`#rrggbb`, default `#3b82f6`).
- **Dark mode is NOT persisted here** — delegates to `src/theme/dom.ts` → `public/theme-init.js`
  via the **`theme` cookie** (see Theme §1).
- Methods: `setTheme`, `toggle`, `setColorTheme`, `setCustomColor`. `applyPalette` clears all
  palette CSS vars then sets the active variant (`:42-60`).

### `usePermissionStore` — `src/stores/permission/index.ts`

- Store id `"permission"`. Refs: `status` (`idle|loading|ready|error`), `error`, `tokenInfo`,
  `currentBackendKey` (cache key), `rules` (`PermissionRule[]`).
- Computed: `isSuperToken` = `username === "root"` (`:46`); `tokenLimits` (general/kv split);
  `availableScopes`.
- **No persistence** — runtime only; `clear()` on logout / backend switch / token invalidation.

**Key actions:**
- `refreshByBackend(backend)` (`:89`): caches by `${url}::${token}`; skips refetch if ready.
  Otherwise RPC `token_get({token})` → stores `tokenInfo` → `flattenTokenRules` into `rules`.
- `hasPermission(spec, scope?)` (`:140`): `true` for super token; else `hasPermissionBySpec`.
- `hasAnyScopePermission(spec)` (`:157`): UI-entrypoint helper.

**Wiring:** `App.vue:35-50` watches `currentBackend` and calls `refreshByBackend` on every
backend switch (deep, immediate). Also used by `rpc-debug-panel/RpcAuthView.vue`.

## Permission model internals — `src/stores/permission/utils.ts`

- `flattenTokenRules(token)` (`:227`): expands backend `token_limit` into flat
  `PermissionRule[]` = `{ scopeType, scopeValue, resource, action, target? }`.
- **Scope model** (`types.ts:26`): `global | agent_uuid | kv_namespace`.
- **Scope/resource compatibility** (`isScopeCompatible`, `:147`): `kv` resource matches only
  `global`/`kv_namespace`; everything else matches `global`/`agent_uuid`.
- **Spec format** `resource:action[:target]`, parsed by `parsePermissionSpec` (`:125`).
  - No `target` on a rule ⇒ all targets allowed.
  - `kv` resource supports `*` wildcard via cached regex (`:159,202`); other resources require
    exact target equality.
- **Scope matching** (`:183`): no/`global` request scope matches only `global` rules; a typed
    scope matches `global` rules OR same-type+same-value rules.

**Domain types** (`types.ts`): `token_key` is the opaque token id (not a secret);
`tokenInfo = { version?, token_key?, timestamp_from?, timestamp_to?, username?, token_limit? }`.

## Token: the central domain concept

"Token" **always** = the NodeGet JSON-RPC auth credential (never a UI/theme token). It surfaces
in three layers:

1. **Auth token (runtime)**: `Backend.token` — authenticates every RPC. See
   `architecture/backend-communication.md`.
2. **Token CRUD feature** (`src/components/token/` + `src/composables/token/`): issue/scope
   sub-tokens from the current (super) token. See `architecture/components-and-ui.md`.
3. **`ThemeToken` presets** (`src/types/theme.ts`): `{ name, backend_url, token }` — despite
   the name, these are **saved backend-token presets** (e.g. a "visitor monitor" share token),
   not colors. Stored in backend KV namespace `global`, key `theme_token`
   (`useThemeTokenPresets.ts`); can auto-provision default sub-tokens
   (`visitor_monitor_only`, `visitor_monitor_with_ping`).

Token type (`src/components/token/type.ts`):
`Token = { username, password, timestamp_from, timestamp_to, version, token_limit: TokenLimitEntry[] }`;
`TokenLimitEntry = { scopes, permissions }`; scope items `{global:null}` | `{agent_uuid}` |
`{kv_namespace}` | `{js_worker}`. `TokenDetail` adds `token_key`.

## Theme system (two cooperating layers)

### 1. Bootstrap — cookie-based, FOUC prevention

- `public/theme-init.js` loaded **synchronously** in `index.html:34`. Exposes
  `window.__NODEGET_THEME__ = { isDarkTheme, syncThemeDom, initTheme, applyTheme }`. Reads the
  `theme` **cookie** (`theme=dark|light`, max-age 1y). Injects a `<style>` setting
  `html`/`html.dark` background + `color-scheme` **before Vue mounts** — no flash.
- `src/theme/dom.ts` re-exports those calls, throwing if the bootstrap is absent.

### 2. Accent color — CSS variables

- `src/theme/palettes.ts`: `ColorThemeName = zinc|rose|blue|orange|yellow|stone|red|green|violet|custom`.
  `PALETTES` map sets CSS vars (`--primary`, `--primary-foreground`, `--ring`,
  `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-ring`) for light + dark.
  `buildCustomPalette(hex)` derives foreground via luminance.
- `applyPalette` (`theme.ts:42`) clears all palette keys across all palettes, then sets the
  active variant on `document.documentElement.style`.

### 3. Tailwind v4 + shadcn-vue tokens — `src/style/app.css`

`@import "tailwindcss"; @import "tw-animate-css"; @plugin "@tailwindcss/typography";`.
`@custom-variant dark (&:is(.dark *))` enables class-based dark mode. `@theme inline` maps
`--color-*` tokens to raw CSS vars. `:root` / `.dark` blocks define ~30 design tokens
(`--background`, `--foreground`, `--card`, `--primary`, `--sidebar-*`, `--chart-1..5`,
`--radius`) in oklch. No `tailwind.config.js` — Tailwind v4 is CSS-first.

## i18n — `src/main.ts:14-31`

`vue-i18n` composition mode (`legacy: false`, `globalInjection: true`, `fallbackLocale: "en"`).
Locale resolution: `localStorage["locale"]` → browser lang (`navigator.language.split("-")[0]`
if in `["en","zh_cn"]`) → `"en"`. Messages: `src/locales/en.ts` + `zh_cn.ts`, both bundled (no
lazy loading). Sidebar group keys live at `router.group.*`
(`monitor`, `nodeManage`, `tools`, `advanced`, `appExtensions`, `system`).

## RPC debug panel (state interaction)

Always mounted (`App.vue:69`); capture gated by `rpcDebugPanelEnabled`. Wired by
`installRpcDebugPanel(pinia)` (`main.ts:34`) → `installRpcDebugWebSocketPatch` which
monkey-patches `window.WebSocket` with a `DebugWebSocket` subclass tracking connections +
frames. `bindRpcDebugCaptureSetting` watches `useSystemSettingsStore().config.rpcDebugPanelEnabled`
to toggle capture live. See `architecture/components-and-ui.md` for the full panel.

## Update detection — `src/utils/detectUpdate.ts`

Polls `/.vite/version.json?ts=<now>` every 30 s (skipped in dev), comparing the `hash` from
`versionPlugin.ts`. On change shows a persistent toast. Side-effect import in `App.vue:13`.
