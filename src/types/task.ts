export const TASK_NAME_LIST = [
  "ping",
  "tcp_ping",
  "http_ping",
  "web_shell",
  "edit_config",
  "read_config",
  "execute",
  "http_request",
  "self_update",
  "ip",
  "version",
  "dns",
] as const;

export type TASK_NAME = (typeof TASK_NAME_LIST)[number];

// Task Event Types
export interface PingTask {
  ping: string; // 目标地址或域名
}

export interface TcpPingTask {
  tcp_ping: string; // 目标地址:端口
}

export interface HttpPingTask {
  http_ping: string; // 完整 URL
}

export interface HttpRequestTask {
  http_request: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    body_base64?: string;
    ip?: string; // "ipv4 auto" | "ipv6 auto" | 具体IP
  };
}

export interface SelfUpdateTask {
  self_update: string;
}

export interface WebShellTask {
  web_shell: {
    url: string;
    terminal_id: string; // UUID
  };
}

export interface ExecuteTask {
  execute: {
    cmd: string;
    args: string[];
  };
}

export type ReadConfigTask = "read_config";

export interface EditConfigTask {
  edit_config: string; // 完整 TOML 字符串
}

export type IpTask = "ip";

export type VersionTask = "version";

export type TaskRequest =
  | PingTask
  | TcpPingTask
  | HttpPingTask
  | HttpRequestTask
  | SelfUpdateTask
  | WebShellTask
  | ExecuteTask
  | ReadConfigTask
  | EditConfigTask
  | IpTask
  | VersionTask;

// Task Event Results
export interface PingResult {
  ping: number; // 延迟 ms
}

export interface TcpPingResult {
  tcp_ping: number; // 延迟 ms
}

export interface HttpPingResult {
  http_ping: number; // 延迟 ms
}

export interface HttpRequestResult {
  http_request: {
    status: number;
    headers: Record<string, string>[];
    body?: string;
    body_base64?: string;
  };
}

export interface SelfUpdateResult {
  self_update: boolean;
}

export interface WebShellResult {
  web_shell: boolean; // Is Connected
}

export interface ExecuteResult {
  execute: string; // 命令输出
}

export interface ReadConfigResult {
  read_config: string; // config.toml 原文
}

export interface EditConfigResult {
  edit_config: boolean; // 是否成功写入
}

export interface IpResult {
  ip: [string | null, string | null]; // [IPv4, IPv6]
}

export interface VersionResult {
  version: {
    binary_type: string;
    cargo_version: string;
    git_branch: string;
    git_commit_sha: string;
    git_commit_date: string; // ISO 8601
    git_commit_message: string;
    build_time: string; // 看起来是时间戳（字符串形式）
    cargo_target_triple: string;
    rustc_channel: "stable" | "beta" | "nightly" | string;
    rustc_version: string;
    rustc_commit_date: string; // YYYY-MM-DD
    rustc_commit_hash: string;
    rustc_llvm_version: string;
  };
}

export type TaskEventResult =
  | PingResult
  | TcpPingResult
  | HttpPingResult
  | HttpRequestResult
  | SelfUpdateResult
  | WebShellResult
  | ExecuteResult
  | ReadConfigResult
  | VersionResult
  | IpResult;

// Query Conditions
export type TaskQueryCondition =
  | { task_id: number }
  | { uuid: string }
  | { timestamp_from_to: [number, number] }
  | { timestamp_from: number }
  | { timestamp_to: number }
  | { is_success?: boolean }
  | { is_failure?: boolean }
  | { is_running?: boolean }
  | { type: string }
  | { cron_source: string }
  | { limit: number }
  | { last: string };

// Task Record
export interface TaskRecord {
  task_id: number;
  uuid: string;
  timestamp: number;
  success: boolean;
  error_message: string | null;
  task_event_type: TaskRequest;
  task_event_result: TaskEventResult | null;
  cron_source: string | null;
}

// Create Task Response
export interface CreateTaskResponse {
  id: number;
}

// Create Task Blocking Response
export interface CreateTaskBlockingResponse<T = TaskEventResult> {
  task_id: number;
  agent_uuid: string;
  task_token: string;
  timestamp: number;
  success: boolean;
  error_message: string | null;
  task_event_result: T | null;
}

// Delete Task Response
export interface DeleteTaskResponse {
  success: boolean;
  deleted: number;
  condition_count: number;
}
