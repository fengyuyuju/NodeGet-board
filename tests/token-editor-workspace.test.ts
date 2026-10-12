import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as Vue from "vue";
import type { ComputedRef, Ref } from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import ts from "typescript";

import {
  buildOptionalFieldPayload,
  mapTokenDetailToForm,
  serializeTokenPayload,
} from "../src/components/token/scopeCodec.ts";
import { applyPartialTokenPayload } from "../src/components/token/tokenPayload.ts";
import type { Token } from "../src/components/token/type.ts";

interface EditorBindings {
  jsonText: Ref<string>;
  jsonErrorMessage: Ref<string>;
  submitDisabled: ComputedRef<boolean>;
  handleJsonChange: (value: string) => void;
}

interface EditorComponent {
  setup: (
    props: { token: Token },
    context: {
      expose: () => void;
      emit: (event: string, token: Token) => void;
    },
  ) => EditorBindings;
}

// 编译生产组件的脚本，保留真实 Vue 调度，只替换翻译和视觉子组件。
const source = readFileSync(
  new URL(
    "../src/components/token/components/TokenEditorWorkspace.vue",
    import.meta.url,
  ),
  "utf8",
);
const { descriptor } = parse(source);
const compiled = compileScript(descriptor, { id: "token-editor-test" });
const script = ts.transpileModule(compiled.content, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const module = { exports: {} as { default: EditorComponent } };
const loadDependency = (name: string): unknown => {
  switch (name) {
    case "vue":
      return Vue;
    case "vue-i18n":
      return { useI18n: () => ({ t: (key: string) => key }) };
    case "../scopeCodec":
      return { serializeTokenPayload };
    case "../tokenPayload":
      return { applyPartialTokenPayload };
    case "@/components/ui/button":
    case "./baseInfoFrom.vue":
    case "./tokenLimitFrom.vue":
    case "./previewTokenJson.vue":
      return {};
    default:
      throw new Error(`Unexpected component dependency: ${name}`);
  }
};
new Function("require", "exports", "module", script)(
  loadDependency,
  module.exports,
  module,
);

const createWorkspace = (context: TestContext) => {
  const props = Vue.reactive({
    token: mapTokenDetailToForm({
      username: "ops%2F",
      password: "synthetic-password",
      token_key: "synthetic-key",
      version: 1,
      timestamp_from: 123,
      timestamp_to: 456,
      token_limit: [
        {
          scopes: [{ agent_uuid: "synthetic-uuid" }],
          permissions: [{ task: { read: "ping" } }],
        },
      ],
    }),
  });
  const scope = Vue.effectScope();
  context.after(() => scope.stop());
  const editor = scope.run(() =>
    module.exports.default.setup(props, {
      expose: () => {},
      emit: (event, token) => {
        if (event === "update:token") props.token = token;
      },
    }),
  )!;
  return { props, editor };
};

test("equivalent JSON edits cannot leave stale usernames after a form rename", async (context) => {
  for (const format of [
    (value: string) => `${value}\n`,
    (value: string) => JSON.stringify(JSON.parse(value)),
    () => JSON.stringify({ timestamp_to: 456 }),
  ]) {
    const { props, editor } = createWorkspace(context);
    const input = format(editor.jsonText.value);
    editor.handleJsonChange(input);
    await Vue.nextTick();
    assert.equal(editor.jsonText.value, input);
    assert.equal(buildOptionalFieldPayload(props.token).username, "ops%2F");

    props.token.username = "renamed:%2F|";
    await Vue.nextTick();
    assert.equal(
      JSON.parse(editor.jsonText.value).username,
      "renamed%3A%252F%7C",
    );

    const payload = JSON.parse(editor.jsonText.value);
    payload.timestamp_to = 999;
    editor.handleJsonChange(JSON.stringify(payload));
    await Vue.nextTick();
    assert.equal(props.token.username, "renamed:%2F|");
    assert.equal(props.token.timestamp_to, 999);
    assert.equal(
      buildOptionalFieldPayload(props.token).username,
      "renamed%3A%252F%7C",
    );
  }
});

test("JSON-origin updates retain formatting and legacy identity across repeated edits", async (context) => {
  const { props, editor } = createWorkspace(context);
  for (const timestamp of [600, 700, 800]) {
    const input = JSON.stringify({
      ...JSON.parse(editor.jsonText.value),
      timestamp_to: timestamp,
    });
    editor.handleJsonChange(input);
    await Vue.nextTick();
    assert.equal(editor.jsonText.value, input);
    assert.equal(props.token.timestamp_to, timestamp);
    assert.equal(props.token.originalUsername, "ops%2F");
    assert.equal(buildOptionalFieldPayload(props.token).username, "ops%2F");
  }
  props.token.timestamp_from = 234;
  await Vue.nextTick();
  assert.equal(JSON.parse(editor.jsonText.value).timestamp_from, 234);
  assert.equal(JSON.parse(editor.jsonText.value).timestamp_to, 800);
});

test("a form edit batched after JSON edits wins over their pending synchronization", async (context) => {
  const { props, editor } = createWorkspace(context);
  const input = JSON.stringify({
    ...JSON.parse(editor.jsonText.value),
    timestamp_to: 700,
  });
  editor.handleJsonChange(input);
  editor.handleJsonChange(`${input}\n`);
  props.token.username = "latest:name";
  await Vue.nextTick();
  assert.equal(JSON.parse(editor.jsonText.value).username, "latest%3Aname");
  assert.equal(JSON.parse(editor.jsonText.value).timestamp_to, 700);
});

test("repeated JSON edits in one tick preserve entered formatting and validation errors", async (context) => {
  const { props, editor } = createWorkspace(context);
  const input = JSON.stringify({
    ...JSON.parse(editor.jsonText.value),
    timestamp_to: 700,
    version: "invalid",
  });
  editor.handleJsonChange(input);
  editor.handleJsonChange(`${input}\n`);
  await Vue.nextTick();
  assert.equal(editor.jsonText.value, `${input}\n`);
  assert.equal(props.token.timestamp_to, 700);
  assert.equal(props.token.version, 1);
  assert.notEqual(editor.jsonErrorMessage.value, "");
  assert.equal(editor.submitDisabled.value, true);

  props.token.timestamp_from = 234;
  await Vue.nextTick();
  assert.equal(JSON.parse(editor.jsonText.value).timestamp_from, 234);
  assert.equal(editor.jsonErrorMessage.value, "");
  assert.equal(editor.submitDisabled.value, false);
});

test("invalid JSON preserves the form until a later form edit refreshes the editor", async (context) => {
  const { props, editor } = createWorkspace(context);
  const original = serializeTokenPayload(props.token);
  editor.handleJsonChange("{");
  await Vue.nextTick();
  assert.deepEqual(serializeTokenPayload(props.token), original);
  assert.equal(editor.jsonText.value, "{");
  assert.equal(editor.submitDisabled.value, true);

  props.token.username = "recovered|name";
  await Vue.nextTick();
  assert.equal(JSON.parse(editor.jsonText.value).username, "recovered%7Cname");
  assert.equal(editor.jsonErrorMessage.value, "");
  assert.equal(editor.submitDisabled.value, false);
});
