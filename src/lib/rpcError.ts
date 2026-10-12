/**
 * 保留服务端数字错误码的 JSON-RPC 错误，兼容现有 Error 捕获逻辑。
 * @param message 可供调用方展示的错误信息。
 * @param code 服务端提供的错误码，仅接受数字。
 * @returns RpcError 实例。
 * @throws 无。
 */
export class RpcError extends Error {
  code?: number;

  /**
   * 创建携带可选数字错误码的错误。
   * @param message 错误信息。
   * @param code 服务端返回的错误码。
   * @returns RpcError 实例。
   * @throws 无。
   */
  constructor(message: string, code?: unknown) {
    super(message);
    if (typeof code === "number") this.code = code;
  }
}
