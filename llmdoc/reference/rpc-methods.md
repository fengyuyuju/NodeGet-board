# Reference: RPC Methods

- Last verified: 2026-07-09 · revision `1814ad0d`
- **Source of truth caveat**: the NodeGet server IDL is NOT in this repo. This catalog is
  inferred from frontend call sites in `src/composables/`. If a method/param looks wrong, verify
  against the server. For the canonical Composer templates (with `无鉴权`/`Token`/`SuperToken`
  hints), see `src/components/rpc-debug-panel/rpcMethodCatalog.ts`.

## Naming convention

`{domain}_{verb_object}`, snake_case. Multi-word domains use **hyphens**
(`static-bucket-file_*`, `js-worker_*`, `crontab-result_*`). Auth is per-RPC: the `token` lives
in `params`. Token-param naming varies: older methods use `token` / `father_token` /
`target_token` / `supertoken`; KV/agent methods uniformly use `token`.

## Domain → methods → composables

### `nodeget-server_*` — server control plane

| Method | Params | Used by |
|---|---|---|
| `nodeget-server_hello` | `[]` | heartbeat (`useWsConnection`) |
| `nodeget-server_uuid` | `{token}` | `useBackendExtra` |
| `nodeget-server_version` | `{token}` | `useBackendExtra`, `useExtensions` |
| `nodeget-server_self_update` | `[token, version]` | `useBackendExtra` |
| `nodeget-server_list_all_agent_uuid` | `{token}` | `useAgentInfo`, `useBatchNodes`, `useKv` |
| `nodeget-server_stream_log` / `nodeget-server_unsubscribe_stream_log` | subscribe | `useLogs` (dedicated socket) |

Catalog also references `nodeget-server_read_config` / `edit_config` (server TOML incl.
`ws_listener`, `database_url`), `nodeget-server_database_storage`, `nodeget-server_log`, plus
`nodeget-agent_*` methods — see the Composer catalog file for full templates.

### `task_*` — agent task lifecycle

| Method | Composable |
|---|---|
| `task_create_task` | `useTask`, `useBatchExec`, `useAgentConfig` (edit_config), `WebTerminal` (web_shell) |
| `task_create_task_blocking` | `useTask`, `useAgentConfig` (read_config/version) |
| `task_query` | `useTask`, `useCronHistory`, `useBatchExec` (batched) |
| `task_delete` | `useTask`, `useLifecycle` |

Task kinds (`TASK_NAME_LIST`, `src/types/task.ts`): `ping`, `tcp_ping`, `http_ping`,
`web_shell`, `edit_config`, `read_config`, `execute`, `http_request`, `self_update`, `ip`,
`version`, `dns` (note: `dns` has no convenience creator — possibly un-wired end-to-end).
`task_create_task_blocking` returns `CreateTaskBlockingResponse<T>`
(`{ task_id, agent_uuid, task_token, timestamp, success, error_message, task_event_result }`).

### `agent_*` — agent-scoped data

| Method | Params | Composable |
|---|---|---|
| `agent_static_data_multi_last_query` | multi-uuid last static | `useStaticMonitoring`, `useOverviewData` |
| `agent_dynamic_summary_multi_last_query` | multi-agent summary | `useDynamicSummaryMultiLast` (online/offline via `OFFLINE_AFTER_MS`), `useAgentStatus`, `useOverviewData` |
| `agent_query_dynamic` | `[token, {fields, condition}]` | `useDynamicSingle` (shared pool) |
| `agent_query_dynamic_summary` | `[token, {fields, condition}]` | `useDynamicSummarySingle` (dedicated socket) |
| `agent_delete_dynamic` / `agent_delete_dynamic_summary` / `agent_delete_static` | — | `useLifecycle` |

### `kv_*` — KV store

| Method | Composable |
|---|---|
| `kv_list_all_namespace` | `useKv`, `useExtensions` |
| `kv_create` (namespace) | `useKv`, `useExtensions`, `useLifecycle` |
| `kv_get_value` / `kv_get_multi_value` / `kv_get_all_keys` | `useKv`, `useAgentInfo`, `useBatchNodes`, `useExtensions`, `useBackendExtra` |
| `kv_set_value` | `useKv`, `useExtensions`, `useScripts` (namespace `script_snippet`) |
| `kv_delete_key` | `useKv`, `useExtensions`, `useLifecycle` |

### `crontab_*` / `crontab-result_*` — cron

| Method | Composable |
|---|---|
| `crontab_get` / `crontab_create` / `crontab_edit` / `crontab_delete` | `useCron` |
| `crontab_set_enable` / `crontab_toggle_enable` | `useCron` |
| `crontab-result_query` | `useCronHistory` |

### `js-worker_*` / `js-result_*` — JS runtime

| Method | Composable |
|---|---|
| `js-worker_list_all_js_worker` / `js-worker_get_rt_pool` / `js-worker_read` | `useJsRuntime` |
| `js-worker_create` / `js-worker_update` / `js-worker_delete` / `js-worker_run` | `useJsRuntime`, `useLifecycle` |
| `js-result_query` / `js-result_delete` | `useJsRuntime` |

Worker type (`src/types/worker.ts`): backend returns `name` where `id` used to be —
`useJsRuntime.getWorker` maps `id = res.name`. `JsResult` polled via `js-result_query` until
`finish_time` is set.

### `static-bucket_*` / `static-bucket-file_*` — static hosting

| Method | Composable |
|---|---|
| `static-bucket_list` / `static-bucket_read` / `static-bucket_create` / `static-bucket_update` / `static-bucket_delete` | `useStaticBucket` |
| `static-bucket-file_list` / `static-bucket-file_upload` / `static-bucket-file_read` / `static-bucket-file_delete` / `static-bucket-file_rename` | `useStaticBucketFile`, `useExtensions`, `useThemeBucketUpload` |

### `token_*` — token management

| Method | Params | Composable |
|---|---|---|
| `token_list_all_tokens` | — | `useTokenList`, `useThemeTokenPresets` |
| `token_get` | `{token}` | `usePermissionStore`, `useTokenList` |
| `token_create` | `{father_token, token_creation}` → `{key, secret}` | `useCreateToken`, `useExtensions`, `useThemeTokenPresets`, `useLifecycle` |
| `token_edit` | `{token, target_token, version, limit, ...optional}` | `useEditToken` |
| `token_delete` | — | `useTokenList`, `useExtensions`, `useThemeTokenPresets` |
| `token_roll_token_secret` | — | `useTokenList` |
| `token_change_password` | — | `useTokenList` |

Error codes referenced (in token type): 101..108, 999.

## Param-shape reminder

- **Object with `token`**: most `nodeget-server_*`, `kv_*`, `token_*`, `task_*`.
- **Positional array** `[token, {fields, condition}]`: `agent_query_dynamic`,
  `agent_query_dynamic_summary`, some lifecycle.
- **`[]` or `[token, version]`**: heartbeat / self-update.

Match the existing shape per domain; do not "normalize" (see `must/gotchas.md`).
