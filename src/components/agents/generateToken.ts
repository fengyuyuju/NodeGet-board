import { useBackendStore } from "@/composables/useBackendStore";
import { getWsConnection } from "@/composables/useWsConnection";
import { AGENT_TEMPLATE_PERMISSIONS } from "@/components/token/tokenTemplates.ts";
import { generatePassword } from "@/lib/password";
import { withAgentTokenTargets, agentTokenUsername } from "@/lib/agentToken";

const { currentBackend } = useBackendStore();

export type AgentTokenResult = {
  token: string | null;
  error: string | null;
};

function makeTokenObject(nodeUuid: string) {
  return {
    username: agentTokenUsername(nodeUuid),
    password: generatePassword(16),
    timestamp_from: null,
    timestamp_to: null,
    version: 1,
    token_limit: [
      {
        scopes: [
          {
            agent_uuid: nodeUuid,
          },
        ],
        permissions: AGENT_TEMPLATE_PERMISSIONS,
      },
    ],
  };
}

/**
 * 预生成节点连接用的 Agent Token。
 * @param nodeUuid 节点 UUID。
 * @param backend 创建 Token 使用的后端引用，默认使用当前后端。
 * @returns 连接凭据或可展示的失败信息。
 * @throws 无，RPC 错误会转换为返回值中的 error。
 */
export async function preGenerateToken(
  nodeUuid: string,
  backend = currentBackend,
): Promise<AgentTokenResult> {
  if (!backend.value) return { token: null, error: "no_backend" };
  try {
    const result = await getWsConnection(backend.value.url).call<{
      key?: string;
      secret?: string;
    }>("token_create", {
      father_token: backend.value.token,
      token_creation: makeTokenObject(nodeUuid),
    });
    if (result?.key && result?.secret) {
      return { token: `${result.key}:${result.secret}`, error: null };
    }
    return { token: null, error: "token_create_response_missing_key_secret" };
  } catch (e) {
    return { token: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 尽力清理节点已有的各格式 Token 后创建新连接凭据。
 * @param nodeUuid 节点 UUID。
 * @param backend 清理和创建 Token 使用的后端引用。
 * @returns 新连接凭据或失败信息。
 * @throws 无，清理失败不阻止创建，其他错误转换为返回值中的 error。
 */
export async function reGenerateToken(
  nodeUuid: string,
  backend = currentBackend,
): Promise<AgentTokenResult> {
  if (!backend.value) return { token: null, error: "no_backend" };
  try {
    const current = backend.value;
    // 清理兼容格式时仅忽略不存在；其他错误停止清理，但保留尽力创建的行为。
    try {
      await withAgentTokenTargets(nodeUuid, (target_token) =>
        getWsConnection(current.url).call("token_delete", {
          token: current.token,
          target_token,
        }),
      );
    } catch {}
    return await preGenerateToken(nodeUuid, backend);
  } catch (e) {
    return { token: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 为节点所有仍存在的兼容格式 Token 更新权限。
 * @param nodeUuid 节点 UUID。
 * @param backend 更新权限使用的后端引用。
 * @returns 操作完成后的 Promise；无后端时直接返回。
 * @throws 无，全部不存在或其他操作失败时记录错误日志。
 */
export async function upgradeTokenLimit(
  nodeUuid: string,
  backend = currentBackend,
) {
  if (!backend.value) return;
  const { url, token } = backend.value;
  const limit = makeTokenObject(nodeUuid).token_limit;
  try {
    const updated = await withAgentTokenTargets(nodeUuid, (target_token) =>
      getWsConnection(url).call("token_edit", {
        token,
        target_token,
        limit,
      }),
    );
    if (!updated) {
      console.error("Token update failed for all username formats:", nodeUuid);
    }
  } catch (error) {
    console.error("Token update failed:", error);
  }
}
