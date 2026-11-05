import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const TAG_SHA = "c".repeat(40);
const REPO = "example/repo";
const runsEndpoint = `repos/${REPO}/actions/workflows/nightly.yml/runs?per_page=100`;
const refreshEndpoint = `repos/${REPO}/releases/123`;

function findExecutable(name: string): string | undefined {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = resolve(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      continue;
    }
  }
}

const bashPath = findExecutable("bash");
const jqPath = findExecutable("jq");
const gitPath = findExecutable("git");
const bashSkip = bashPath ? false : "PATH 中缺少 bash，跳过 Shell 回归用例";
const nightlySkip =
  bashPath && jqPath ? false : "PATH 中缺少 bash 或 jq，跳过 nightly 回归用例";
const releaseSkip =
  bashPath && gitPath
    ? false
    : "PATH 中缺少 bash 或 git，跳过 Git ref 回归用例";

function workflowScript(file: string, stepId: string): string {
  const lines = readFileSync(
    new URL(`../.github/workflows/${file}`, import.meta.url),
    "utf8",
  ).split("\n");
  const idIndex = lines.indexOf(`        id: ${stepId}`);
  assert.notEqual(idIndex, -1, `${file} 应包含步骤 ${stepId}`);
  const stepLines = lines.slice(idIndex + 1);
  const runIndex = stepLines.indexOf("        run: |");
  const nextStep = stepLines.findIndex(
    (line) => line.trim().length > 0 && !line.startsWith("        "),
  );
  assert.ok(runIndex >= 0 && (nextStep < 0 || runIndex < nextStep));

  const script: string[] = [];
  for (const line of stepLines.slice(runIndex + 1)) {
    if (line && !line.startsWith("          ")) break;
    script.push(line.slice(10));
  }
  return script.join("\n");
}

type WorkflowRun = {
  id?: number | null;
  head_branch?: string | null;
  event?: string | null;
  status?: string | null;
  conclusion: string;
  head_sha: string;
  run_started_at?: string | null;
  created_at?: string;
};

type RunPage = { total_count: number; workflow_runs: WorkflowRun[] };
type JobPage = {
  total_count: number;
  jobs: { name: string; conclusion: string }[];
};

type RefreshFixture = {
  draftStatus?: number;
  publishStatuses?: number[];
  finalDraft?: string;
  readStatus?: number;
};

type Fixture = {
  tag?: string;
  pages?: RunPage[];
  tagError?: boolean;
  runError?: boolean;
  runBody?: string;
  jobs?: JobPage;
  jobsError?: boolean;
  remoteOutput?: string;
  remoteStatus?: number;
  refresh?: RefreshFixture;
};

function executeWorkflow(
  script: string,
  fixture: Fixture,
  environment: Record<string, string>,
) {
  assert.ok(bashPath);
  const directory = mkdtempSync(join(tmpdir(), "nodeget-release-workflow-"));
  try {
    const output = join(directory, "output");
    const calls = join(directory, "calls");
    const gitCalls = join(directory, "git-calls");
    const sleepCalls = join(directory, "sleep-calls");
    const response = join(directory, "response.json");
    writeFileSync(output, "");
    writeFileSync(calls, "");
    writeFileSync(gitCalls, "");
    writeFileSync(sleepCalls, "");
    writeFileSync(response, JSON.stringify(fixture));
    // 隔离 PATH：只有模拟 API/远端、版本读取及真实 jq/ref 校验，不访问真实仓库或网络。
    writeFileSync(
      join(directory, "gh"),
      `#!${process.execPath}
const fs = require("node:fs");
const fixture = JSON.parse(fs.readFileSync(process.env.MOCK_RESPONSE, "utf8"));
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_CALLS, JSON.stringify(args) + "\\n");
if (args.includes("repos/${REPO}/git/ref/tags/nightly")) {
  process.stdout.write((fixture.tag ?? "") + "\\n");
  process.exit(fixture.tagError ? 1 : 0);
}
if (args.includes(${JSON.stringify(runsEndpoint)})) {
  fs.writeFileSync(1, fixture.runBody ?? JSON.stringify(fixture.pages));
  process.exit(fixture.runError ? 1 : 0);
}
if (args.some(arg => /^repos\\/example\\/repo\\/actions\\/runs\\/[0-9]+\\/jobs\\?per_page=100$/.test(arg))) {
  const filter = args[args.indexOf("--jq") + 1];
  const result = require("node:child_process").spawnSync(process.env.MOCK_JQ, ["-r", filter], {
    input: JSON.stringify(fixture.jobs), encoding: "utf8"
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  process.exit(fixture.jobsError ? 1 : (result.status ?? 1));
}
if (args.includes(${JSON.stringify(refreshEndpoint)})) {
  const refresh = fixture.refresh ?? {};
  if (args.includes("draft=true")) process.exit(refresh.draftStatus ?? 0);
  if (args.includes("draft=false")) {
    const calls = fs.readFileSync(process.env.MOCK_CALLS, "utf8").split("\\n").filter(Boolean).map(line => JSON.parse(line));
    const attempt = calls.filter(call => call.includes("draft=false")).length - 1;
    process.exit(refresh.publishStatuses?.[attempt] ?? 0);
  }
  if (args.includes("--jq")) {
    fs.writeFileSync(1, (refresh.finalDraft ?? "false") + "\\n");
    process.exit(refresh.readStatus ?? 0);
  }
}
process.exit(99);
`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(directory, "node"),
      `#!${bashPath}\nprintf '%s\\n' "\${MOCK_VERSION}"\n`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(directory, "sleep"),
      `#!${process.execPath}
require("node:fs").appendFileSync(process.env.MOCK_SLEEP_CALLS, JSON.stringify(process.argv.slice(2)) + "\\n");
`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(directory, "git"),
      `#!${process.execPath}
const fs = require("node:fs");
const fixture = JSON.parse(fs.readFileSync(process.env.MOCK_RESPONSE, "utf8"));
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_GIT_CALLS, JSON.stringify(args) + "\\n");
if (args[0] === "check-ref-format") {
  const result = require("node:child_process").spawnSync(${JSON.stringify(gitPath)}, args, { encoding: "utf8" });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  process.exit(result.status ?? 1);
}
if (args[0] === "ls-remote") {
  process.stdout.write(fixture.remoteOutput ?? "");
  process.exit(fixture.remoteStatus ?? 2);
}
process.exit(99);
`,
      { mode: 0o755 },
    );
    if (jqPath) symlinkSync(jqPath, join(directory, "jq"));

    const result = spawnSync(
      bashPath,
      ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script],
      {
        cwd: directory,
        env: {
          PATH: directory,
          GITHUB_OUTPUT: output,
          GITHUB_SHA: SHA,
          REPO,
          MOCK_RESPONSE: response,
          MOCK_CALLS: calls,
          MOCK_GIT_CALLS: gitCalls,
          MOCK_SLEEP_CALLS: sleepCalls,
          MOCK_JQ: jqPath ?? "",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_TERMINAL_PROMPT: "0",
          ...environment,
        },
        encoding: "utf8",
        timeout: 5000,
      },
    );
    assert.ifError(result.error);
    return {
      status: result.status,
      stderr: result.stderr,
      output: Object.fromEntries(
        readFileSync(output, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const equal = line.indexOf("=");
            return [line.slice(0, equal), line.slice(equal + 1)];
          }),
      ),
      calls: readFileSync(calls, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]),
      gitCalls: readFileSync(gitCalls, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]),
      sleepCalls: readFileSync(sleepCalls, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const success: WorkflowRun = {
  head_branch: "main",
  event: "workflow_dispatch",
  status: "completed",
  conclusion: "success",
  head_sha: SHA,
  run_started_at: "2026-11-05T01:00:00Z",
};

function nightlyBuild(
  fixture: Fixture = {},
  skip = true,
  checkJob = true,
): string {
  let nextId = 1;
  const pages = (
    fixture.pages ?? [{ total_count: 1, workflow_runs: [success] }]
  ).map((page) => ({
    ...page,
    workflow_runs: page.workflow_runs.map((run) => ({ id: nextId++, ...run })),
  }));
  const result = executeWorkflow(
    workflowScript("nightly.yml", "check"),
    {
      tag: SHA,
      jobs: {
        total_count: 1,
        jobs: [{ name: "Check for new commits", conclusion: "success" }],
      },
      ...fixture,
      pages,
    },
    { SKIP_IF_UNCHANGED: String(skip) },
  );
  assert.equal(result.status, 0, result.stderr);
  const expectedCalls: string[][] = [];
  if (skip) {
    expectedCalls.push([
      "api",
      `repos/${REPO}/git/ref/tags/nightly`,
      "--jq",
      ".object.sha",
    ]);
    if (!fixture.tagError && (fixture.tag ?? SHA) === SHA) {
      expectedCalls.push(["api", "--paginate", "--slurp", runsEndpoint]);
    }
  }
  assert.deepEqual(result.calls.slice(0, expectedCalls.length), expectedCalls);
  assert.equal(result.calls.length, expectedCalls.length + Number(checkJob));
  if (checkJob) {
    const jobCall = result.calls.at(-1)!;
    assert.equal(jobCall[0], "api");
    assert.match(
      jobCall[1]!,
      /^repos\/example\/repo\/actions\/runs\/[0-9]+\/jobs\?per_page=100$/,
    );
    assert.equal(jobCall[2], "--jq");
    assert.ok(jobCall[3]);
  }
  return result.output.build;
}

const nightlyCases: {
  name: string;
  fixture?: Fixture;
  build: string;
  checkJob?: boolean;
}[] = [
  { name: "标签和最近成功执行都匹配时跳过", build: "false" },
  ...["failure", "cancelled"].map((conclusion) => ({
    name: `最近执行为 ${conclusion} 时重新构建`,
    fixture: {
      pages: [
        {
          total_count: 2,
          workflow_runs: [
            { ...success, conclusion, run_started_at: "2026-11-05T02:00:00Z" },
            success,
          ],
        },
      ],
    },
    build: "true",
  })),
  {
    name: "运行查询报错时忽略已经输出的成功记录",
    fixture: { runError: true },
    build: "true",
  },
  {
    name: "标签查询报错时忽略已经输出的匹配 SHA",
    fixture: { tagError: true },
    build: "true",
  },
  {
    name: "响应解析失败时重新构建",
    fixture: { runBody: "{" },
    build: "true",
  },
  { name: "标签缺失时重新构建", fixture: { tag: "" }, build: "true" },
  {
    name: "标签改变时重新构建",
    fixture: { tag: "previous-sha" },
    build: "true",
  },
  {
    name: "没有完成记录时重新构建",
    fixture: { pages: [{ total_count: 0, workflow_runs: [] }] },
    build: "true",
  },
  {
    name: "最近成功执行的提交不匹配时重新构建",
    fixture: {
      pages: [
        {
          total_count: 1,
          workflow_runs: [{ ...success, head_sha: "previous-sha" }],
        },
      ],
    },
    build: "true",
  },
  {
    name: "任一执行记录缺少时间时重新构建",
    fixture: {
      pages: [
        {
          total_count: 2,
          workflow_runs: [success, { ...success, run_started_at: null }],
        },
      ],
    },
    build: "true",
  },
  {
    name: "最近执行时间并列时重新构建",
    fixture: {
      pages: [{ total_count: 2, workflow_runs: [success, { ...success }] }],
    },
    build: "true",
  },
  {
    name: "分页记录不完整时重新构建",
    fixture: { pages: [{ total_count: 2, workflow_runs: [success] }] },
    build: "true",
  },
  {
    name: "分页总数不一致时重新构建",
    fixture: {
      pages: [
        { total_count: 2, workflow_runs: [success] },
        { total_count: 3, workflow_runs: [success] },
      ],
    },
    build: "true",
  },
  {
    name: "重复记录无法证明分页完整时重新构建",
    fixture: {
      pages: [
        {
          total_count: 2,
          workflow_runs: [
            { ...success, id: 1 },
            { ...success, id: 1 },
          ],
        },
      ],
    },
    build: "true",
  },
  {
    name: "缺少运行标识时重新构建",
    fixture: {
      pages: [{ total_count: 1, workflow_runs: [{ ...success, id: null }] }],
    },
    build: "true",
  },
  {
    name: "缺少筛选字段时重新构建",
    fixture: {
      pages: [{ total_count: 1, workflow_runs: [{ ...success, event: null }] }],
    },
    build: "true",
  },
  {
    name: "无效执行时间无法判断最近运行时重新构建",
    fixture: {
      pages: [
        {
          total_count: 1,
          workflow_runs: [{ ...success, run_started_at: "not-a-time" }],
        },
      ],
    },
    build: "true",
  },
  {
    name: "跨分页排除定时调度、进行中和其他分支的记录",
    fixture: {
      pages: [
        {
          total_count: 4,
          workflow_runs: [
            {
              ...success,
              event: "schedule",
              run_started_at: "2026-11-05T04:00:00Z",
            },
            { ...success, status: "in_progress", run_started_at: null },
          ],
        },
        {
          total_count: 4,
          workflow_runs: [
            {
              ...success,
              head_branch: "other",
              run_started_at: "2026-11-05T03:00:00Z",
            },
            success,
          ],
        },
      ],
    },
    build: "false",
  },
  {
    name: "同名 tag 的调度运行成功但检查作业跳过时重新构建",
    fixture: {
      jobs: {
        total_count: 2,
        jobs: [
          { name: "Trigger nightly on main", conclusion: "success" },
          { name: "Check for new commits", conclusion: "skipped" },
        ],
      },
    },
    checkJob: true,
    build: "true",
  },
  {
    name: "运行成功但没有检查作业时重新构建",
    fixture: {
      jobs: {
        total_count: 1,
        jobs: [{ name: "Trigger nightly on main", conclusion: "success" }],
      },
    },
    checkJob: true,
    build: "true",
  },
  {
    name: "检查作业不唯一时重新构建",
    fixture: {
      jobs: {
        total_count: 2,
        jobs: [
          { name: "Check for new commits", conclusion: "success" },
          { name: "Check for new commits", conclusion: "success" },
        ],
      },
    },
    checkJob: true,
    build: "true",
  },
  {
    name: "检查作业查询失败时忽略已输出的成功结果",
    fixture: { jobsError: true },
    checkJob: true,
    build: "true",
  },
  {
    name: "检查作业响应不完整时重新构建",
    fixture: {
      jobs: {
        total_count: 2,
        jobs: [{ name: "Check for new commits", conclusion: "success" }],
      },
    },
    checkJob: true,
    build: "true",
  },
  ...["failure", "success"].map((conclusion) => ({
    name: `旧创建记录重试后按最新执行的 ${conclusion} 判断`,
    fixture: {
      pages: [
        {
          total_count: 2,
          workflow_runs: [
            {
              ...success,
              conclusion: conclusion === "success" ? "failure" : "success",
              created_at: "2026-11-05T00:00:00Z",
            },
          ],
        },
        {
          total_count: 2,
          workflow_runs: [
            {
              ...success,
              conclusion,
              created_at: "2026-11-04T00:00:00Z",
              run_started_at: "2026-11-05T02:00:00Z",
            },
          ],
        },
      ],
    },
    build: conclusion === "success" ? "false" : "true",
  })),
];

for (const { name, fixture, build, checkJob } of nightlyCases) {
  test(`nightly：${name}`, { skip: nightlySkip }, () => {
    assert.equal(
      nightlyBuild(fixture, true, checkJob ?? build === "false"),
      build,
    );
  });
}

test("nightly：关闭跳过选项时始终构建", { skip: nightlySkip }, () => {
  assert.equal(nightlyBuild({}, false, false), "true");
});

test(
  "nightly：超过 1000 条完整历史仍可跳过已成功发布的提交",
  { skip: nightlySkip },
  () => {
    const runs = Array.from({ length: 1001 }, (_, index) => ({
      ...success,
      run_started_at: new Date(Date.UTC(2026, 10, 5, 0, index))
        .toISOString()
        .replace(".000Z", "Z"),
    }));
    const pages = Array.from({ length: 11 }, (_, index) => ({
      total_count: runs.length,
      workflow_runs: runs.slice(index * 100, (index + 1) * 100),
    }));
    assert.equal(nightlyBuild({ pages }), "false");
  },
);

for (const { version, prerelease } of [
  { version: "0.1.0", prerelease: false },
  { version: "1.2.3", prerelease: false },
  { version: "1.2.3-rc.1", prerelease: true },
  { version: "1.2.3+build.1", prerelease: false },
  { version: "1.2.3+build-1", prerelease: false },
  { version: "1.2.3-rc.1+build.1", prerelease: true },
  { version: "0.0.1", prerelease: false },
  { version: "10.20.30", prerelease: false },
  { version: "1.2.3-0", prerelease: true },
  { version: "1.2.3-1.0", prerelease: true },
  { version: "1.2.3-01a", prerelease: true },
  { version: "1.2.3-0A-1", prerelease: true },
  { version: "1.2.3-alpha.0", prerelease: true },
  { version: "1.2.3--", prerelease: true },
  { version: "1.2.3+001.02", prerelease: false },
  { version: "1.2.3-rc.1+001.02", prerelease: true },
]) {
  test(
    `release：接受版本 ${version} 并保留预发布判断`,
    { skip: releaseSkip },
    () => {
      const result = executeWorkflow(
        workflowScript("release.yml", "release"),
        {},
        {
          PUBLISH: "true",
          MOCK_VERSION: version,
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.gitCalls, [
        ["check-ref-format", `refs/tags/v${version}`],
      ]);
      assert.deepEqual(result.output, {
        publish: "true",
        tag: `v${version}`,
        prerelease: String(prerelease),
      });
    },
  );
}

for (const version of [
  "invalid",
  "1.2.3-rc.1+",
  "1.2.3+build.1+extra",
  "0.0.0",
  "1.2.3-rc..1",
  "",
  "1",
  "1.2",
  "1.2.3.4",
  "01.2.3",
  "1.02.3",
  "1.2.03",
  "1.2.3-01",
  "1.2.3-alpha.01",
  "1.2.3-",
  "1.2.3-alpha.",
  "1.2.3-.alpha",
  "1.2.3+",
  "1.2.3+build..1",
  "1.2.3+build.",
  "1.2.3-alpha_beta",
  "1.2.3-测试",
]) {
  test(`release：拒绝版本 ${version}`, { skip: releaseSkip }, () => {
    const result = executeWorkflow(
      workflowScript("release.yml", "release"),
      {},
      {
        PUBLISH: "true",
        MOCK_VERSION: version,
      },
    );
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /release tag must look like|placeholder|not a valid Git ref/,
    );
    assert.deepEqual(result.output, {});
  });
}

test(
  "release：试跑保留原行为，不执行发布专用 ref 校验",
  { skip: bashSkip },
  () => {
    const result = executeWorkflow(
      workflowScript("release.yml", "release"),
      {},
      {
        PUBLISH: "false",
        MOCK_VERSION: "1.2.3-rc..1",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.gitCalls, []);
    assert.deepEqual(result.output, {
      publish: "false",
      tag: "v1.2.3-rc..1",
      prerelease: "true",
    });
  },
);

const releaseTag = "v1.2.3";
const tagRef = `refs/tags/${releaseTag}`;
const remoteTagCases: { name: string; fixture: Fixture; status: number }[] = [
  { name: "标签不存在时允许发布", fixture: { remoteStatus: 2 }, status: 0 },
  {
    name: "轻量标签匹配当前提交时允许重试",
    fixture: { remoteStatus: 0, remoteOutput: `${SHA}\t${tagRef}\n` },
    status: 0,
  },
  {
    name: "轻量标签指向其他提交时拒绝发布",
    fixture: { remoteStatus: 0, remoteOutput: `${OTHER_SHA}\t${tagRef}\n` },
    status: 1,
  },
  {
    name: "注解标签剥离后匹配当前提交时允许重试",
    fixture: {
      remoteStatus: 0,
      remoteOutput: `${TAG_SHA}\t${tagRef}\n${SHA}\t${tagRef}^{}\n`,
    },
    status: 0,
  },
  {
    name: "注解标签剥离后指向其他提交时拒绝发布",
    fixture: {
      remoteStatus: 0,
      remoteOutput: `${SHA}\t${tagRef}\n${OTHER_SHA}\t${tagRef}^{}\n`,
    },
    status: 1,
  },
  {
    name: "远端请求错误时拒绝发布",
    fixture: { remoteStatus: 128, remoteOutput: `${SHA}\t${tagRef}\n` },
    status: 1,
  },
  {
    name: "不存在状态附带意外输出时拒绝发布",
    fixture: { remoteStatus: 2, remoteOutput: `${SHA}\t${tagRef}\n` },
    status: 1,
  },
  { name: "成功但空响应时拒绝发布", fixture: { remoteStatus: 0 }, status: 1 },
  ...[
    `invalid-sha\t${tagRef}\n`,
    `${SHA} ${tagRef}\n`,
    `${SHA}\t${tagRef}\textra\n`,
    `${SHA}\trefs/tags/unexpected\n`,
    `${SHA}\t${tagRef}^{}\n`,
    `${SHA}\t${tagRef}\n${SHA}\t${tagRef}\n`,
    `${TAG_SHA}\t${tagRef}\n${SHA}\t${tagRef}^{}\n${SHA}\t${tagRef}^{}\n`,
  ].map((remoteOutput, index) => ({
    name: `拒绝格式异常或歧义响应 ${index + 1}`,
    fixture: { remoteStatus: 0, remoteOutput },
    status: 1,
  })),
];

for (const { name, fixture, status } of remoteTagCases) {
  test(`release：${name}`, { skip: bashSkip }, () => {
    const result = executeWorkflow(
      workflowScript("release.yml", "validate_tag"),
      fixture,
      {
        TAG: releaseTag,
      },
    );
    assert.equal(result.status, status, result.stderr);
    assert.deepEqual(result.gitCalls, [
      ["ls-remote", "--exit-code", "origin", tagRef, `${tagRef}^{}`],
    ]);
  });
}

const failedPublishes = Array<number>(5).fill(1);
const refreshCases: {
  name: string;
  refresh: RefreshFixture;
  status: number;
  attempts: number;
  read: boolean;
  message?: RegExp;
}[] = [
  {
    name: "草稿切换与重新发布均成功",
    refresh: { draftStatus: 0, publishStatuses: [0] },
    status: 0,
    attempts: 1,
    read: false,
  },
  {
    name: "草稿请求失败后仍尝试并成功发布",
    refresh: { draftStatus: 1, publishStatuses: [0] },
    status: 0,
    attempts: 1,
    read: false,
    message: /::warning::.*切换草稿状态的请求失败/,
  },
  {
    name: "草稿请求状态不确定后重试发布成功",
    refresh: { draftStatus: 1, publishStatuses: [1, 0] },
    status: 0,
    attempts: 2,
    read: false,
  },
  {
    name: "草稿切换成功后重试发布成功",
    refresh: { draftStatus: 0, publishStatuses: [1, 1, 0] },
    status: 0,
    attempts: 3,
    read: false,
  },
  {
    name: "所有 PATCH 失败但最终确认已发布时仅警告",
    refresh: {
      draftStatus: 1,
      publishStatuses: failedPublishes,
      finalDraft: "false",
    },
    status: 0,
    attempts: 5,
    read: true,
    message: /::warning::.*已处于发布状态/,
  },
  {
    name: "所有 PATCH 失败且最终仍为草稿时失败",
    refresh: {
      draftStatus: 1,
      publishStatuses: failedPublishes,
      finalDraft: "true",
    },
    status: 1,
    attempts: 5,
    read: true,
    message: /::error::.*仍处于草稿状态/,
  },
  {
    name: "最终读取失败时忽略响应中的 false 并报状态未知",
    refresh: {
      draftStatus: 1,
      publishStatuses: failedPublishes,
      finalDraft: "false",
      readStatus: 1,
    },
    status: 1,
    attempts: 5,
    read: true,
    message: /::error::.*无法确认/,
  },
  {
    name: "最终状态字段不明确时失败",
    refresh: {
      draftStatus: 1,
      publishStatuses: failedPublishes,
      finalDraft: "null",
    },
    status: 1,
    attempts: 5,
    read: true,
    message: /::error::.*无法确认/,
  },
];

for (const { name, refresh, status, attempts, read, message } of refreshCases) {
  test(`nightly 日期刷新：${name}`, { skip: bashSkip }, () => {
    const result = executeWorkflow(
      workflowScript("nightly.yml", "refresh_release_date"),
      { refresh },
      { RELEASE_ID: "123" },
    );
    assert.equal(result.status, status, result.stderr);
    const expectedCalls = [
      ["api", "-X", "PATCH", refreshEndpoint, "-F", "draft=true", "--silent"],
      ...Array.from({ length: attempts }, () => [
        "api",
        "-X",
        "PATCH",
        refreshEndpoint,
        "-F",
        "draft=false",
        "-F",
        "prerelease=true",
        "-f",
        "make_latest=false",
        "--silent",
      ]),
    ];
    if (read) expectedCalls.push(["api", refreshEndpoint, "--jq", ".draft"]);
    assert.deepEqual(result.calls, expectedCalls);
    assert.deepEqual(
      result.sleepCalls,
      Array.from({ length: attempts - 1 }, () => ["5"]),
    );
    assert.deepEqual(result.gitCalls, []);
    assert.deepEqual(result.output, {});
    if (message) assert.match(result.stderr, message);
    if (status === 0) assert.doesNotMatch(result.stderr, /::error::/);
    else assert.match(result.stderr, /::error::/);
  });
}
