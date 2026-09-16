const assert = require("node:assert");
const test = require("node:test");
const core = require("../obsidian/core.js");

test("mergeConfig should supply defaults", () => {
  const merged = core.mergeConfig({});
  assert.strictEqual(merged.saveMethod, "filesystem");
  assert.strictEqual(merged.relativePathTemplate, "Clippings/X/{{yyyy}}/{{mm}}");
  assert.strictEqual(merged.attachmentPathTemplate, "Attachments/X/{{yyyy}}/{{mm}}/{{id}}");
  assert.strictEqual(merged.fileNameTemplate, "{{pathSafeTitle}}");
  assert.strictEqual(merged.downloadImages, true);
  assert.strictEqual(merged.overwriteExisting, false);
});

test("sanitizeFileName and sanitizePathSegment should clean unsafe characters", () => {
  assert.strictEqual(core.sanitizePathSegment("Clippings/X:2026?*"), "Clippings X 2026");
  assert.strictEqual(core.sanitizeFileName("Elon Musk: Tech & AI?"), "Elon Musk Tech & AI");
  assert.strictEqual(core.sanitizeFileName(""), "note");
});

test("formatToBeijingTime should convert ISO UTC to East 8th Beijing Time", () => {
  // 2026-09-16T15:57:30.000Z in UTC is 2026-09-16 23:57:30 in Beijing (UTC+8)
  const beijing = core.formatToBeijingTime("2026-09-16T15:57:30.000Z");
  assert.strictEqual(beijing, "2026-09-16 23:57:30");

  // Non-date string fallback
  assert.strictEqual(core.formatToBeijingTime("10分钟前"), "10分钟前");
  assert.strictEqual(core.formatToBeijingTime(""), "");
});

test("normalizeNumber handles various counts and notations", () => {
  assert.strictEqual(core.normalizeNumber(100), 100);
  assert.strictEqual(core.normalizeNumber("1,234"), 1234);
  assert.strictEqual(core.normalizeNumber("2.5万"), 25000);
  assert.strictEqual(core.normalizeNumber("1.5K"), 1500);
  assert.strictEqual(core.normalizeNumber("3.2M"), 3200000);
  assert.strictEqual(core.normalizeNumber(""), 0);
  assert.strictEqual(core.normalizeNumber(null), 0);
});

test("renderTemplate replaces context variables accurately", () => {
  const tpl = "Hello {{author}}, your id is {{id}} and likes: {{likesCount}}, AI: {{aiSummary}}";
  const ctx = { author: "Alice", id: "12345", likesCount: 42, aiSummary: "极简总结" };
  const out = core.renderTemplate(tpl, ctx);
  assert.strictEqual(out, "Hello Alice, your id is 12345 and likes: 42, AI: 极简总结");
});

test("createNote generates note without # title and with images above source info", () => {
  const post = {
    source: "x",
    id: "1890000000000000000",
    url: "https://x.com/wallstengine/status/1890000000000000000",
    author: "Wall St Engine",
    authorUrl: "https://x.com/wallstengine",
    publishedAt: "2026-09-16T15:57:30.000Z",
    aiSummary: "NFG拟50亿美元出售天然气业务",
    content: "National Fuel Gas $NFG is exploring strategic options...",
    images: ["https://pbs.twimg.com/media/test.jpg?name=large"],
    videos: [],
    topics: ["NFG"],
    repostsCount: 1200,
    commentsCount: 300,
    likesCount: 5000,
  };

  const note = core.createNote(post, core.DEFAULT_CONFIG);

  assert.match(note.relativePath, /^Clippings\/X\/\d{4}\/\d{2}$/);
  // File name format: {author} - {aiSummary}
  assert.strictEqual(note.fileName, "Wall St Engine - NFG拟50亿美元出售天然气业务");

  // Body must NOT start with '# ' title
  assert.strictEqual(note.markdown.includes("# Wall St Engine"), false);
  assert.strictEqual(note.markdown.includes("# {{title}}"), false);

  // Frontmatter exists
  assert.match(note.markdown, /^---[\s\S]+---/);

  // PublishedAt is formatted as Beijing Time in source info
  assert.match(note.markdown, /- 发布时间: 2026-09-16 23:57:30/);

  // Images must appear BEFORE '## 来源信息'
  const imageIndex = note.markdown.indexOf("https://pbs.twimg.com/media/test.jpg");
  const sourceInfoIndex = note.markdown.indexOf("## 来源信息");
  assert.ok(imageIndex > 0, "Image link should exist in markdown");
  assert.ok(sourceInfoIndex > 0, "Source info header should exist");
  assert.ok(imageIndex < sourceInfoIndex, "Image must appear BEFORE ## 来源信息");
});

test("createAttachmentDirectoryPath formats attachment path template", () => {
  const post = {
    id: "998877",
    author: "sam",
  };
  const path = core.createAttachmentDirectoryPath(post, core.DEFAULT_CONFIG);
  assert.match(path, /^Attachments\/X\/\d{4}\/\d{2}\/998877$/);
});
