import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeTokenUsername,
  encodeTokenUsername,
} from "../src/lib/tokenUsername.ts";
import {
  buildCredentialPayload,
  buildOptionalFieldPayload,
  createDefaultToken,
  mapTokenDetailToForm,
  serializeTokenPayload,
} from "../src/components/token/scopeCodec.ts";
import {
  applyPartialTokenPayload,
  mapImportedTokenToForm,
  parseTokenPayloadJson,
  parseTokenPayloadObject,
} from "../src/components/token/tokenPayload.ts";
import type { TokenDetail } from "../src/components/token/type.ts";

const createDetail = (username: string | null): TokenDetail => ({
  username,
  password: "secret:%3A|",
  token_key: "existing-token-key",
  version: 1,
  timestamp_from: 123,
  timestamp_to: 456,
  token_limit: [
    {
      scopes: [{ agent_uuid: "uuid" }],
      permissions: [{ task: { read: "ping" } }],
    },
  ],
});

test("username encoding protects delimiters and literal escape sequences in one pass", () => {
  assert.equal(encodeTokenUsername("%3A:|%25"), "%253A%3A%7C%2525");
  assert.equal(decodeTokenUsername("%253A%3A%7C%2525"), "%3A:|%25");
});

test("decoding leaves unrelated percent sequences and Unicode unchanged", () => {
  const username = "节点🙂 %2F %zz %3a %7c %";
  assert.equal(decodeTokenUsername(username), username);
  assert.equal(decodeTokenUsername(encodeTokenUsername(username)), username);
  assert.equal(encodeTokenUsername("节点🙂"), "节点🙂");
});

test("credential payload trims fields, encodes only usernames and omits empty fields", () => {
  assert.deepEqual(
    buildCredentialPayload({
      username: "  名称:%3A|  ",
      password: "  密码:%3A|  ",
    }),
    {
      username: "名称%3A%253A%7C",
      password: "密码:%3A|",
    },
  );
  assert.deepEqual(
    buildCredentialPayload({ username: " \t ", password: "\n" }),
    {},
  );
  assert.deepEqual(
    buildCredentialPayload({ username: "", password: " secret " }),
    {
      password: "secret",
    },
  );
  assert.deepEqual(buildCredentialPayload({ username: "name", password: "" }), {
    username: "name",
  });
});

test("actual detail to form to payload roundtrip preserves literal usernames, password and limits", () => {
  const detail: TokenDetail = {
    username: "节点%253A%3A%7C%25%252F",
    password: "secret:%3A|",
    token_key: "key-kept-by-caller",
    version: 1,
    timestamp_from: 123,
    timestamp_to: 456,
    token_limit: [
      {
        scopes: [{ agent_uuid: "uuid" }],
        permissions: [{ task: "read" }],
      },
    ],
  };
  const form = mapTokenDetailToForm(detail);
  assert.equal(form.username, "节点%3A:|%%2F");
  assert.equal(form.password, detail.password);
  const payload = serializeTokenPayload(form);
  assert.deepEqual(payload, {
    username: detail.username,
    password: detail.password,
    version: detail.version,
    timestamp_from: detail.timestamp_from,
    timestamp_to: detail.timestamp_to,
    token_limit: detail.token_limit,
  });
  assert.equal(detail.username, "节点%253A%3A%7C%25%252F");
  assert.notStrictEqual(form.token_limit, detail.token_limit);
});

test("mapping null credentials yields an empty form and does not decode passwords", () => {
  assert.deepEqual(mapTokenDetailToForm(null), createDefaultToken());
  const detail: TokenDetail = {
    username: null,
    password: "  %3A%7C%25  ",
    token_key: "key",
    timestamp_from: null,
    timestamp_to: null,
    version: 1,
    token_limit: [],
  };
  const form = mapTokenDetailToForm(detail);
  assert.equal(form.username, "");
  assert.equal("originalUsername" in form, false);
  assert.equal(form.password, "  %3A%7C%25  ");
  assert.deepEqual(buildCredentialPayload(form), { password: "%3A%7C%25" });
});

test("unchanged persisted usernames retain original wire bytes in real edit payloads", () => {
  for (const username of [
    "legacy%3A",
    "literal%25%2F",
    "legacy:name|value",
    "节点🙂%7C%zz%3a",
    "  legacy%3A  ",
    "canonical%253A%3A%7C",
  ]) {
    const detail = createDetail(username);
    const form = mapTokenDetailToForm(detail);
    assert.equal(form.username, decodeTokenUsername(username));
    assert.equal(form.originalUsername, username);
    assert.deepEqual(buildOptionalFieldPayload(form), {
      username,
      password: detail.password,
      timestamp_from: detail.timestamp_from,
      timestamp_to: detail.timestamp_to,
    });
    const payload = serializeTokenPayload(form);
    assert.equal(payload.username, username);
    assert.equal("originalUsername" in payload, false);
    assert.equal(JSON.stringify(payload).includes("originalUsername"), false);
  }
});

test("username blur normalization preserves legacy identity through JSON sync and save", () => {
  for (const username of [
    "  ops%2F  ",
    "\t100%\n",
    "  legacy:name|value  ",
    "  节点%253A%3A%7C  ",
  ]) {
    const form = mapTokenDetailToForm(createDetail(username));
    // 输入框失焦时会先去除首尾空白，再将整个表单交回编辑器。
    form.username = form.username.trim();
    assert.equal(buildOptionalFieldPayload(form).username, username);

    const payload = { ...serializeTokenPayload(form), timestamp_to: 999 };
    const synced = applyPartialTokenPayload(
      form,
      JSON.parse(JSON.stringify(payload)),
    );
    assert.deepEqual(synced.dataIssues, []);
    assert.equal(synced.token.username, form.username);
    assert.equal(synced.token.originalUsername, username);
    assert.deepEqual(serializeTokenPayload(synced.token), payload);

    synced.token.username = "  renamed:%2F|  ".trim();
    assert.deepEqual(serializeTokenPayload(synced.token), {
      ...payload,
      username: "renamed%3A%252F%7C",
    });
  }
});

test("intentional form rename encodes the new name and leaves password, timestamps and limits intact", () => {
  const detail = createDetail("legacy%3A");
  const form = mapTokenDetailToForm(detail);
  form.username = "  新🙂:%3A|%2F  ";
  const payload = serializeTokenPayload(form);
  assert.deepEqual(payload, {
    username: "新🙂%3A%253A%7C%252F",
    password: detail.password,
    version: detail.version,
    timestamp_from: detail.timestamp_from,
    timestamp_to: detail.timestamp_to,
    token_limit: detail.token_limit,
  });
  assert.equal("originalUsername" in payload, false);
  assert.equal(detail.username, "legacy%3A");
});

test("unrelated JSON changes preserve the legacy username and provenance", () => {
  const form = mapTokenDetailToForm(createDetail("legacy%3A"));
  const changes = {
    ...serializeTokenPayload(form),
    password: "updated:%3A|",
    timestamp_from: 234,
    timestamp_to: 567,
    token_limit: [
      {
        scopes: [{ kv_namespace: "namespace" }],
        permissions: [{ kv: { read: "data" } }],
      },
    ],
  };
  const result = applyPartialTokenPayload(
    form,
    JSON.parse(JSON.stringify(changes)),
  );
  assert.deepEqual(result.dataIssues, []);
  assert.equal(result.token.username, "legacy:");
  assert.equal(result.token.originalUsername, "legacy%3A");
  assert.deepEqual(serializeTokenPayload(result.token), changes);
  assert.equal(form.password, "secret:%3A|");
  assert.equal(form.timestamp_from, 123);
});

test("repeated editable JSON roundtrips keep persisted legacy identity stable", () => {
  let form = mapTokenDetailToForm(createDetail("legacy%3A%25%2F"));
  const payload = serializeTokenPayload(form);
  for (let round = 0; round < 5; round++) {
    const result = applyPartialTokenPayload(
      form,
      JSON.parse(JSON.stringify(payload)),
    );
    assert.deepEqual(result.dataIssues, []);
    assert.equal(result.token.username, "legacy:%%2F");
    assert.equal(result.token.originalUsername, "legacy%3A%25%2F");
    assert.deepEqual(serializeTokenPayload(result.token), payload);
    form = result.token;
  }
});

test("edited JSON username decodes once, clears provenance and remains stable on subsequent saves", () => {
  const original = mapTokenDetailToForm(createDetail("legacy%3A"));
  const username = "新🙂:%3A|%2F";
  const payload = {
    ...serializeTokenPayload(original),
    username: "新🙂%3A%253A%7C%252F",
  };
  const renamed = applyPartialTokenPayload(original, payload);
  assert.deepEqual(renamed.dataIssues, []);
  assert.equal(renamed.token.username, username);
  assert.equal("originalUsername" in renamed.token, false);
  assert.deepEqual(serializeTokenPayload(renamed.token), payload);
  assert.equal(original.originalUsername, "legacy%3A");
  let form = renamed.token;
  for (let round = 0; round < 5; round++) {
    const result = applyPartialTokenPayload(
      form,
      JSON.parse(JSON.stringify(payload)),
    );
    assert.deepEqual(result.dataIssues, []);
    assert.equal(result.token.username, username);
    assert.equal("originalUsername" in result.token, false);
    assert.deepEqual(serializeTokenPayload(result.token), payload);
    form = result.token;
  }
});

test("full imported wire payloads decode once and serialize without edit provenance", () => {
  const username = "节点🙂:%3A|%25 %2F";
  const payload = {
    ...serializeTokenPayload(mapTokenDetailToForm(createDetail("unused"))),
    username: "节点🙂%3A%253A%7C%2525 %252F",
  };
  for (const form of [
    parseTokenPayloadObject({
      ...payload,
      originalUsername: "ignored-metadata",
    }),
    parseTokenPayloadJson(JSON.stringify(payload)),
  ]) {
    assert.equal(form.username, username);
    assert.equal("originalUsername" in form, false);
    assert.deepEqual(serializeTokenPayload(form), payload);
  }
});

test("import suffix is applied to the decoded name without changing password or limits", () => {
  const payload = {
    ...serializeTokenPayload(mapTokenDetailToForm(createDetail("unused"))),
    username: "节点%253A%3A%7C",
  };
  const imported = mapImportedTokenToForm(payload);
  assert.equal(imported.username, "节点%3A:|_import");
  assert.equal(imported.password, payload.password);
  assert.equal("originalUsername" in imported, false);
  assert.deepEqual(serializeTokenPayload(imported), {
    ...payload,
    username: "节点%253A%3A%7C_import",
  });
});

test("absent or invalid partial usernames retain existing display state and provenance", () => {
  const form = mapTokenDetailToForm(createDetail("legacy%3A"));
  const absent = applyPartialTokenPayload(form, { timestamp_to: 999 });
  assert.deepEqual(absent.dataIssues, []);
  assert.equal(absent.token.username, form.username);
  assert.equal(absent.token.originalUsername, form.originalUsername);
  assert.equal(serializeTokenPayload(absent.token).username, "legacy%3A");
  for (const username of [42, true, {}, []]) {
    const result = applyPartialTokenPayload(form, {
      username,
      password: "updated",
    });
    assert.deepEqual(result.dataIssues, ["invalid_username"]);
    assert.equal(result.token.username, form.username);
    assert.equal(result.token.originalUsername, form.originalUsername);
    assert.equal(result.token.password, "updated");
    assert.equal(serializeTokenPayload(result.token).username, "legacy%3A");
  }
});

test("explicit null partial username clears provenance and retains empty-field omission", () => {
  const form = mapTokenDetailToForm(createDetail("legacy%3A"));
  const result = applyPartialTokenPayload(form, { username: null });
  assert.deepEqual(result.dataIssues, []);
  assert.equal(result.token.username, "");
  assert.equal("originalUsername" in result.token, false);
  assert.equal("username" in buildOptionalFieldPayload(result.token), false);
  assert.equal(serializeTokenPayload(result.token).password, form.password);
});
