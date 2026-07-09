# Guide: Adding a Server-Backed Feature

A walkthrough of the canonical pattern: every feature follows
**component → composable → `useWsConnection` → RPC**. Use this as a template when adding a new
capability (e.g. a new "widgets" resource).

## 1. Add the domain type (`src/types/`)

Create or extend a type file. Match the discriminated-union / response-shape conventions in
`task.ts` / `monitoring.ts`. If the backend returns a field that differs from what you'd expect
(e.g. `name` vs `id`), patch it in the composable's mapping step and note it in
`must/gotchas.md`.

## 2. Write a composable (`src/composables/useWidget.ts`)

Mirror an existing sibling (e.g. `useCron.ts`, `useStaticBucket.ts`).

```ts
import { ref } from "vue";
import { useBackendStore } from "@/composables/useBackendStore";
import type { Backend } from "@/composables/useBackendStore";

export function useWidget(backend = useBackendStore().currentBackend) {
  const widgets = ref<Widget[]>([]);

  const list = async () => {
    const url = backend.value?.url;
    const token = backend.value?.token;
    if (!url || !token) return;
    // Object-with-token param shape (see reference/rpc-methods.md)
    widgets.value = await getWsConnection(url).call<Widget[]>(
      "widget_list",
      { token },
    );
  };
  // ...create/update/delete following the same pattern
  return { widgets, list };
}
```

Key points:
- Accept `backend` as an optional `Ref<Backend|null>` param defaulting to the current backend
  (so the feature can target a non-current backend — see `must/conventions.md` §6).
- Obtain the connection via `getWsConnection(url)`, never `new WebSocket()`.
- Follow the param shape for the domain (`{token}` object vs positional array — see
  `reference/rpc-methods.md`). Don't "normalize" existing shapes.
- Pick a sensible timeout; default `call` is 8000 ms, the `makeRpcFunction` closure is 5000 ms.
  Pass an explicit `timeoutMs` for calls that may exceed 5s.
- Wrap with `try/catch` and surface errors via `vue-sonner` toast. You do **not** need to check
  `result.error_message` yourself — the transport rejects on result-wrapped errors too.

For **in-flight dedupe**, wrap with `useInFlightDedupe` (see `useAgentInfo` / monitoring
composables). For **server-pushed streams**, follow the `useLogs` dedicated-socket pattern
(`must/gotchas.md`), since the shared pool has no server-initiated-notification hook.

## 3. Add the page (`src/pages/dashboard/widget.vue`)

File-based routing picks it up automatically as `/dashboard/widget`. Set route meta to control
sidebar placement and prefetch:

```vue
<script setup lang="ts">
import { useWidget } from "@/composables/useWidget";
definePage({
  meta: { title: "router.widget", group: "router.group.advanced", order: 14, icon: LucideIcon },
});
const { widgets, list } = useWidget();
</script>
```

- `title` and `group` are **i18n keys** — add them to `src/locales/en.ts` and `zh_cn.ts`.
- Valid groups: `router.group.monitor | nodeManage | tools | advanced | appExtensions | system`.
- `order` sorts within the group (default 99). `hidden` hides from menu (and disables prefetch).
- Name it `__widget.vue` only if it's a **nested-route parent layout** (must contain a
  `<router-view />`) — see `must/conventions.md` §3.

## 4. Build the component (`src/components/widget/`)

Compose the shadcn-vue UI kit (`Card`, `Dialog`, `Table`, `Tabs`...). Merge classes with
`cn()`; define variants with `cva`. Use `@tanstack/vue-table` for data tables (see `ui/table`).
For charts: uPlot via `UPlotChart.vue` (monitoring), ECharts (maps/traffic/ping/storage), or
CodeMirror for code/JSON editing.

## 5. (Optional) Add to the RPC debug catalog

If the feature should be composable from the RPC debug panel, add an entry to
`src/components/rpc-debug-panel/rpcMethodCatalog.ts` with its auth tier
(`无鉴权`/`Token`/`SuperToken`) and param template.

## 6. Verify

- `pnpm type-check` — confirms the new route meta types and domain types.
- `pnpm dev` — confirm the page renders, the sidebar entry appears in the right group/order,
  and prefetch (Devtools "Route Prefetch" inspector) behaves as expected.
- Exercise create/list/update/delete; confirm errors toast correctly (both RPC-error and
  result-wrapped-error paths).
