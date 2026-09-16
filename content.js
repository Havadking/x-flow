// Adds two icon buttons to each tweet's top-right corner (next to the "…"
// menu), styled like X's own action buttons. Translation renders inline
// under the tweet text; the explanation opens in a small popup.

(() => {
  const DEFAULTS = {
    enabled: true,
    targetLang: "简体中文",
    showTranslate: true,
    showExplain: true,
  };

  const MODES = ["translate", "explain"];

  const LABELS = {
    translate: { idle: "DeepSeek 翻译", caption: "已使用 DeepSeek 翻译", fail: "翻译失败" },
    explain: { idle: "DeepSeek 解释", caption: "DeepSeek 解释", fail: "解释失败" },
  };

  const ICONS = {
    translate:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"></path></svg>',
    explain:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"></path></svg>',
  };

  const SHOW_MORE_TEXTS = new Set([
    "显示更多",
    "顯示更多",
    "Show more",
    "もっと見る",
    "더 보기",
    "Mostrar más",
    "Afficher plus",
  ]);

  let settings = { ...DEFAULTS };
  const stateMap = new WeakMap(); // article -> { cache, block, cancel }
  const popup = { el: null, body: null, anchor: null, article: null, cancel: null };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------- settings

  chrome.storage.local.get(Object.keys(DEFAULTS)).then((s) => {
    settings = { ...DEFAULTS, ...s };
    scan();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULTS) settings[key] = change.newValue;
    }
    refreshVisibility();
    scan();
  });

  // ------------------------------------------------------------------ theme

  function parseRGB(color) {
    const m = /rgba?\(([^)]+)\)/.exec(color || "");
    if (!m) return null;
    const [r, g, b] = m[1].split(",").map((n) => parseFloat(n));
    return { r, g, b };
  }

  function detectAccent() {
    const compose = document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
    if (compose) {
      const c = parseRGB(getComputedStyle(compose).backgroundColor);
      if (c && !(c.r === 0 && c.g === 0 && c.b === 0)) return c;
    }
    const link = document.querySelector('article [data-testid="tweetText"] a');
    if (link) {
      const c = parseRGB(getComputedStyle(link).color);
      if (c) return c;
    }
    return { r: 29, g: 155, b: 240 };
  }

  function isDarkBackground() {
    const bg = parseRGB(getComputedStyle(document.body).backgroundColor);
    if (!bg) return false;
    return 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b < 128;
  }

  function applyTheme() {
    const a = detectAccent();
    const root = document.documentElement;
    root.style.setProperty("--ds-accent", `rgb(${a.r}, ${a.g}, ${a.b})`);
    root.style.setProperty("--ds-accent-bg", `rgba(${a.r}, ${a.g}, ${a.b}, 0.1)`);
    const dark = isDarkBackground();
    root.style.setProperty(
      "--ds-popup-bg",
      getComputedStyle(document.body).backgroundColor || (dark ? "#000" : "#fff")
    );
    root.style.setProperty("--ds-popup-fg", dark ? "rgb(231,233,234)" : "rgb(15,20,25)");
    root.style.setProperty(
      "--ds-popup-border",
      dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.1)"
    );
  }

  function injectStyles() {
    if (document.getElementById("ds-styles")) return;
    const style = document.createElement("style");
    style.id = "ds-styles";
    style.textContent = `
      .ds-group { display:inline-flex; align-items:center; gap:2px; }
      .ds-btn {
        display:inline-flex; align-items:center; justify-content:center;
        width:30px; height:30px; border-radius:9999px;
        color:rgb(113,118,123); cursor:pointer;
        transition:background-color .2s ease, color .2s ease;
      }
      .ds-btn:hover { background-color:var(--ds-accent-bg); color:var(--ds-accent); }
      .ds-btn[data-active="1"] { color:var(--ds-accent); }
      .ds-btn[data-busy="1"] { pointer-events:none; }
      .ds-btn svg { width:18px; height:18px; fill:currentColor; }
      .ds-spinner {
        width:16px; height:16px; border:2px solid currentColor;
        border-right-color:transparent; border-radius:50%;
        animation:ds-spin .8s linear infinite;
      }
      @keyframes ds-spin { to { transform:rotate(360deg); } }
      .ds-popup {
        position:fixed; z-index:2147483000; width:360px; max-width:calc(100vw - 24px);
        background:var(--ds-popup-bg); color:var(--ds-popup-fg);
        border:1px solid var(--ds-popup-border); border-radius:16px;
        box-shadow:0 0 15px rgba(101,119,134,.2), 0 0 3px 1px rgba(101,119,134,.15);
        font-size:14px; line-height:20px;
        font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
      }
      .ds-popup-head {
        display:flex; align-items:center; justify-content:space-between;
        padding:10px 12px 6px 16px;
      }
      .ds-popup-title { font-size:13px; font-weight:700; color:rgb(113,118,123); }
      .ds-popup-close {
        display:inline-flex; align-items:center; justify-content:center;
        width:24px; height:24px; border-radius:9999px; cursor:pointer;
        color:rgb(113,118,123);
      }
      .ds-popup-close:hover { background-color:var(--ds-accent-bg); color:var(--ds-accent); }
      .ds-popup-body {
        padding:0 16px 14px; max-height:55vh; overflow-y:auto;
        white-space:pre-wrap; word-wrap:break-word;
      }
      .ds-popup-loading { display:flex; align-items:center; gap:8px; color:rgb(113,118,123); }
      .ds-error { color:rgb(244,33,46); }
    `;
    document.head.appendChild(style);
  }

  // ------------------------------------------------------------ text helpers

  function getMainTweetText(article) {
    const all = [...article.querySelectorAll('[data-testid="tweetText"]')];
    return all.find((el) => !el.closest('div[role="link"]')) || all[0] || null;
  }

  function extractText(el) {
    let out = "";
    el.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        out += node.tagName === "IMG" ? node.getAttribute("alt") || "" : node.textContent;
      }
    });
    return out.trim();
  }

  // Text of the quoted tweet inside the same article, used as extra context.
  function extractQuotedText(tweetTextEl) {
    const article = tweetTextEl.closest("article");
    if (!article) return "";
    const all = [...article.querySelectorAll('[data-testid="tweetText"]')];
    const idx = all.indexOf(tweetTextEl);
    const quoted = idx >= 0 ? all[idx + 1] : null;
    return quoted ? extractText(quoted) : "";
  }

  // ------------------------------------------------------------ auto expand

  function findShowMore(tweetTextEl) {
    const scope = tweetTextEl.parentElement;
    if (!scope) return null;
    const direct = scope.querySelector('[data-testid="tweet-text-show-more-link"]');
    if (direct) return direct;
    for (const el of scope.querySelectorAll(
      'div[role="button"], button, span[role="button"], a[role="link"]'
    )) {
      if (SHOW_MORE_TEXTS.has((el.innerText || "").trim())) return el;
    }
    return null;
  }

  async function waitForPrimaryTweetText() {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const article = document.querySelector('article[data-testid="tweet"]');
      const el = article && getMainTweetText(article);
      if (el && !findShowMore(el)) return el;
      await sleep(150);
    }
    const article = document.querySelector('article[data-testid="tweet"]');
    return article ? getMainTweetText(article) : null;
  }

  // Returns the element holding the full text — either the original one after
  // it expanded in place, or the tweet's text on the detail page if clicking
  // "show more" navigated there. Null if the tweet vanished entirely.
  async function ensureExpanded(tweetTextEl) {
    const more = findShowMore(tweetTextEl);
    if (!more) return tweetTextEl;

    const lengthBefore = tweetTextEl.textContent.length;
    more.click();

    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      await sleep(120);
      if (!tweetTextEl.isConnected) return waitForPrimaryTweetText();
      if (!findShowMore(tweetTextEl) || tweetTextEl.textContent.length > lengthBefore) {
        return tweetTextEl;
      }
    }
    return tweetTextEl.isConnected ? tweetTextEl : waitForPrimaryTweetText();
  }

  // ------------------------------------------------------------- popup (解释)

  function closePopup() {
    if (popup.cancel) {
      try { popup.cancel(); } catch (_) {}
      popup.cancel = null;
    }
    if (popup.el) popup.el.remove();
    if (popup.anchor?.isConnected) popup.anchor.dataset.active = "0";
    popup.el = null;
    popup.body = null;
    popup.anchor = null;
    popup.article = null;
  }

  function positionPopup() {
    const el = popup.el;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const anchor = popup.anchor;
    if (!anchor || !anchor.isConnected) {
      el.style.left = `${Math.max(12, (window.innerWidth - w) / 2)}px`;
      el.style.top = `${Math.max(12, (window.innerHeight - h) / 2)}px`;
      return;
    }
    const r = anchor.getBoundingClientRect();
    let left = Math.min(Math.max(12, r.right - w), window.innerWidth - w - 12);
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 8);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function openPopup(anchor, article) {
    closePopup();
    applyTheme();

    const el = document.createElement("div");
    el.className = "ds-popup";
    el.addEventListener("click", (e) => e.stopPropagation());

    const head = document.createElement("div");
    head.className = "ds-popup-head";
    const title = document.createElement("div");
    title.className = "ds-popup-title";
    title.textContent = LABELS.explain.caption;
    const close = document.createElement("div");
    close.className = "ds-popup-close";
    close.setAttribute("role", "button");
    close.setAttribute("aria-label", "关闭");
    close.innerHTML =
      '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor" aria-hidden="true"><path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z"></path></svg>';
    close.addEventListener("click", closePopup);
    head.appendChild(title);
    head.appendChild(close);

    const body = document.createElement("div");
    body.className = "ds-popup-body";

    el.appendChild(head);
    el.appendChild(body);
    document.body.appendChild(el);

    popup.el = el;
    popup.body = body;
    popup.anchor = anchor;
    popup.article = article;
    if (anchor?.isConnected) anchor.dataset.active = "1";

    setPopupLoading();
    positionPopup();
  }

  function setPopupLoading() {
    if (!popup.body) return;
    popup.body.textContent = "";
    const wrap = document.createElement("div");
    wrap.className = "ds-popup-loading";
    const spinner = document.createElement("div");
    spinner.className = "ds-spinner";
    const label = document.createElement("span");
    label.textContent = "正在解释…";
    wrap.appendChild(spinner);
    wrap.appendChild(label);
    popup.body.appendChild(wrap);
    positionPopup();
  }

  function setPopupText(text, isError) {
    if (!popup.body) return;
    popup.body.textContent = text;
    popup.body.classList.toggle("ds-error", !!isError);
    positionPopup();
  }

  document.addEventListener(
    "click",
    (e) => {
      if (!popup.el) return;
      if (popup.el.contains(e.target)) return;
      if (e.target.closest?.(".ds-btn")) return;
      closePopup();
    },
    true
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePopup();
  });
  window.addEventListener("scroll", () => popup.el && positionPopup(), true);
  window.addEventListener("resize", () => popup.el && positionPopup());

  // -------------------------------------------------------- inline (翻译)

  function getState(article) {
    let st = stateMap.get(article);
    if (!st) {
      st = { cache: {}, block: null, cancel: null };
      stateMap.set(article, st);
    }
    return st;
  }

  function renderInline(article, tweetTextEl, text, isError) {
    const st = getState(article);
    if (st.block?.isConnected) st.block.remove();

    const block = document.createElement("div");
    block.setAttribute("data-deepseek-result", "1");
    block.style.cssText = "margin-top:6px;";
    block.addEventListener("click", (e) => e.stopPropagation());

    const caption = document.createElement("div");
    caption.textContent = isError
      ? `DeepSeek ${LABELS.translate.fail}`
      : LABELS.translate.caption;
    caption.style.cssText =
      "font-size:13px;line-height:16px;color:rgb(113,118,123);margin-bottom:2px;";

    const body = document.createElement("div");
    body.textContent = text;
    body.style.cssText = `font-size:15px;line-height:20px;white-space:pre-wrap;word-wrap:break-word;color:${
      isError ? "rgb(244,33,46)" : getComputedStyle(tweetTextEl).color
    };`;

    block.appendChild(caption);
    block.appendChild(body);
    tweetTextEl.insertAdjacentElement("afterend", block);
    st.block = block;
    return block;
  }

  // ----------------------------------------------------------------- buttons

  function setBusy(btn, busy) {
    if (!btn?.isConnected) return;
    if (busy) {
      btn.dataset.busy = "1";
      btn.innerHTML = '<div class="ds-spinner"></div>';
    } else {
      btn.dataset.busy = "0";
      btn.innerHTML = ICONS[btn.dataset.deepseekBtn];
    }
  }

  function findButton(article, mode) {
    return article?.querySelector(`.ds-btn[data-deepseek-btn="${mode}"]`) || null;
  }

  // Never leaves the spinner running: a reloaded extension (context
  // invalidated) or a hung request both come back as an error object.
  // Connects to background via chrome.runtime.connect for streaming SSE.
  const REQUEST_TIMEOUT_MS = 180000;
  function streamDeepSeek(payload, { onChunk, onDone, onError }) {
    let finished = false;
    let port = null;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      try { port?.disconnect(); } catch (_) {}
      onError("请求超时，DeepSeek 没有在 3 分钟内返回结果。");
    }, REQUEST_TIMEOUT_MS);

    try {
      port = chrome.runtime.connect({ name: "deepseek-stream" });
    } catch (e) {
      clearTimeout(timer);
      finished = true;
      const msg = String(e?.message || e);
      if (/context invalidated/i.test(msg)) {
        onError("插件刚刚更新过，请刷新这个页面后再试。");
      } else {
        onError(`连接后台失败：${msg}`);
      }
      return () => {};
    }

    port.onMessage.addListener((msg) => {
      if (finished || !msg) return;

      if (msg.type === "CHUNK") {
        onChunk(msg.delta || "");
      } else if (msg.type === "DONE") {
        finished = true;
        clearTimeout(timer);
        try { port.disconnect(); } catch (_) {}
        onDone(msg.content || "", msg.model);
      } else if (msg.type === "ERROR" || msg.ok === false) {
        finished = true;
        clearTimeout(timer);
        try { port.disconnect(); } catch (_) {}
        onError(msg.error || "未知错误");
      }
    });

    port.onDisconnect.addListener(() => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const err = chrome.runtime.lastError?.message;
      if (err && /context invalidated/i.test(err)) {
        onError("插件刚刚更新过，请刷新这个页面后再试。");
      } else if (err) {
        onError(`连接断开：${err}`);
      }
    });

    port.postMessage({ type: "START", ...payload });

    return () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { port.disconnect(); } catch (_) {}
    };
  }

  async function runAction(mode, article, btn) {
    let st = getState(article);

    // Cancel in-flight translate if user clicks the button again
    if (mode === "translate" && st.cancel) {
      try { st.cancel(); } catch (_) {}
      st.cancel = null;
      setBusy(btn, false);
      if (st.block?.isConnected) st.block.remove();
      btn.dataset.active = "0";
      return;
    }

    if (mode === "translate" && st.cache.translate) {
      if (st.block?.isConnected) {
        const showing = st.block.style.display !== "none";
        st.block.style.display = showing ? "none" : "";
        btn.dataset.active = showing ? "0" : "1";
      } else {
        const el = getMainTweetText(article);
        if (el) renderInline(article, el, st.cache.translate, false);
        btn.dataset.active = "1";
      }
      return;
    }

    if (mode === "explain") {
      if (popup.el && popup.article === article) {
        closePopup();
        return;
      }
      openPopup(btn, article);
      if (st.cache.explain) {
        setPopupText(st.cache.explain, false);
        return;
      }
    }

    setBusy(btn, true);

    let tweetTextEl = getMainTweetText(article);
    if (!tweetTextEl) {
      setBusy(btn, false);
      return;
    }

    const expanded = await ensureExpanded(tweetTextEl);
    if (!expanded) {
      setBusy(btn, false);
      const message = "推文已从页面上消失，无法读取内容。";
      if (mode === "explain") setPopupText(message, true);
      else renderInline(article, tweetTextEl, message, true);
      return;
    }
    if (expanded !== tweetTextEl) {
      setBusy(btn, false);
      tweetTextEl = expanded;
      article = tweetTextEl.closest("article");
      scan();
      const freshBtn = findButton(article, mode);
      if (freshBtn) {
        btn = freshBtn;
        setBusy(btn, true);
        if (mode === "explain") {
          popup.anchor = btn;
          popup.article = article;
          btn.dataset.active = "1";
          positionPopup();
        }
      }
      st = getState(article);
    }

    const text = extractText(tweetTextEl);
    if (!text) {
      setBusy(btn, false);
      if (mode === "explain") setPopupText("这条推文没有可读的文本。", true);
      return;
    }

    const payload = {
      mode,
      text,
      quotedText: extractQuotedText(tweetTextEl),
      targetLang: settings.targetLang,
    };

    if (mode === "explain") {
      let isFirstChunk = true;
      popup.cancel = streamDeepSeek(payload, {
        onChunk(delta) {
          if (isFirstChunk) {
            isFirstChunk = false;
            setBusy(btn, false);
            if (popup.body) {
              popup.body.textContent = "";
              popup.body.classList.remove("ds-error");
            }
          }
          if (popup.body) {
            popup.body.textContent += delta;
            popup.body.scrollTop = popup.body.scrollHeight;
          }
          positionPopup();
        },
        onDone(fullContent) {
          setBusy(btn, false);
          st.cache.explain = fullContent;
          popup.cancel = null;
          positionPopup();
        },
        onError(error) {
          setBusy(btn, false);
          setPopupText(error, true);
          popup.cancel = null;
        },
      });
    } else {
      let isFirstChunk = true;
      const block = renderInline(article, tweetTextEl, "", false);
      const bodyEl = block?.querySelector("div:last-child");
      if (bodyEl) {
        bodyEl.textContent = "正在翻译…";
        bodyEl.style.opacity = "0.7";
      }

      st.cancel = streamDeepSeek(payload, {
        onChunk(delta) {
          if (isFirstChunk) {
            isFirstChunk = false;
            setBusy(btn, false);
            if (btn?.isConnected) btn.dataset.active = "1";
            if (bodyEl) {
              bodyEl.textContent = "";
              bodyEl.style.opacity = "1";
            }
          }
          if (bodyEl) {
            bodyEl.textContent += delta;
          }
        },
        onDone(fullContent) {
          setBusy(btn, false);
          if (btn?.isConnected) btn.dataset.active = "1";
          st.cache.translate = fullContent;
          st.cancel = null;
        },
        onError(error) {
          setBusy(btn, false);
          st.cancel = null;
          renderInline(article, tweetTextEl, error, true);
        },
      });
    }
  }

  function makeButton(mode, article) {
    const btn = document.createElement("div");
    btn.className = "ds-btn";
    btn.dataset.deepseekBtn = mode;
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
    btn.setAttribute("aria-label", LABELS[mode].idle);
    btn.title = LABELS[mode].idle;
    btn.innerHTML = ICONS[mode];
    btn.style.display =
      (mode === "translate" ? settings.showTranslate : settings.showExplain) === false
        ? "none"
        : "";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      runAction(mode, btn.closest("article") || article, btn);
    });
    return btn;
  }

  function injectButtons(article, caret) {
    const group = document.createElement("div");
    group.className = "ds-group";
    group.setAttribute("data-deepseek-group", "1");
    group.addEventListener("click", (e) => e.stopPropagation());
    for (const mode of MODES) group.appendChild(makeButton(mode, article));
    caret.parentElement.insertBefore(group, caret);
  }

  function refreshVisibility() {
    document.querySelectorAll("[data-deepseek-group]").forEach((group) => {
      group.style.display = settings.enabled ? "" : "none";
    });
    document.querySelectorAll(".ds-btn[data-deepseek-btn]").forEach((btn) => {
      const on =
        btn.dataset.deepseekBtn === "translate" ? settings.showTranslate : settings.showExplain;
      btn.style.display = on === false ? "none" : "";
    });
  }

  // --------------------------------------------------------- scan & observe

  function scan() {
    if (!settings.enabled) return;
    injectStyles();
    applyTheme();
    document.querySelectorAll("article").forEach((article) => {
      if (article.querySelector("[data-deepseek-group]")) return;
      if (!getMainTweetText(article)) return;
      const caret = article.querySelector('[data-testid="caret"]');
      if (!caret?.parentElement) return;
      injectButtons(article, caret);
    });
  }

  let scanScheduled = false;
  new MutationObserver(() => {
    if (scanScheduled) return;
    scanScheduled = true;
    setTimeout(() => {
      scanScheduled = false;
      scan();
    }, 200);
  }).observe(document.body, { childList: true, subtree: true });

  injectStyles();
  scan();
})();
