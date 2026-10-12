// 服务端用 `:` 分隔 key/secret、用 `|` 分隔用户名/密码，因此用户名需编码这两个字符。
// 同时编码 `%`，避免用户名原有的 `%3A` 等字面量在展示时被误解。
const ENCODE_MAP: Record<string, string> = {
  "%": "%25",
  ":": "%3A",
  "|": "%7C",
};

const DECODE_MAP: Record<string, string> = {
  "%25": "%",
  "%3A": ":",
  "%7C": "|",
};

/**
 * 编码 Token 用户名中的保留字符，每个字符仅处理一次。
 * @param username 展示或表单中的原始用户名。
 * @returns 可发送给服务端的用户名。
 * @throws 无。
 */
export const encodeTokenUsername = (username: string): string =>
  username.replace(/[%:|]/g, (char) => ENCODE_MAP[char] as string);

/**
 * 仅还原用户名编码的三种大写序列一次，其余百分号内容原样保留。
 * @param username 服务端返回的编码用户名。
 * @returns 用于展示或编辑的用户名。
 * @throws 无。
 */
export const decodeTokenUsername = (username: string): string =>
  username.replace(/%(?:25|3A|7C)/g, (match) => DECODE_MAP[match] as string);
