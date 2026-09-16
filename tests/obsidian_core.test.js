const assert = require("node:assert");
const test = require("node:test");
const core = require("../obsidian/core.js");

test("mergeConfig should supply defaults", () => {
  const merged = core.mergeConfig({});
  assert.strictEqual(merged.saveMethod, "filesystem");
  assert.strictEqual(merged.relativePathTemplate, "Clippings/X/{{yyyy}}/{{mm}}");
  assert.strictEqual(merged.attachmentPathTemplate, "Attachments/X/{{yyyy}}/{{mm}}/{{id}}");
  assert.strictEqual(merged.downloadImages, true);
  assert.strictEqual(merged.overwriteExisting, false);
});

test("sanitizeFileName and sanitizePathSegment should clean unsafe characters", () => {
  assert.strictEqual(core.sanitizePathSegment("Clippings/X:2026?*"), "Clippings X 2026");
  assert.strictEqual(core.sanitizeFileName("Elon Musk: Tech & AI?"), "Elon Musk Tech & AI");
  assert.strictEqual(core.sanitizeFileName(""), "note");
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
  const tpl = "Hello {{author}}, your id is {{id}} and likes: {{likesCount}}";
  const ctx = { author: "Alice", id: "12345", likesCount: 42 };
  const out = core.renderTemplate(tpl, ctx);
  assert.strictEqual(out, "Hello Alice, your id is 12345 and likes: 42");
});

test("createNote generates complete note structure with Frontmatter and Markdown", () => {
  const post = {
    source: "x",
    id: "1890000000000000000",
    url: "https://x.com/jack/status/1890000000000000000",
    author: "jack",
    authorUrl: "https://x.com/jack",
    publishedAt: "2026-03-01T10:00:00.000Z",
    content: "just setting up my twttr #nostalgia",
    images: ["https://pbs.twimg.com/media/test.jpg?name=large"],
    videos: [],
    topics: ["nostalgia"],
    repostsCount: 1200,
    commentsCount: 300,
    likesCount: 5000,
  };

  const note = core.createNote(post, core.DEFAULT_CONFIG);

  assert.match(note.relativePath, /^Clippings\/X\/\d{4}\/\d{2}$/);
  assert.strictEqual(note.fileName, "jack-1890000000000000000");
  assert.match(note.markdown, /^---[\s\S]+---/);
  assert.match(note.markdown, /source: "x"/);
  assert.match(note.markdown, /author: "jack"/);
  assert.match(note.markdown, /likes: 5000/);
  assert.match(note.markdown, /just setting up my twttr #nostalgia/);
  assert.match(note.markdown, /https:\/\/pbs\.twimg\.com\/media\/test\.jpg/);
});

test("createAttachmentDirectoryPath formats attachment path template", () => {
  const post = {
    id: "998877",
    author: "sam",
  };
  const path = core.createAttachmentDirectoryPath(post, core.DEFAULT_CONFIG);
  assert.match(path, /^Attachments\/X\/\d{4}\/\d{2}\/998877$/);
});
