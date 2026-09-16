(function () {
  const APP_NAMESPACE = "XFlow";

  const STORAGE_KEYS = {
    obsidianConfig: "obsidianConfig",
    noteIndex: "noteIndex"
  };

  const DEFAULT_NOTE_TEMPLATE = [
    "---",
    "created: {{createdAtPretty}}",
    "date modified: {{modifiedAtPretty}}",
    "source: \"{{source}}\"",
    "source name: \"{{sourceName}}\"",
    "author: \"{{authorYaml}}\"",
    "author url: \"{{authorUrlYaml}}\"",
    "published at: \"{{publishedAtYaml}}\"",
    "post id: \"{{idYaml}}\"",
    "post url: \"{{urlYaml}}\"",
    "reposts: {{repostsCount}}",
    "comments: {{commentsCount}}",
    "likes: {{likesCount}}",
    "topics: {{topicsYaml}}",
    "images: {{imagesYaml}}",
    "videos: {{videosYaml}}",
    "---",
    "",
    "# {{title}}",
    "",
    "{{content}}",
    "",
    "## 来源信息",
    "",
    "- 平台: {{sourceName}}",
    "- 作者: {{author}}",
    "- 作者主页: {{authorUrl}}",
    "- 发布时间: {{publishedAt}}",
    "- 原文链接: {{url}}",
    "- 话题: {{topicsCsv}}",
    "",
    "{{imagesMarkdown}}",
    "{{videosMarkdown}}"
  ].join("\n");

  const DEFAULT_CONFIG = {
    saveMethod: "filesystem",
    obsidianVault: "",
    relativePathTemplate: "Clippings/X/{{yyyy}}/{{mm}}",
    attachmentPathTemplate: "Attachments/X/{{yyyy}}/{{mm}}/{{id}}",
    fileNameTemplate: "{{pathSafeAuthor}}-{{id}}",
    noteTemplate: DEFAULT_NOTE_TEMPLATE,
    overwriteExisting: false,
    downloadImages: true
  };

  const TEMPLATE_TOKENS = [
    "{{author}}",
    "{{authorYaml}}",
    "{{authorUrl}}",
    "{{authorUrlYaml}}",
    "{{content}}",
    "{{title}}",
    "{{titleYaml}}",
    "{{publishedAt}}",
    "{{publishedAtYaml}}",
    "{{capturedAt}}",
    "{{capturedAtYaml}}",
    "{{createdAtPretty}}",
    "{{modifiedAtPretty}}",
    "{{source}}",
    "{{sourceName}}",
    "{{url}}",
    "{{urlYaml}}",
    "{{id}}",
    "{{idYaml}}",
    "{{repostsCount}}",
    "{{commentsCount}}",
    "{{likesCount}}",
    "{{imagesMarkdown}}",
    "{{videosMarkdown}}",
    "{{imagesYaml}}",
    "{{videosYaml}}",
    "{{topicsYaml}}",
    "{{topicsCsv}}",
    "{{pathSafeAuthor}}",
    "{{pathSafeTitle}}",
    "{{yyyy}}",
    "{{mm}}",
    "{{dd}}",
    "{{hh}}",
    "{{min}}",
    "{{ss}}"
  ];

  function mergeConfig(rawConfig) {
    return {
      ...DEFAULT_CONFIG,
      ...(rawConfig || {})
    };
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function sanitizePathSegment(value, fallback = "untitled") {
    const cleaned = String(value || "")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\.+$/g, "")
      .trim();

    return cleaned || fallback;
  }

  function sanitizeFileName(value, fallback = "note") {
    return sanitizePathSegment(value, fallback).slice(0, 120);
  }

  function escapeYamlString(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, "\\\"");
  }

  function linesToYamlList(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return "[]";
    }

    return `[${items.map((item) => `"${escapeYamlString(item)}"`).join(", ")}]`;
  }

  function linesToMarkdownList(items, label) {
    if (!Array.isArray(items) || items.length === 0) {
      return "";
    }

    return items.map((item) => `- ${label}: ${item}`).join("\n");
  }

  function linesToImageMarkdown(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return "";
    }

    return items
      .map((item) => {
        if (isExternalUrl(item)) {
          return `<img src="${escapeHtmlAttribute(item)}" alt="" referrerpolicy="no-referrer" />`;
        }

        return `![[${item}]]`;
      })
      .join("\n\n");
  }

  function isExternalUrl(value) {
    return /^https?:\/\//i.test(String(value || "").trim());
  }

  function escapeHtmlAttribute(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function titleFromContent(content) {
    const normalized = String(content || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "X 推文剪藏";
    }

    return normalized.slice(0, 60);
  }

  function normalizeNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    const raw = String(value || "").trim();
    if (!raw) {
      return 0;
    }

    const compactMatch = raw.match(/([\d.,]+)\s*([KMB])/i);
    if (compactMatch) {
      const numeric = Number.parseFloat(compactMatch[1].replace(/,/g, ""));
      const unit = compactMatch[2].toUpperCase();
      const multiplierMap = {
        K: 1000,
        M: 1000000,
        B: 1000000000
      };
      return Number.isFinite(numeric) ? Math.round(numeric * multiplierMap[unit]) : 0;
    }

    if (raw.includes("万")) {
      const numeric = Number.parseFloat(raw.replace("万", ""));
      return Number.isFinite(numeric) ? Math.round(numeric * 10000) : 0;
    }

    const normalized = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeTopics(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  function formatPrettyDate(date) {
    const weekdayNames = [
      "星期日",
      "星期一",
      "星期二",
      "星期三",
      "星期四",
      "星期五",
      "星期六"
    ];
    const monthNames = [
      "一月",
      "二月",
      "三月",
      "四月",
      "五月",
      "六月",
      "七月",
      "八月",
      "九月",
      "十月",
      "十一月",
      "十二月"
    ];
    const hours24 = date.getHours();
    const hours12 = hours24 % 12 || 12;
    let period = "上午";
    if (hours24 < 6) {
      period = "凌晨";
    } else if (hours24 < 12) {
      period = "上午";
    } else if (hours24 < 13) {
      period = "中午";
    } else if (hours24 < 18) {
      period = "下午";
    } else {
      period = "晚上";
    }

    return `${weekdayNames[date.getDay()]}, ${monthNames[date.getMonth()]} ${date.getDate()}日 ${date.getFullYear()}, ${hours12}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${period}`;
  }

  function buildTemplateContext(post, noteState = {}) {
    const now = new Date();
    const topics = normalizeTopics(post.topics);
    const images = Array.isArray(post.images) ? post.images.filter(Boolean) : [];
    const videos = Array.isArray(post.videos) ? post.videos.filter(Boolean) : [];
    const content = String(post.content || "").trim();
    const author = String(post.author || "").trim() || "未知作者";
    const title = titleFromContent(content);
    const source = "x";
    const sourceName = "X (Twitter)";

    return {
      source,
      sourceName,
      author,
      authorYaml: escapeYamlString(author),
      authorUrl: String(post.authorUrl || "").trim(),
      authorUrlYaml: escapeYamlString(String(post.authorUrl || "").trim()),
      content,
      title,
      titleYaml: escapeYamlString(title),
      publishedAt: String(post.publishedAt || "").trim(),
      publishedAtYaml: escapeYamlString(String(post.publishedAt || "").trim()),
      capturedAt: now.toISOString(),
      capturedAtYaml: escapeYamlString(now.toISOString()),
      createdAtPretty: String(noteState.createdAtPretty || formatPrettyDate(now)),
      modifiedAtPretty: formatPrettyDate(now),
      url: String(post.url || "").trim(),
      urlYaml: escapeYamlString(String(post.url || "").trim()),
      id: sanitizeFileName(post.id || `${Date.now()}`, `${Date.now()}`),
      idYaml: escapeYamlString(sanitizeFileName(post.id || `${Date.now()}`, `${Date.now()}`)),
      repostsCount: normalizeNumber(post.repostsCount),
      commentsCount: normalizeNumber(post.commentsCount),
      likesCount: normalizeNumber(post.likesCount),
      imagesMarkdown: linesToImageMarkdown(images),
      videosMarkdown: linesToMarkdownList(videos, "视频"),
      imagesYaml: linesToYamlList(images),
      videosYaml: linesToYamlList(videos),
      topicsYaml: linesToYamlList(topics),
      topicsCsv: topics.join(", "),
      pathSafeAuthor: sanitizeFileName(author, "unknown-author"),
      pathSafeTitle: sanitizeFileName(title, "x-post"),
      yyyy: String(now.getFullYear()),
      mm: pad(now.getMonth() + 1),
      dd: pad(now.getDate()),
      hh: pad(now.getHours()),
      min: pad(now.getMinutes()),
      ss: pad(now.getSeconds())
    };
  }

  function renderTemplate(template, context) {
    return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      if (Object.prototype.hasOwnProperty.call(context, key)) {
        return String(context[key] ?? "");
      }

      return "";
    });
  }

  function normalizeRelativePath(path) {
    return String(path || "")
      .replace(/\\/g, "/")
      .split("/")
      .map((segment) => sanitizePathSegment(segment))
      .filter(Boolean)
      .join("/");
  }

  function splitVaultPath(path) {
    const normalizedPath = String(path || "").replace(/\\/g, "/").trim();
    if (!normalizedPath) {
      return {
        relativePath: "",
        fileName: "note"
      };
    }

    const segments = normalizedPath.split("/").filter(Boolean);
    const fileName = sanitizeFileName(
      segments.pop()?.replace(/\.md$/i, "") || "note",
      "note"
    );

    return {
      relativePath: normalizeRelativePath(segments.join("/")),
      fileName
    };
  }

  function createNote(post, config, noteState = {}) {
    const merged = mergeConfig(config);
    const context = buildTemplateContext(post, noteState);
    const resolvedPath = noteState.pathOverride
      ? splitVaultPath(noteState.pathOverride)
      : {
          relativePath: normalizeRelativePath(
            renderTemplate(merged.relativePathTemplate, context)
          ),
          fileName: sanitizeFileName(
            renderTemplate(merged.fileNameTemplate, context),
            context.id
          )
        };
    const markdown = renderTemplate(merged.noteTemplate, context).replace(/\n{3,}/g, "\n\n");

    return {
      context,
      relativePath: resolvedPath.relativePath,
      fileName: resolvedPath.fileName,
      markdown
    };
  }

  function createAttachmentDirectoryPath(post, config, noteState = {}) {
    const merged = mergeConfig(config);
    const context = buildTemplateContext(post, noteState);
    return normalizeRelativePath(
      renderTemplate(merged.attachmentPathTemplate, context)
    );
  }

  function getNoteTargetPath(note) {
    const fileName = `${note.fileName}.md`;
    return note.relativePath ? `${note.relativePath}/${fileName}` : fileName;
  }

  const target = globalThis[APP_NAMESPACE] || {};
  target.core = {
    STORAGE_KEYS,
    DEFAULT_CONFIG,
    TEMPLATE_TOKENS,
    mergeConfig,
    createNote,
    createAttachmentDirectoryPath,
    getNoteTargetPath,
    formatPrettyDate,
    splitVaultPath,
    sanitizeFileName,
    sanitizePathSegment,
    normalizeNumber,
    renderTemplate,
    buildTemplateContext
  };
  globalThis[APP_NAMESPACE] = target;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = target.core;
  }
})();
