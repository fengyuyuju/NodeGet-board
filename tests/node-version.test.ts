import test from "node:test";
import assert from "node:assert/strict";

import {
  coreVersion,
  getVersionChannel,
  isOlderVersion,
  isSameVersion,
  isStableRelease,
  splitNodeVersion,
} from "../src/utils/nodeVersion.ts";

const SHA = "1814ad0db327c89b4637d69e67f9eca899cffb06";

test("拆分：正式版 + 完整提交号", () => {
  assert.deepEqual(splitNodeVersion(`0.6.0-${SHA}`), {
    version: "0.6.0",
    commit: SHA,
  });
});

test("拆分：nightly 版本保留后缀，只拆出提交号", () => {
  assert.deepEqual(splitNodeVersion(`0.6.0-nightly.20261011-${SHA}`), {
    version: "0.6.0-nightly.20261011",
    commit: SHA,
  });
});

test("拆分：rc 版本保留后缀，只拆出提交号", () => {
  assert.deepEqual(splitNodeVersion("0.6.1-rc.1-a1b2c3d"), {
    version: "0.6.1-rc.1",
    commit: "a1b2c3d",
  });
});

test("拆分：构建信息缺失时提交号是 UNKNOWN", () => {
  assert.deepEqual(splitNodeVersion("0.6.0-UNKNOWN"), {
    version: "0.6.0",
    commit: "UNKNOWN",
  });
});

test("拆分：没有提交号时整串都是版本号", () => {
  assert.deepEqual(splitNodeVersion("0.6.0"), { version: "0.6.0", commit: "" });
  assert.deepEqual(splitNodeVersion("0.6.0-rc.1"), {
    version: "0.6.0-rc.1",
    commit: "",
  });
  assert.deepEqual(splitNodeVersion("0.6.0-nightly.20261011"), {
    version: "0.6.0-nightly.20261011",
    commit: "",
  });
  assert.deepEqual(splitNodeVersion(""), { version: "", commit: "" });
});

test("数字部分：去掉各种后缀", () => {
  assert.equal(coreVersion("0.6.0"), "0.6.0");
  assert.equal(coreVersion("0.6.1-rc.1"), "0.6.1");
  assert.equal(coreVersion("0.6.0-nightly.20261011"), "0.6.0");
  assert.equal(coreVersion("0.6.0+build5"), "0.6.0");
});

test("构建来源", () => {
  assert.equal(getVersionChannel("0.6.0"), "stable");
  assert.equal(getVersionChannel("0.6.1-rc.1"), "prerelease");
  assert.equal(getVersionChannel("0.6.1-beta.2"), "prerelease");
  assert.equal(getVersionChannel("0.6.0-nightly.20261011"), "nightly");
  assert.equal(getVersionChannel("0.6.0-nightlyish"), "prerelease");
});

test("比较：带后缀的版本比同号正式版旧", () => {
  assert.equal(isOlderVersion("0.6.0-nightly.20261011", "0.6.0"), true);
  assert.equal(isOlderVersion("0.6.0-rc.1", "0.6.0"), true);
});

test("比较：数字更大的 nightly 不比正式版旧（升级时可降级到正式版）", () => {
  assert.equal(isOlderVersion("0.7.0-nightly.20261011", "0.6.0"), false);
});

test("比较：正式版之间", () => {
  assert.equal(isOlderVersion("0.5.18", "0.6.0"), true);
  assert.equal(isOlderVersion("0.6.0", "0.6.0"), false);
  assert.equal(isOlderVersion("0.6.1", "0.6.0"), false);
});

test("相同：后缀不同就不算相同", () => {
  assert.equal(isSameVersion("0.6.0", "0.6.0"), true);
  assert.equal(isSameVersion("0.6.0-nightly.20261011", "0.6.0"), false);
  assert.equal(isSameVersion("0.6.0-rc.1", "0.6.0"), false);
});

test("非法版本号：返回 false，不抛错", () => {
  assert.equal(isOlderVersion("UNKNOWN", "0.6.0"), false);
  assert.equal(isOlderVersion("", "0.6.0"), false);
  assert.equal(isSameVersion("UNKNOWN", "0.6.0"), false);
});

test("正式版筛选：排除预发布、草稿和没有 v 前缀的标签", () => {
  const releases = [
    { tag_name: "v0.5.18", prerelease: false, draft: false },
    { tag_name: "v0.6.0-rc.1", prerelease: true, draft: false },
    { tag_name: "v0.6.0-nightly.20261011", prerelease: true, draft: false },
    { tag_name: "v0.6.0", prerelease: false, draft: true },
    { tag_name: "0.6.0", prerelease: false, draft: false },
    { tag_name: "v0.6.1", prerelease: false, draft: false },
  ];
  assert.deepEqual(
    releases.filter(isStableRelease).map((release) => release.tag_name),
    ["v0.5.18", "v0.6.1"],
  );
});
