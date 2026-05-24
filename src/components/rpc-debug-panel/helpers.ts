import type { Backend } from "@/composables/useBackendStore";
import type { RpcDebugRecord } from "./rpcDebugStore";
import type { RpcDebugTab } from "./types";
export { methodCatalog, methodHints } from "./rpcMethodCatalog";

export const rpcDebugTabs: RpcDebugTab[] = [
  { key: "network", label: "网络" },
  { key: "composer", label: "构造器" },
  { key: "subscription", label: "订阅" },
  { key: "auth", label: "鉴权" },
  { key: "settings", label: "设置" },
];

export function backendKey(backend: Backend) {
  return `${backend.url}::${backend.token}`;
}

export function statusClass(status: string) {
  if (status === "success" || status === "streaming") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  if (status === "error" || status === "closed") {
    return "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300";
  }
  if (status === "pending") {
    return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300";
  }
  return "bg-muted text-muted-foreground ring-border";
}

export function kindText(record: RpcDebugRecord) {
  const map: Record<string, string> = {
    call: "调用",
    subscription: "订阅",
    notification: "推送",
    batch: "批量",
    raw: "原始",
  };
  return map[record.kind] ?? record.kind;
}

export function statusText(record: RpcDebugRecord) {
  const map: Record<string, string> = {
    pending: "等待中",
    success: "成功",
    error: "错误",
    streaming: "推送中",
    closed: "已关闭",
    raw: "原始",
  };
  return map[record.status] ?? record.status;
}

export function timeText(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

export function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function rpcDebugCommandFilter(value: string, search: string) {
  const normalizedValue = normalizeRpcDebugSearchText(value);
  const normalizedSearch = normalizeRpcDebugSearchText(search);

  if (!normalizedSearch) {
    return true;
  }

  if (!normalizedValue) {
    return false;
  }

  return (
    normalizedValue.includes(normalizedSearch) ||
    isRpcDebugSearchSubsequence(normalizedSearch, normalizedValue)
  );

  function normalizeRpcDebugSearchText(value: string) {
    return value
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }

  function isRpcDebugSearchSubsequence(search: string, value: string) {
    let searchIndex = 0;

    for (const char of value) {
      if (char === search[searchIndex]) {
        searchIndex += 1;
      }

      if (searchIndex === search.length) {
        return true;
      }
    }

    return false;
  }
}
