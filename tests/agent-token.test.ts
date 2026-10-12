import test from "node:test";
import assert from "node:assert/strict";

import {
  agentTokenTargets,
  agentTokenUsername,
  forkAgentTokenUsername,
  legacyAgentTokenUsername,
  withAgentTokenTargets,
} from "../src/lib/agentToken.ts";
import { RpcError } from "../src/lib/rpcError.ts";

const UUID = "e12fd6bb-736b-4914-8a7a-4c2324274341";
const TARGETS = [`[agent]%3A${UUID}`, `agent-${UUID}`, `[agent]:${UUID}`];

test("agent token candidates cover official, local fork and historical usernames in order", () => {
  assert.equal(agentTokenUsername(UUID), TARGETS[0]);
  assert.equal(forkAgentTokenUsername(UUID), TARGETS[1]);
  assert.equal(legacyAgentTokenUsername(UUID), TARGETS[2]);
  assert.deepEqual(agentTokenTargets(UUID), TARGETS);
  assert.equal(new Set(agentTokenTargets(UUID)).size, 3);
});

test("coexisting credentials all receive permission changes and are all cleaned", async () => {
  const credentials = new Map(TARGETS.map((target) => [target, "old-limit"]));
  const updated = await withAgentTokenTargets(UUID, async (target) => {
    assert.equal(credentials.has(target), true);
    credentials.set(target, "new-limit");
  });
  assert.equal(updated, true);
  assert.deepEqual(
    [...credentials.values()],
    ["new-limit", "new-limit", "new-limit"],
  );

  const deleted = await withAgentTokenTargets(UUID, async (target) => {
    assert.equal(credentials.delete(target), true);
  });
  assert.equal(deleted, true);
  assert.equal(credentials.size, 0);
});

test("candidate operations are sequential and continue after successful matches", async () => {
  const events: string[] = [];
  assert.equal(
    await withAgentTokenTargets(UUID, async (target) => {
      events.push(`start:${target}`);
      await Promise.resolve();
      events.push(`end:${target}`);
    }),
    true,
  );
  assert.deepEqual(
    events,
    TARGETS.flatMap((target) => [`start:${target}`, `end:${target}`]),
  );
});

test("missing code 105 continues to other formats and reports any successful match", async () => {
  const visited: string[] = [];
  const matched = await withAgentTokenTargets(UUID, async (target) => {
    visited.push(target);
    if (target !== TARGETS[1]) throw new RpcError("not found", 105);
  });
  assert.equal(matched, true);
  assert.deepEqual(visited, TARGETS);
});

test("all formats missing returns false without rejecting", async () => {
  const visited: string[] = [];
  assert.equal(
    await withAgentTokenTargets(UUID, async (target) => {
      visited.push(target);
      throw new RpcError("not found", 105);
    }),
    false,
  );
  assert.deepEqual(visited, TARGETS);
});

test("non-105 RPC error stops later candidates even after a success", async () => {
  const error = new RpcError("permission denied", 103);
  const visited: string[] = [];
  await assert.rejects(
    withAgentTokenTargets(UUID, async (target) => {
      visited.push(target);
      if (target === TARGETS[1]) throw error;
    }),
    (received) => received === error,
  );
  assert.deepEqual(visited, TARGETS.slice(0, 2));
});

test("network and unvalidated codes do not trigger fallback", async () => {
  for (const error of [
    new Error("connection closed"),
    new RpcError("not found", "105"),
    new RpcError("not found"),
  ]) {
    const visited: string[] = [];
    await assert.rejects(
      withAgentTokenTargets(UUID, async (target) => {
        visited.push(target);
        throw error;
      }),
      (received) => received === error,
    );
    assert.deepEqual(visited, [TARGETS[0]]);
  }
});

test("RpcError preserves numeric codes and remains compatible with Error catches", () => {
  const error = new RpcError("missing token", 105);
  assert.ok(error instanceof Error);
  assert.ok(error instanceof RpcError);
  assert.equal(error.message, "missing token");
  assert.equal(error.code, 105);
  assert.equal(new RpcError("zero", 0).code, 0);
  assert.equal(new RpcError("negative", -32603).code, -32603);
  for (const value of [undefined, null, "105", true, { code: 105 }]) {
    assert.equal(new RpcError("invalid code", value).code, undefined);
  }
});
