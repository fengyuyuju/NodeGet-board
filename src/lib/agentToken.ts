// 后端 0.5.17 起 username 禁止包含 ':' 或 '|'，旧格式 `[agent]:<uuid>` 无法再创建，
// 但存量 token 仍可认证，删除/更新时需同时兼容两种格式
export const agentTokenUsername = (uuid: string) => `agent-${uuid}`;
export const legacyAgentTokenUsername = (uuid: string) => `[agent]:${uuid}`;
export const agentTokenTargets = (uuid: string) => [
  agentTokenUsername(uuid),
  legacyAgentTokenUsername(uuid),
];
