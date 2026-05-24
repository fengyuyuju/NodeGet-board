import type { Pinia } from "pinia";
import { installRpcDebugWebSocketPatch } from "./websocketPatch";

export function installRpcDebugPanel(pinia?: Pinia) {
  installRpcDebugWebSocketPatch(pinia);
}
