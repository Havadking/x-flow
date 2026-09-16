// X-Flow background service worker
// Handles DeepSeek streaming API and Obsidian knowledge clipping.

if (typeof importScripts === "function") {
  try {
    importScripts("obsidian/core.js", "obsidian/idb.js");
  } catch (e) {
    console.error("Failed to importScripts:", e);
  }
}

const DEFAULTS = {
  apiKey: "",
  translateModel: "deepseek-flash",
  explainModel: "deepseek-v4-pro",
  targetLang: "简体中文",
  enabled: true,
};

// Model ids this extension shipped with before DeepSeek retired them; a
// stored value equal to one of these is treated as "use the default".
const RETIRED_MODELS = new Set(["deepseek-chat", "deepseek-reasoner"]);

// 1.3 is DeepSeek's documented pick for translation.
const TEMPERATURES = { translate: 1.3, explain: 1.0 };

const REQUEST_TIMEOUT_MS = 170000;

// DeepSeek answers 503 "Service is too busy" under load; a couple of spaced
// retries usually get through without bothering the user.
const RETRY_STATUSES = new Set([429, 503]);
const RETRY_DELAYS_MS = [1500, 3500];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const s = { ...DEFAULTS, ...stored };
  for (const key of ["translateModel", "explainModel"]) {
    const v = (s[key] || "").trim();
    s[key] = !v || RETIRED_MODELS.has(v) ? DEFAULTS[key] : v;
  }
  return s;
}

function buildMessages(mode, text, quotedText, targetLang) {
  if (mode === "explain") {
    const system =
      `你是一个帮助读者理解社交媒体推文的助手。请用${targetLang}解释用户给出的推文。` +
      "先用一句话说明这条推文在讲什么，然后解释其中的术语、缩写、人名、机构、背景事件和言外之意。" +
      "简洁清楚，可以用简短的分点，不要逐句翻译，不要使用 Markdown 标题或加粗符号。";
    const user = quotedText
      ? `推文：\n${text}\n\n它引用的推文（背景信息）：\n${quotedText}`
      : `推文：\n${text}`;
    return [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
  }

  return [
    {
      role: "system",
      content:
        `你是一个专业的推文翻译助手。请把用户提供的推文文本翻译成${targetLang}。` +
        "只输出翻译结果本身，不要加任何解释、引号或前缀。" +
        "话题标签(#xxx)和提及(@xxx)保留原样，可以自然地融入译文中。" +
        "保留原文的换行结构。",
    },
    { role: "user", content: text },
  ];
}

function buildRequestBody(mode, text, quotedText, targetLang, settings, stream = true) {
  const model = mode === "explain" ? settings.explainModel : settings.translateModel;
  return {
    model,
    stream,
    thinking: { type: "disabled" },
    temperature: TEMPERATURES[mode] ?? 1.0,
    messages: buildMessages(mode, text, quotedText, targetLang || settings.targetLang),
  };
}

function parseSSEChunk(buffer, newChunk, onDelta) {
  buffer += newChunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || !line.startsWith("data:")) continue;
    const dataStr = line.slice(5).trim();
    if (dataStr === "[DONE]") continue;
    try {
      const json = JSON.parse(dataStr);
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) onDelta(delta);
    } catch (_) {}
  }
  return buffer;
}

async function handleStreamRequest(port, payload) {
  const settings = await getSettings();
  if (!settings.apiKey) {
    try {
      port.postMessage({ ok: false, type: "ERROR", error: "还没有配置 DeepSeek API Key，请点击插件图标进入设置填写。" });
    } catch (_) {}
    return;
  }

  const { mode, text, quotedText, targetLang } = payload;
  const body = buildRequestBody(mode, text, quotedText, targetLang, settings, true);
  const controller = new AbortController();

  const onDisconnect = () => {
    controller.abort();
  };
  port.onDisconnect.addListener(onDisconnect);

  let resp;
  for (let attempt = 0; ; attempt++) {
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      resp = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (controller.signal.aborted) return;
      try {
        port.postMessage({ ok: false, type: "ERROR", error: `网络请求失败：${String(e)}` });
      } catch (_) {}
      return;
    }
    clearTimeout(timer);

    if (resp.ok) break;

    let detail = "";
    try {
      detail = (await resp.text()).slice(0, 300);
    } catch (_) {}

    if (RETRY_STATUSES.has(resp.status) && attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      if (controller.signal.aborted) return;
      continue;
    }

    const busyHint =
      resp.status === 503
        ? `DeepSeek 服务当前过载，已自动重试 ${RETRY_DELAYS_MS.length} 次仍失败，请稍后再试或换一个模型。\n`
        : "";
    try {
      port.postMessage({
        ok: false,
        type: "ERROR",
        error: `${busyHint}DeepSeek API 返回错误 (${resp.status}，模型 ${body.model})：${detail}`,
      });
    } catch (_) {}
    return;
  }

  if (!resp.body) {
    try {
      port.postMessage({ ok: false, type: "ERROR", error: "DeepSeek API 返回了空的数据流。" });
    } catch (_) {}
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let accumulated = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkStr = decoder.decode(value, { stream: true });
      buffer = parseSSEChunk(buffer, chunkStr, (delta) => {
        accumulated += delta;
        try {
          port.postMessage({ ok: true, type: "CHUNK", delta });
        } catch (_) {}
      });
    }
    if (buffer.trim()) {
      parseSSEChunk(buffer, "\n", (delta) => {
        accumulated += delta;
        try {
          port.postMessage({ ok: true, type: "CHUNK", delta });
        } catch (_) {}
      });
    }
  } catch (e) {
    if (controller.signal.aborted) return;
    try {
      port.postMessage({ ok: false, type: "ERROR", error: `数据读取中断：${String(e)}` });
    } catch (_) {}
    return;
  }

  if (!accumulated) {
    try {
      port.postMessage({ ok: false, type: "ERROR", error: "DeepSeek 返回了空结果。" });
    } catch (_) {}
    return;
  }

  try {
    port.postMessage({ ok: true, type: "DONE", content: accumulated, model: body.model });
  } catch (_) {}
}

async function callDeepSeek(mode, text, quotedText, targetLang) {
  const settings = await getSettings();
  if (!settings.apiKey) {
    return { ok: false, error: "还没有配置 DeepSeek API Key，请点击插件图标进入设置填写。" };
  }

  const body = buildRequestBody(mode, text, quotedText, targetLang, settings, false);

  let resp;
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      resp = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (e?.name === "AbortError") {
        return { ok: false, error: `请求超时（模型 ${body.model} 没有在限定时间内返回）。` };
      }
      return { ok: false, error: `网络请求失败：${String(e)}` };
    }
    clearTimeout(timer);

    if (resp.ok) break;

    let detail = "";
    try {
      detail = (await resp.text()).slice(0, 300);
    } catch (_) {}

    if (RETRY_STATUSES.has(resp.status) && attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    const busyHint =
      resp.status === 503
        ? `DeepSeek 服务当前过载，已自动重试 ${RETRY_DELAYS_MS.length} 次仍失败，请稍后再试或换一个模型。\n`
        : "";
    return { ok: false, error: `${busyHint}DeepSeek API 返回错误 (${resp.status}，模型 ${body.model})：${detail}` };
  }

  let data;
  try {
    data = await resp.json();
  } catch (e) {
    return { ok: false, error: "无法解析 DeepSeek 返回的数据。" };
  }

  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) return { ok: false, error: "DeepSeek 返回了空结果。" };
  return { ok: true, content, model: body.model };
}

// ----------------------------------------------------------- Obsidian Clipper

function getObsidianCore() {
  return globalThis.XFlow?.core;
}

function getObsidianDb() {
  return globalThis.XFlow?.db;
}

async function getObsidianConfig() {
  const core = getObsidianCore();
  const storageKey = core?.STORAGE_KEYS?.obsidianConfig || "obsidianConfig";
  const stored = await chrome.storage.local.get(storageKey);
  let config = stored[storageKey] || {};

  // Auto-migrate legacy templates (e.g. ones with '# {{title}}' or '## 来源信息', or legacy fileNameTemplate)
  if (
    config.noteTemplate &&
    (config.noteTemplate.includes("# {{title}}") ||
      config.noteTemplate.includes("## 来源信息") ||
      config.fileNameTemplate === "{{pathSafeAuthor}}-{{id}}" ||
      !config.templateVersion ||
      config.templateVersion < 2)
  ) {
    config = {
      ...config,
      fileNameTemplate: core ? core.DEFAULT_CONFIG.fileNameTemplate : "{{pathSafeTitle}}",
      noteTemplate: core ? core.DEFAULT_CONFIG.noteTemplate : "",
      templateVersion: 2
    };
    try {
      await chrome.storage.local.set({ [storageKey]: config });
    } catch (_) {}
  }

  return core ? core.mergeConfig(config) : config;
}

async function queryHandlePermission(handle) {
  if (!handle || typeof handle.queryPermission !== "function") {
    return "missing";
  }
  try {
    return await handle.queryPermission({ mode: "readwrite" });
  } catch (_error) {
    return "prompt";
  }
}

async function getObsidianStatus() {
  const config = await getObsidianConfig();
  const db = getObsidianDb();
  const handle = db ? await db.getVaultHandle() : null;
  const permissionState = handle ? await queryHandlePermission(handle) : "missing";

  return {
    ok: true,
    config,
    vaultName: handle?.name || "",
    permissionState
  };
}

async function getNoteIndex() {
  const core = getObsidianCore();
  const storageKey = core?.STORAGE_KEYS?.noteIndex || "noteIndex";
  const { [storageKey]: noteIndex } = await chrome.storage.local.get(storageKey);
  return noteIndex && typeof noteIndex === "object" ? noteIndex : {};
}

async function upsertNoteIndexEntry(noteKey, entry) {
  const core = getObsidianCore();
  const storageKey = core?.STORAGE_KEYS?.noteIndex || "noteIndex";
  const noteIndex = await getNoteIndex();
  noteIndex[noteKey] = {
    ...(noteIndex[noteKey] || {}),
    ...entry
  };
  await chrome.storage.local.set({ [storageKey]: noteIndex });
}

function normalizeVaultPath(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

async function ensureDirectory(rootHandle, relativePath) {
  let currentHandle = rootHandle;
  const segments = String(relativePath || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    currentHandle = await currentHandle.getDirectoryHandle(segment, { create: true });
  }
  return currentHandle;
}

function guessFileExtension(url, mimeType) {
  const normalizedMimeType = String(mimeType || "").toLowerCase();
  if (normalizedMimeType.includes("jpeg")) return "jpg";
  if (normalizedMimeType.includes("png")) return "png";
  if (normalizedMimeType.includes("gif")) return "gif";
  if (normalizedMimeType.includes("webp")) return "webp";
  if (normalizedMimeType.includes("svg")) return "svg";

  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (match) return match[1].toLowerCase();
  } catch (_) {}

  return "jpg";
}

async function downloadImagesToAssets(imageUrls, vaultHandle, config, post, noteState) {
  const core = getObsidianCore();
  const attachmentRelativePath = core.createAttachmentDirectoryPath(post, config, noteState);
  const localImagePaths = [];
  let attachmentDirectoryHandle = null;

  for (let index = 0; index < imageUrls.length; index += 1) {
    const imageUrl = imageUrls[index];
    try {
      const response = await fetch(imageUrl, {
        credentials: "omit",
        referrerPolicy: "no-referrer"
      });
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);

      const blob = await response.blob();
      const extension = guessFileExtension(imageUrl, blob.type);
      const fileName = `${String(index + 1).padStart(2, "0")}.${extension}`;

      if (!attachmentDirectoryHandle) {
        attachmentDirectoryHandle = await ensureDirectory(vaultHandle, attachmentRelativePath);
      }

      const fileHandle = await attachmentDirectoryHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(blob);
      } finally {
        await writable.close();
      }

      localImagePaths.push(
        normalizeVaultPath(`${attachmentRelativePath ? `${attachmentRelativePath}/` : ""}${fileName}`)
      );
    } catch (_error) {
      localImagePaths.push(imageUrl);
    }
  }

  return localImagePaths;
}

function buildObsidianUri(vault, filePath, content) {
  const normalizedPath = String(filePath || "").replace(/\.md$/i, "");
  const params = [
    ["vault", vault],
    ["file", normalizedPath],
    ["content", content],
    ["silent", "true"]
  ];
  return `obsidian://new?${params
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&")}`;
}

async function getTargetFileHandle(directoryHandle, baseFileName, overwriteExisting) {
  const core = getObsidianCore();
  const extension = ".md";
  const sanitizedBaseName = core.sanitizeFileName(baseFileName, `${Date.now()}`);

  if (overwriteExisting) {
    return directoryHandle.getFileHandle(`${sanitizedBaseName}${extension}`, { create: true });
  }

  let index = 0;
  while (index < 1000) {
    const candidateName =
      index === 0
        ? `${sanitizedBaseName}${extension}`
        : `${sanitizedBaseName}-${index}${extension}`;

    try {
      await directoryHandle.getFileHandle(candidateName, { create: false });
      index += 1;
    } catch (_error) {
      return directoryHandle.getFileHandle(candidateName, { create: true });
    }
  }

  throw new Error("连续文件名冲突过多，请检查文件名模板。");
}

async function generateAISummary(content, author) {
  const settings = await getSettings();
  if (!settings.apiKey || !content) {
    return "";
  }

  const model = "deepseek-flash";
  const systemPrompt =
    "你是一个推文标题概括助手。请用简短的几个字（中文，严格控制在4到12个汉字以内）高度提炼以下推文的核心事件或主题。" +
    "要求：必须一眼能够看懂，严禁输出任何标点符号（无句号、无冒号、无逗号）、严禁书名号、严禁引号、严禁任何前缀提示词（如'标题：'、'总结：'），仅直接输出这几个字的短语。";

  const userPrompt = `作者：${author || "推特用户"}\n内容：\n${content.slice(0, 1000)}`;

  const body = {
    model,
    stream: false,
    thinking: { type: "disabled" },
    temperature: 0.3,
    max_tokens: 30,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) return "";
    const data = await resp.json();
    let summary = data?.choices?.[0]?.message?.content?.trim() || "";
    summary = summary
      .replace(/["'“”‘’《》【】「」『』:：#]/g, "")
      .replace(/^[总结标题概括]+[：:]\s*/, "")
      .replace(/[。！!？?]+$/, "")
      .trim();
    if (summary.length > 20) {
      summary = summary.slice(0, 20);
    }
    return summary;
  } catch (_) {
    return "";
  }
}

async function saveObsidianPost(rawPost) {
  const core = getObsidianCore();
  if (!core) {
    return { ok: false, error: "剪藏核心库未就绪，请刷新重试。" };
  }

  const config = await getObsidianConfig();
  const workingPost = {
    ...rawPost,
    source: "x",
    id: String(rawPost?.id || "").trim() || `${Date.now()}`,
    images: Array.isArray(rawPost?.images) ? rawPost.images.filter(Boolean) : [],
    videos: Array.isArray(rawPost?.videos) ? rawPost.videos.filter(Boolean) : [],
    topics: Array.isArray(rawPost?.topics) ? rawPost.topics.filter(Boolean) : []
  };

  // Generate short AI summary for title & note name (thinking mode disabled)
  if (!workingPost.aiSummary) {
    const summary = await generateAISummary(workingPost.content || "", workingPost.author || "");
    if (summary) {
      workingPost.aiSummary = summary;
      workingPost.title = `${workingPost.author || "X"} - ${summary}`;
    }
  }

  const noteKey = `x::${workingPost.id}`;
  const noteIndex = await getNoteIndex();
  const existingEntry = noteIndex[noteKey] || null;

  if (config.saveMethod === "obsidian-uri") {
    const vault = String(config.obsidianVault || "").trim();
    if (!vault) {
      return {
        ok: false,
        code: "OBSIDIAN_VAULT_REQUIRED",
        error: "还没有配置 Obsidian Vault 名称，请点击插件图标进入设置填写。"
      };
    }

    const noteState = {
      createdAtPretty: existingEntry?.createdAtPretty || "",
      pathOverride: existingEntry?.path || ""
    };
    const note = core.createNote(workingPost, config, noteState);
    const path = core.getNoteTargetPath(note);
    const uri = buildObsidianUri(vault, path, note.markdown);

    if (uri.length > 7500) {
      return {
        ok: false,
        code: "URI_TOO_LONG",
        error: "当前推文内容过长，URI 模式超出浏览器限制，建议改用直接写入本地目录模式。"
      };
    }

    await upsertNoteIndexEntry(noteKey, {
      path,
      createdAtPretty: note.context.createdAtPretty
    });

    return {
      ok: true,
      mode: "obsidian-uri",
      path,
      uri,
      updatedExisting: Boolean(existingEntry?.path)
    };
  }

  // Filesystem mode
  const db = getObsidianDb();
  const vaultHandle = db ? await db.getVaultHandle() : null;
  if (!vaultHandle) {
    return {
      ok: false,
      code: "VAULT_NOT_READY",
      error: "还没有选择本地 Obsidian 库，请点击插件图标进入设置授权。"
    };
  }

  const permissionState = await queryHandlePermission(vaultHandle);
  if (permissionState !== "granted") {
    return {
      ok: false,
      code: "VAULT_PERMISSION_REQUIRED",
      error: "Obsidian 库权限已失效，请进入设置页重新点击选择目录完成授权。"
    };
  }

  const noteState = {
    createdAtPretty: existingEntry?.createdAtPretty || "",
    pathOverride: existingEntry?.path || ""
  };

  if (config.downloadImages && workingPost.images.length > 0) {
    workingPost.images = await downloadImagesToAssets(
      workingPost.images,
      vaultHandle,
      config,
      workingPost,
      noteState
    );
  }

  const note = core.createNote(workingPost, config, noteState);
  const targetDirectory = await ensureDirectory(vaultHandle, note.relativePath);
  const fileHandle = await getTargetFileHandle(targetDirectory, note.fileName, config.overwriteExisting);
  const writable = await fileHandle.createWritable();

  try {
    await writable.write(note.markdown);
  } finally {
    await writable.close();
  }

  const notePath = `${note.relativePath ? `${note.relativePath}/` : ""}${fileHandle.name}`;
  await upsertNoteIndexEntry(noteKey, {
    path: notePath,
    createdAtPretty: note.context.createdAtPretty
  });

  return {
    ok: true,
    mode: "filesystem",
    path: notePath,
    fileName: fileHandle.name,
    vaultName: vaultHandle.name,
    updatedExisting: Boolean(existingEntry?.path)
  };
}

if (typeof chrome !== "undefined" && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(async () => {
    const core = getObsidianCore();
    if (core) {
      const storageKey = core.STORAGE_KEYS.obsidianConfig;
      const stored = await chrome.storage.local.get(storageKey);
      if (!stored[storageKey]) {
        await chrome.storage.local.set({ [storageKey]: core.DEFAULT_CONFIG });
      }
    }
  });
}

if (typeof chrome !== "undefined" && chrome.runtime?.onConnect) {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "deepseek-stream") return;
    port.onMessage.addListener((msg) => {
      if (msg?.type === "START") {
        handleStreamRequest(port, msg);
      }
    });
  });
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "DEEPSEEK_RUN") {
      (async () => {
        sendResponse(
          await callDeepSeek(msg.mode, msg.text, msg.quotedText, msg.targetLang)
        );
      })();
      return true; // keep the message channel open for the async response
    }

    if (msg?.type === "DEEPSEEK_TEST_KEY") {
      (async () => {
        sendResponse(await callDeepSeek("translate", "Hello, world!", "", "简体中文"));
      })();
      return true;
    }

    if (msg?.type === "OBSIDIAN_SAVE" || msg?.type === "save-post") {
      (async () => {
        sendResponse(await saveObsidianPost(msg.post || {}));
      })();
      return true;
    }

    if (msg?.type === "GET_OBSIDIAN_STATUS" || msg?.type === "get-status") {
      (async () => {
        sendResponse(await getObsidianStatus());
      })();
      return true;
    }

    if (msg?.type === "OPEN_OPTIONS") {
      (async () => {
        await chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
      })();
      return true;
    }
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULTS,
    TEMPERATURES,
    buildMessages,
    buildRequestBody,
    parseSSEChunk,
    generateAISummary,
  };
}
