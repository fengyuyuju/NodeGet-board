import { useBackendStore } from "@/composables/useBackendStore";
import { getWsConnection } from "@/composables/useWsConnection";
import { AGENT_TEMPLATE_PERMISSIONS } from "@/components/token/tokenTemplates.ts";
import { generatePassword } from "@/lib/password";
import { makeRpcFunction } from "@/composables/useWsConnection";
import { agentTokenTargets, agentTokenUsername } from "@/lib/agentToken";

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
        // scopes: [{ global: null }],
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

// 预生成 token
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

export async function reGenerateToken(
  nodeUuid: string,
  backend = currentBackend,
): Promise<AgentTokenResult> {
  if (!backend.value) return { token: null, error: "no_backend" };
  try {
    const current = backend.value;
    // 尽力清理新旧两种格式的旧 token，失败不影响后续创建
    await Promise.allSettled(
      agentTokenTargets(nodeUuid).map((target_token) =>
        getWsConnection(current.url).call("token_delete", {
          token: current.token,
          target_token,
        }),
      ),
    );
    return await preGenerateToken(nodeUuid, backend);
  } catch (e) {
    return { token: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function upgradeTokenLimit(
  nodeUuid: string,
  backend = currentBackend,
) {
  if (!backend.value) return;
  const rpc = makeRpcFunction();
  const limit = makeTokenObject(nodeUuid).token_limit;
  // 新旧两种格式的 token 都尝试更新，单一目标不存在属预期情况；全部失败才记录
  let updated = false;
  for (const target_token of agentTokenTargets(nodeUuid)) {
    try {
      await rpc("token_edit", {
        token: backend.value.token,
        target_token,
        limit,
      });
      updated = true;
    } catch {}
  }
  if (!updated) {
    console.error("Token update failed for all username formats:", nodeUuid);
  }
}
