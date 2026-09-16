// Talks to the DeepSeek API. Runs in the extension's background service
// worker so the request isn't subject to the page's CSP and the API key
// never touches the page context.

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
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULTS,
    TEMPERATURES,
    buildMessages,
    buildRequestBody,
    parseSSEChunk,
  };
}
