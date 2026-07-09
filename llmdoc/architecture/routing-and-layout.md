# Architecture: Routing & Layout

- Last verified: 2026-07-09 · revision `1814ad0d`

## File-based routing (`unplugin-vue-router` v0.19.2)

**Config:** `scripts/typed-router.d.ts/shared.ts:4-12`

```ts
unpluginVueRouter({
  routesFolder: [{ src: "./src/pages", exclude: ["**/__*.vue"] }],
  dts: "./src/types/typed-router.d.ts",
});
```

The instance is imported into `vite.config.ts:11`. The generated `typed-router.d.ts` is a
build/dev artifact (gitignored); run `pnpm generate:typed-router` if types are missing.

### The `__`-prefix rule (load-bearing)

`exclude: ["**/__*.vue"]` turns any `__`-prefixed file into a **nested-route parent layout**,
not a routable page. Consequences:

- `dashboard/__app.vue` is the parent of `dashboard/app/__docker.vue` → route
  `/dashboard/app/docker`. Children render into the parent's `<router-view />`.
- The leading `__` is stripped from the URL segment.
- Regular filenames map to routes as-is; `[param]` denotes dynamic segments;
  `[...404].vue` → catch-all.

### Route hierarchy (key paths)

```
/                                  index.vue (redirect: node-manage if no backends, else overview)
├── /dashboard                     dashboard.vue → <Layout/>, redirect → /dashboard/overview
│   ├── overview, node-manage, map, cron, scripts, batch-exec, cost   (sidebar-visible)
│   ├── app-panel      → <router-view/>, redirect → /dashboard/app-panel/list
│   ├── app            __app.vue (parent) → redirect → /dashboard/app/docker
│   │     ├── app/files, app/docker, app/firewall, app/process   (__-prefixed children)
│   │     └── app/:extensionRoute   (extension fallback, hidden)
│   ├── node/:uuid     [uuid].vue (parent) → <router-view/>, redirect → .../status
│   │     ├── status, latency, traffic, ping, webshell, files, setting
│   │     └── :extensionRoute       (extension fallback, hidden)
│   ├── settings       → <RouterViewLayout/>, redirect → /dashboard/settings/site
│   ├── token (+ tokenCeate/tokenEdit/tokenDetail/tokenImport — hidden)
│   ├── js-runtime (+ /:id), kv, static-bucket (+ bucket/:name)
│   ├── theme-management, logs, about
│   └── cron-history/:cronName, servers-detail/:backendName   (hidden)
├── /server-detail/:uuid            server-detail/[uuid].vue (OUTSIDE the dashboard layout, legacy)
└── /:404(.*)*                      [...404].vue
```

### Router creation (`src/router/index.ts`)

`createWebHashHistory()` (hash routing) → `routes: preparePrefetchableRoutes(routes)` →
`setupRoutePrefetchRouter(router)`. Routes come from the virtual `vue-router/auto-routes`
module. Installed in `main.ts:36`.

## The prefetch engine (`src/router/prefetchPlugin.ts`, ~1010 lines)

A custom layer that wraps every lazy `() => import()` route component, assigns each route a
priority, and drains a priority-ordered queue during browser idle time.

### Exports

- **`preparePrefetchableRoutes(routes)`** (`:993`): called before `createRouter`. Walks the
  tree (`processRoutes`), computes priority per record, records a devtools inspector entry, and
  **replaces `route.component`/`route.components`** with a wrapped tracking loader
  (`wrapLoader` → `registerLoader`). Dedupes concurrent calls, tracks success/failure. Returns
  the routes mutated.
- **`setupRoutePrefetchRouter(router)`** (`:1000`): idempotent (`configuredRouters` WeakSet).
  Monkey-patches `router.install` so that on `app.use(router)`, `installRoutePrefetch` runs:
  attaches the Vue Devtools plugin, a `visibilitychange` listener, an initial preload, and
  `router.isReady()` / `router.afterEach(...)` hooks that re-trigger idle preloading.

### Priority model

`RoutePrefetchPriority`: `Low = 80`, `Normal = 180`, `High = 260`. Resolved by
`getRoutePriority` (`:835`) in this precedence:

1. **Explicit `meta.prefetch`** (`:800`): `false`/`"off"` → skip; finite `number` → that
   value; `true`/`"normal"` → Normal; `"high"` → High; `"low"` → Low.
2. `meta.hidden` → skip.
3. `meta.isClosed` → skip.
4. Dynamic path (contains `:`) → skip.
5. Depth > 3 → skip.
6. **Path heuristics**: `/dashboard` → Normal; `/` → Normal; depth-2 under `/dashboard/` →
   Normal; depth-3 under `/dashboard/app/` or `/dashboard/settings/` → Low; else skip.

### Queue execution

- Single entry loaded per tick (`pending()`, `:136`). `preload()` (`:621`) is guarded by
  `isPreloading`; schedules the next tick if more remain. Failures logged, queue continues.
- **Throttle**: 200 ms debounce (`debouncePreload`) → `scheduleIdle` →
  `requestIdleCallback` (1000 ms timeout, else `setTimeout(fn, 500)`).
- **Triggers**: loader registration, priority updates, plugin install, `router.isReady()`,
  every `afterEach` navigation, tab becoming visible.
- **Failure handling**: `PREFETCH_MAX_ATTEMPTS = 3`; backoff `[5s, 15s, 30s]`. On
  `visibilitychange` → visible, `resetStaleFailures` clears attempts so the queue retries.

### Devtools integration

A "Route Prefetch" Devtools plugin with a timeline layer
(`nodeget:router-prefetch:timeline`) and a custom inspector showing registered/loaded/pending
counts plus priority buckets (high/normal/low/skipped).

## Layout (`src/layout/`)

`dashboard.vue` mounts `layout/index.vue` — the dashboard shell.

- **`index.vue`** — `flex h-screen`, wrapped in `TooltipProvider`: mobile overlay backdrop +
  `Sidebar` + a column (`DashboardHeader` on top, `AppMain` below). Manages `collapsed` and
  `isMobileSidebarOpen`.
- **`components/AppMain.vue`** — `<main>` scroll host with a `<router-view>` wrapped in
  `<Transition name="page" mode="out-in">`. This renders the top-level matched child of
  `/dashboard`.
- **`components/DashboardHeader.vue`** — `h-14` top bar. On `/dashboard/node/:uuid` routes
  shows a `Select` to switch the active agent (preserving the current sub-tab); always shows a
  back button + `SettingsDialog`.
- **`components/RouterViewLayout.vue`** — a one-line `<router-view />` used as the body of
  collapsible parents (`__app.vue`, `settings.vue`) so children render inside the parent record.

**Two RouterView levels**: `AppMain`'s `<router-view>` renders the top-level matched child
(e.g. `overview.vue` or `__app.vue`). Nested parents then provide their own `<router-view>` for
deeper children.

## Sidebar generation (`Sidebar.vue`, `SidebarItem.vue`)

The sidebar is **generated from the live router's route table**, not hardcoded — except the
node-detail sub-nav.

### Main menu (`Sidebar.vue:169-254`)

- `buildMenuTree(parentPath)` (`:169`): `router.getRoutes()` → filter to direct children of
  `parentPath` → drop `meta.hidden` → sort by `meta.order ?? 99` → recurse. Called with
  `"/dashboard"`.
- `groupedRoutes` (`:236`): buckets top-level routes by `meta.group` into a `Map`, then appends
  **extension global routes** under the `router.group.appExtensions` group (synthesized from
  `useExtensions()` installed extensions whose `app.routes` have `type === "global"`, pointing
  at `/dashboard/app/<routeName>`).
- Template iterates `[group, routes]`, rendering a translated group header + `SidebarItem`s.
  Each item renders twice when collapsed (full + icon-only) for the collapse-to-icons behavior.

### Node-detail sub-nav (`Sidebar.vue:46-167`)

When `route.path` starts with `/dashboard/node/`, the sidebar switches to a **hardcoded**
`nodeRoutes` list (status/latency/traffic/ping/webshell/files/setting + back-to-servers),
substituting the current `:uuid`. docker/firewall/process/update entries exist but are
**commented out** (`:120-155`). Extension `node` routes appended dynamically (`:217-234`).

> **New node sub-page ⇒ must edit `Sidebar.vue`'s `nodeRoutes`.**

### `SidebarItem.vue` (recursive)

Props: `route: SidebarRoute`, `collapsed`, `isOpen`, `level`. Visible children → `Collapsible`;
leaf → `RouterLink` (`name`+`params` when a name is present, else `path`). Icon: `<img>` when
`meta.icon` is a string (extension URL), else `<component :is>` (Lucide). Titles translated via
i18n `te`/`t`. `SidebarRoute` (`:19-25`) is a slimmed serializable route shape distinct from
`RouteRecordRaw`.
