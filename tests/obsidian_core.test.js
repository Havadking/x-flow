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
  assert.strictEqual(merged.templateVersion, 2);
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

test("createNote generates clean note with AI title as filename and only original content in body", () => {
  const post = {
    source: "x",
    id: "1890000000000000000",
    url: "https://x.com/wallstengine/status/1890000000000000000",
    author: "Wall St Engine",
    authorUrl: "https://x.com/wallstengine",
    publishedAt: "2026-09-16T15:57:30.000Z",
    aiSummary: "美联储上调增长通胀预期",
    content: "THE FED JUST RAISED ITS 2026 GROWTH AND INFLATION FORECASTS\n\nGDP: 2.3% from 2.2%",
    images: ["https://pbs.twimg.com/media/test.jpg?name=large"],
    videos: [],
    topics: ["FED"],
    repostsCount: 1200,
    commentsCount: 300,
    likesCount: 5000,
  };

  const note = core.createNote(post, core.DEFAULT_CONFIG);

  assert.match(note.relativePath, /^Clippings\/X\/\d{4}\/\d{2}$/);

  // File name format is directly the title: {author} - {aiSummary}
  assert.strictEqual(note.fileName, "Wall St Engine - 美联储上调增长通胀预期");

  // Body must NOT have '# ' title or '## 来源信息'
  assert.strictEqual(note.markdown.includes("# Wall St Engine"), false);
  assert.strictEqual(note.markdown.includes("# {{title}}"), false);
  assert.strictEqual(note.markdown.includes("## 来源信息"), false);

  // Frontmatter exists with Beijing time
  assert.match(note.markdown, /^---[\s\S]+---/);
  assert.match(note.markdown, /published at: "2026-09-16 23:57:30"/);

  // Body contains ONLY the original content followed immediately by the image
  const contentIndex = note.markdown.indexOf("THE FED JUST RAISED ITS 2026 GROWTH");
  const imageBodyIndex = note.markdown.lastIndexOf("https://pbs.twimg.com/media/test.jpg");
  assert.ok(contentIndex > 0, "Original content must be in body");
  assert.ok(imageBodyIndex > contentIndex, "Image must follow immediately after original content in body");
});

test("createAttachmentDirectoryPath formats attachment path template", () => {
  const post = {
    id: "998877",
    author: "sam",
  };
  const path = core.createAttachmentDirectoryPath(post, core.DEFAULT_CONFIG);
  assert.match(path, /^Attachments\/X\/\d{4}\/\d{2}\/998877$/);
});
