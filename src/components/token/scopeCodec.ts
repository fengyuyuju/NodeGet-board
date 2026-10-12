import {
  decodeTokenUsername,
  encodeTokenUsername,
} from "../../lib/tokenUsername.ts";
import type {
  PermissionEntry,
  Token,
  TokenDetail,
  TokenLimitEntry,
  TokenLimitScope,
  TokenLimitScopeItem,
} from "./type.js";

export const DEFAULT_SCOPE: TokenLimitScope = [{ global: null }];

export const createDefaultToken = (): Token => ({
  version: 1,
  timestamp_from: 0,
  timestamp_to: 0,
  token_limit: [
    {
      scopes: DEFAULT_SCOPE,
      permissions: [],
    },
  ],
  username: "",
  password: "",
});

export const cloneTokenLimitEntries = (
  tokenLimit: TokenLimitEntry[],
): TokenLimitEntry[] =>
  (tokenLimit ?? []).map((item) => ({
    scopes: (item.scopes ?? []).map((scope) => ({ ...scope })),
    permissions: (item.permissions ?? []).map((permission) =>
      JSON.parse(JSON.stringify(permission)),
    ),
  }));

const normalizeStringList = (value: unknown) => {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }

  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
};

const toScopeItemFromString = (value: string): TokenLimitScopeItem => {
  if (value === "global") {
    return { global: null };
  }

  if (value.startsWith("agent_uuid:")) {
    return { agent_uuid: value.slice("agent_uuid:".length) };
  }

  if (value.startsWith("kv_namespace:")) {
    return { kv_namespace: value.slice("kv_namespace:".length) };
  }

  if (value.startsWith("js_worker:")) {
    return { js_worker: value.slice("js_worker:".length) };
  }

  return { agent_uuid: value };
};

export const normalizeScopeItem = (item: unknown): TokenLimitScopeItem[] => {
  if (typeof item === "string") {
    const scope = item.trim();
    return scope ? [toScopeItemFromString(scope)] : [];
  }

  if (!item || typeof item !== "object" || Array.isArray(item)) return [];

  const source = item as Record<string, unknown>;
  if ("global" in source) return [{ global: null }];

  const agentScopes = normalizeStringList(
    source.AgentUuid ?? source.agent_uuid,
  ).map((value) => ({ agent_uuid: value }) satisfies TokenLimitScopeItem);
  if (agentScopes.length > 0) return agentScopes;

  const kvScopes = normalizeStringList(
    source.KvNamespace ?? source.kv_namespace,
  ).map((value) => ({ kv_namespace: value }) satisfies TokenLimitScopeItem);
  if (kvScopes.length > 0) return kvScopes;

  const jsWorkerScopes = normalizeStringList(
    source.JsWorker ?? source.js_worker,
  ).map((value) => ({ js_worker: value }) satisfies TokenLimitScopeItem);
  if (jsWorkerScopes.length > 0) return jsWorkerScopes;

  return [];
};

export const normalizeScopes = (scopes: unknown): TokenLimitScope => {
  if (!Array.isArray(scopes) || scopes.length === 0) return DEFAULT_SCOPE;

  const normalized = scopes.flatMap(normalizeScopeItem);
  return normalized.length > 0 ? normalized : DEFAULT_SCOPE;
};

export const normalizePermissions = (
  permissions: unknown,
): PermissionEntry[] => {
  if (!Array.isArray(permissions)) return [];
  return permissions.filter(
    (permission): permission is PermissionEntry =>
      !!permission &&
      typeof permission === "object" &&
      !Array.isArray(permission),
  );
};

export const normalizeTokenLimit = (tokenLimit: unknown): TokenLimitEntry[] => {
  if (!Array.isArray(tokenLimit) || tokenLimit.length === 0) {
    return createDefaultToken().token_limit;
  }

  const normalized = tokenLimit
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const source = item as Record<string, unknown>;
      return {
        scopes: normalizeScopes(source.scopes),
        permissions: normalizePermissions(source.permissions),
      } as TokenLimitEntry;
    })
    .filter((item): item is TokenLimitEntry => item !== null);

  return normalized.length > 0
    ? cloneTokenLimitEntries(normalized)
    : createDefaultToken().token_limit;
};

export const serializeScopeItem = (item: TokenLimitScopeItem) => {
  if ("global" in item) return "global";
  if ("agent_uuid" in item) return { agent_uuid: item.agent_uuid };
  if ("kv_namespace" in item) return { kv_namespace: item.kv_namespace };
  if ("js_worker" in item) return { js_worker: item.js_worker };
  return "global";
};

export const buildLimitPayload = (token: Token) => {
  return cloneTokenLimitEntries(token.token_limit ?? []).map((item) => ({
    scopes: (item.scopes ?? []).map(serializeScopeItem),
    permissions: normalizePermissions(item.permissions),
  }));
};

export const generateUuid = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
};

/**
 * 构造可发送的凭据；按去空白后的值判断是否改名，未改名时保留服务端原值。
 * @param source 表单凭据及可选的服务端原始用户名。
 * @returns 原始或单次编码的用户名及去空白后的密码；空字段省略。
 * @throws 无。
 */
export const buildCredentialPayload = (
  source: Pick<Token, "username" | "password" | "originalUsername">,
) => {
  const username = source.username.trim();
  const password = source.password.trim();
  const wireUsername =
    source.originalUsername !== undefined &&
    username === decodeTokenUsername(source.originalUsername).trim()
      ? source.originalUsername
      : encodeTokenUsername(username);

  return {
    ...(username ? { username: wireUsername } : {}),
    ...(password ? { password } : {}),
  };
};

const toOptionalTimestamp = (value: number) =>
  Number.isFinite(value) && value > 0 ? value : undefined;

/**
 * 构造 RPC 的可选凭据和有效时间字段，内部用户名来源记录不会被输出。
 * @param token 表单凭据、原始用户名和时间范围。
 * @returns 可发送的可选字段，非正数或非有限时间不输出。
 * @throws 无。
 */
export const buildOptionalFieldPayload = (
  token: Pick<
    Token,
    | "username"
    | "originalUsername"
    | "password"
    | "timestamp_from"
    | "timestamp_to"
  >,
) => {
  const timestampFrom = toOptionalTimestamp(token.timestamp_from);
  const timestampTo = toOptionalTimestamp(token.timestamp_to);

  return {
    ...buildCredentialPayload(token),
    ...(timestampFrom !== undefined ? { timestamp_from: timestampFrom } : {}),
    ...(timestampTo !== undefined ? { timestamp_to: timestampTo } : {}),
  };
};

/**
 * 将表单转换成 RPC 和可编辑 JSON 使用的数据，不输出内部元数据。
 * @param token Token 表单。
 * @returns 包含版本、权限和可选字段的服务端格式数据。
 * @throws 无。
 */
export const serializeTokenPayload = (token: Token) => ({
  version: token.version ?? 1,
  token_limit: buildLimitPayload(token),
  ...buildOptionalFieldPayload(token),
});

/**
 * 把服务端详情转换成可编辑表单，并将用户名解码一次。
 * @param detail 服务端原始详情；为空时创建默认表单。
 * @returns 使用展示用户名并记录原始用户名的 Token 表单，密码保持服务端原值。
 * @throws 无。
 */
export const mapTokenDetailToForm = (detail: TokenDetail | null): Token => {
  if (!detail) return createDefaultToken();

  return {
    version: detail.version ?? 1,
    username: decodeTokenUsername(detail.username ?? ""),
    ...(typeof detail.username === "string"
      ? { originalUsername: detail.username }
      : {}),
    password: detail.password ?? "",
    timestamp_from: detail.timestamp_from ?? 0,
    timestamp_to: detail.timestamp_to ?? 0,
    token_limit: cloneTokenLimitEntries(
      normalizeTokenLimit(detail.token_limit),
    ),
  };
};
