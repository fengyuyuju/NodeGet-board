import { RpcError } from "./rpcError.ts";
import { encodeTokenUsername } from "./tokenUsername.ts";

const RPC_NOT_FOUND = 105;

/**
 * 构造未编码的历史 Agent Token 用户名。
 * @param uuid 节点 UUID。
 * @returns 历史用户名 `[agent]:<uuid>`。
 * @throws 无。
 */
export const legacyAgentTokenUsername = (uuid: string) => `[agent]:${uuid}`;

/**
 * 构造新 Agent Token 使用的官方编码用户名。
 * @param uuid 节点 UUID。
 * @returns 编码后的 `[agent]:<uuid>`。
 * @throws 无。
 */
export const agentTokenUsername = (uuid: string) =>
  encodeTokenUsername(legacyAgentTokenUsername(uuid));

/**
 * 构造本地分支曾使用的 Agent Token 用户名。
 * @param uuid 节点 UUID。
 * @returns 旧分支用户名 `agent-<uuid>`。
 * @throws 无。
 */
export const forkAgentTokenUsername = (uuid: string) => `agent-${uuid}`;

/**
 * 列出节点可能持有的全部用户名，按官方编码、旧分支、历史原名的顺序去重。
 * @param uuid 节点 UUID。
 * @returns 删除或修改权限时应处理的用户名列表。
 * @throws 无。
 */
export const agentTokenTargets = (uuid: string): string[] => [
  ...new Set([
    agentTokenUsername(uuid),
    forkAgentTokenUsername(uuid),
    legacyAgentTokenUsername(uuid),
  ]),
];

/**
 * 顺序处理全部可能共存的 Agent Token，只在目标不存在时继续兼容其他格式。
 * @param uuid 节点 UUID。
 * @param action 针对一个用户名执行的异步操作。
 * @returns 至少一次操作成功时为 true；全部返回错误码 105 时为 false。
 * @throws 操作返回的非 105 RPC 错误或网络错误，原样向调用方抛出。
 */
export async function withAgentTokenTargets(
  uuid: string,
  action: (targetToken: string) => Promise<unknown>,
): Promise<boolean> {
  let matched = false;
  for (const target of agentTokenTargets(uuid)) {
    try {
      await action(target);
      matched = true;
    } catch (error) {
      if (!(error instanceof RpcError && error.code === RPC_NOT_FOUND)) {
        throw error;
      }
    }
  }
  return matched;
}
