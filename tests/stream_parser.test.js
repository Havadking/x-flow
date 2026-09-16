const assert = require("node:assert");
const test = require("node:test");
const {
  buildRequestBody,
  buildMessages,
  parseSSEChunk,
  TEMPERATURES,
} = require("../background.js");

test("buildRequestBody should disable thinking mode and enable streaming", () => {
  const settings = {
    translateModel: "deepseek-flash",
    explainModel: "deepseek-v4-pro",
    targetLang: "简体中文",
  };

  // 1. Translate mode
  const translateBody = buildRequestBody(
    "translate",
    "Hello world",
    "",
    "简体中文",
    settings,
    true
  );
  assert.strictEqual(translateBody.model, "deepseek-flash");
  assert.strictEqual(translateBody.stream, true);
  assert.deepStrictEqual(translateBody.thinking, { type: "disabled" });
  assert.strictEqual(translateBody.temperature, TEMPERATURES.translate);
  assert.strictEqual(translateBody.messages.length, 2);
  assert.strictEqual(translateBody.messages[0].role, "system");
  assert.strictEqual(translateBody.messages[1].role, "user");
  assert.strictEqual(translateBody.messages[1].content, "Hello world");

  // 2. Explain mode
  const explainBody = buildRequestBody(
    "explain",
    "Tech news",
    "Quoted news",
    "简体中文",
    settings,
    true
  );
  assert.strictEqual(explainBody.model, "deepseek-v4-pro");
  assert.strictEqual(explainBody.stream, true);
  assert.deepStrictEqual(explainBody.thinking, { type: "disabled" });
  assert.strictEqual(explainBody.temperature, TEMPERATURES.explain);
  assert.strictEqual(explainBody.messages.length, 2);
  assert.match(explainBody.messages[1].content, /Quoted news/);
});

test("parseSSEChunk handles clean single chunk", () => {
  let buffer = "";
  const deltas = [];
  const chunk = 'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n';

  buffer = parseSSEChunk(buffer, chunk, (d) => deltas.push(d));

  assert.strictEqual(buffer, "");
  assert.deepStrictEqual(deltas, ["你好"]);
});

test("parseSSEChunk handles multiple chunks in single packet and [DONE]", () => {
  let buffer = "";
  const deltas = [];
  const packet =
    'data: {"choices":[{"delta":{"content":"Deep"}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":"Seek"}}]}\n\n' +
    "data: [DONE]\n\n";

  buffer = parseSSEChunk(buffer, packet, (d) => deltas.push(d));

  assert.strictEqual(buffer, "");
  assert.deepStrictEqual(deltas, ["Deep", "Seek"]);
});

test("parseSSEChunk handles split/fragmented chunks (packet fragmentation)", () => {
  let buffer = "";
  const deltas = [];

  // Part 1: incomplete line
  const part1 = 'data: {"choices":[{"delta":{"content":"分';
  buffer = parseSSEChunk(buffer, part1, (d) => deltas.push(d));
  assert.strictEqual(deltas.length, 0);
  assert.strictEqual(buffer, part1);

  // Part 2: completion of line + next line
  const part2 = '包测试"}}]}\n\ndata: {"choices":[{"delta":{"content":"成功"}}]}\n\n';
  buffer = parseSSEChunk(buffer, part2, (d) => deltas.push(d));

  assert.strictEqual(buffer, "");
  assert.deepStrictEqual(deltas, ["分包测试", "成功"]);
});

test("parseSSEChunk ignores malformed lines or non-data lines safely", () => {
  let buffer = "";
  const deltas = [];
  const packet =
    ": ping\n\n" +
    "event: message\n" +
    "data: not valid json\n\n" +
    'data: {"choices":[{"delta":{"content":"正常"}}]}\n\n';

  buffer = parseSSEChunk(buffer, packet, (d) => deltas.push(d));

  assert.strictEqual(buffer, "");
  assert.deepStrictEqual(deltas, ["正常"]);
});
