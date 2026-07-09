import { computed } from "vue";
import { useBackendStore } from "@/composables/useBackendStore";
import { getWsConnection } from "@/composables/useWsConnection";

const CRON_AGENT_ORDER_NAMESPACE = "latency_source_order";
const CRON_AGENT_ORDER_KEY = "metadata_orders";
const CRON_AGENT_ORDER_VERSION = 1;

interface CronAgentOrderValue {
  names: string[];
  updatedAt: number;
  version: 1;
}

const parseOrderNames = (value: unknown): string[] => {
  if (!value || typeof value !== "object") return [];
  const payload = value as Partial<CronAgentOrderValue>;
  // Version mismatch means a future/incompatible schema; ignore it rather than guessing.
  if (payload.version !== CRON_AGENT_ORDER_VERSION) return [];
  return Array.isArray(payload.names)
    ? payload.names.filter((name): name is string => typeof name === "string")
    : [];
};

/**
 * Reads/writes the single KV entry backing the Cron Agent-task display order.
 *
 * Params:
 *  - backend: optional backend ref; defaults to the current backend.
 *
 * Returns:
 *  - getNames(): the persisted ordered task names (empty on miss/version mismatch).
 *  - setNames(names): overwrites the entry with `{ names, updatedAt, version }`.
 *
 * Raises:
 *  - Propagates JSON-RPC errors from kv_get_value / kv_set_value.
 */
export function useCronAgentOrder(
  backend = useBackendStore().currentBackend,
) {
  const backendUrl = computed(() => backend.value?.url ?? "");
  const backendToken = computed(() => backend.value?.token ?? "");

  const getNames = async (): Promise<string[]> => {
    if (!backendUrl.value) return [];
    const value = await getWsConnection(backendUrl.value).call<unknown>(
      "kv_get_value",
      {
        token: backendToken.value,
        namespace: CRON_AGENT_ORDER_NAMESPACE,
        key: CRON_AGENT_ORDER_KEY,
      },
    );
    return parseOrderNames(value);
  };

  const setNames = async (names: string[]): Promise<void> => {
    if (!backendUrl.value) return;
    await getWsConnection(backendUrl.value).call("kv_set_value", {
      token: backendToken.value,
      namespace: CRON_AGENT_ORDER_NAMESPACE,
      key: CRON_AGENT_ORDER_KEY,
      value: {
        names,
        updatedAt: Date.now(),
        version: CRON_AGENT_ORDER_VERSION,
      } satisfies CronAgentOrderValue,
    });
  };

  return { getNames, setNames };
}
