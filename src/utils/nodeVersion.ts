import { compareVersions } from "compare-versions";

/** 构建来源：正式版、预发布（beta / rc 等）、nightly。 */
export type VersionChannel = "stable" | "prerelease" | "nightly";

// 构建附加的提交号为十六进制短号或全号，缺失时为 UNKNOWN。
const COMMIT_RE = /^([0-9a-f]{7,40}|UNKNOWN)$/i;

/**
 * 将节点版本和末尾提交号分开，保留版本的 rc、nightly 等后缀。
 * @param raw 节点上报的版本字符串。
 * @returns 版本号和提交号；没有提交号时 commit 为空。
 * @throws 无。
 */
export function splitNodeVersion(raw: string): {
  version: string;
  commit: string;
} {
  const dash = raw.lastIndexOf("-");
  if (dash > 0 && COMMIT_RE.test(raw.slice(dash + 1))) {
    return { version: raw.slice(0, dash), commit: raw.slice(dash + 1) };
  }
  return { version: raw, commit: "" };
}

/**
 * 提取版本的数字部分，用于按功能最低版本判断支持情况。
 * @param version 不含提交号的版本字符串。
 * @returns 去掉预发布后缀和构建元数据的版本。
 * @throws 无。
 */
export function coreVersion(version: string): string {
  return /^[^-+]*/.exec(version)?.[0] ?? version;
}

/**
 * 根据版本后缀判断构建来源。
 * @param version 不含提交号的版本字符串。
 * @returns 正式版、预发布或 nightly 渠道。
 * @throws 无。
 */
export function getVersionChannel(version: string): VersionChannel {
  const dash = version.indexOf("-");
  if (dash < 0) {
    return "stable";
  }
  const suffix = version.slice(dash + 1);
  return /^nightly(\.|$)/.test(suffix) ? "nightly" : "prerelease";
}

/**
 * 判断一个版本是否较旧，同号预发布版本早于正式版。
 * @param a 当前版本。
 * @param b 对比版本。
 * @returns a 比 b 旧时为 true，非法版本返回 false。
 * @throws 无，版本解析错误转换为 false。
 */
export function isOlderVersion(a: string, b: string): boolean {
  try {
    return compareVersions(a, b) < 0;
  } catch {
    return false;
  }
}

/**
 * 判断两个版本是否相同，保留预发布后缀参与比较。
 * @param a 第一个版本。
 * @param b 第二个版本。
 * @returns 比较结果相同时为 true，非法版本返回 false。
 * @throws 无，版本解析错误转换为 false。
 */
export function isSameVersion(a: string, b: string): boolean {
  try {
    return compareVersions(a, b) === 0;
  } catch {
    return false;
  }
}

/**
 * 判断 GitHub 发布项是否应进入正式版选择列表。
 * @param release 包含标签、预发布和草稿标志的发布项。
 * @returns 非草稿、非预发布且标签以 v 开头时为 true。
 * @throws 无。
 */
export function isStableRelease(release: {
  tag_name: string;
  prerelease?: boolean;
  draft?: boolean;
}): boolean {
  return (
    !release.prerelease && !release.draft && release.tag_name.startsWith("v")
  );
}
