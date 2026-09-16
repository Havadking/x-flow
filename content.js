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
    translate: { idle: "DeepSeek 翻译", caption: "DeepSeek 翻译", fail: "翻译失败" },
    explain: { idle: "DeepSeek 解释", caption: "DeepSeek 解释", fail: "解释失败" },
  };

  const ICONS = {
    translate:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="m5 8 6 6"/>' +
      '<path d="m4 14 6-6 2-3"/>' +
      '<path d="M2 5h12"/>' +
      '<path d="M7 2h1"/>' +
      '<path d="m22 22-5-10-5 10"/>' +
      '<path d="M14 18h6"/>' +
      '</svg>',
    explain:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>' +
      '<path d="m19 3-.8 2.2a1 1 0 0 1-.6.6L15.4 6.6l2.2.8a1 1 0 0 1 .6.6l.8 2.2.8-2.2a1 1 0 0 1 .6-.6l2.2-.8-2.2-.8a1 1 0 0 1-.6-.6z"/>' +
      '</svg>',
  };

  const UI_ICONS = {
    sparkle:
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:13px;height:13px;flex-shrink:0;"><path d="M12 2.25c.34 0 .66.21.79.53l2.25 5.56 5.56 2.25c.32.13.53.45.53.79s-.21.66-.53.79l-5.56 2.25-2.25 5.56a.86.86 0 0 1-1.58 0l-2.25-5.56-5.56-2.25a.86.86 0 0 1 0-1.58l5.56-2.25 2.25-5.56c.13-.32.45-.53.79-.53zm-6.75 12c.26 0 .5.16.6.4l1 2.5 2.5 1c.24.1.4.34.4.6s-.16.5-.4.6l-2.5 1-1 2.5a.65.65 0 0 1-1.2 0l-1-2.5-2.5-1a.65.65 0 0 1 0-1.2l2.5-1 1-2.5c.1-.24.34-.4.6-.4z"/></svg>',
    copy:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><polyline points="20 6 9 17 4 12"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
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
    root.style.setProperty("--ds-accent-rgb", `${a.r}, ${a.g}, ${a.b}`);
    root.style.setProperty("--ds-accent-bg", `rgba(${a.r}, ${a.g}, ${a.b}, 0.1)`);
    root.style.setProperty("--ds-accent-hover", `rgba(${a.r}, ${a.g}, ${a.b}, 0.15)`);

    const dark = isDarkBackground();
    root.style.setProperty(
      "--ds-card-bg",
      dark ? "rgba(255, 255, 255, 0.035)" : "rgba(0, 0, 0, 0.02)"
    );
    root.style.setProperty(
      "--ds-card-border",
      dark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)"
    );
    root.style.setProperty(
      "--ds-popup-bg",
      dark ? "rgba(0, 0, 0, 0.85)" : "rgba(255, 255, 255, 0.92)"
    );
    root.style.setProperty("--ds-popup-fg", dark ? "rgb(231,233,234)" : "rgb(15,20,25)");
    root.style.setProperty(
      "--ds-popup-border",
      dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)"
    );
    root.style.setProperty(
      "--ds-text-primary",
      dark ? "rgb(231,233,234)" : "rgb(15,20,25)"
    );
    root.style.setProperty("--ds-text-muted", "rgb(113, 118, 123)");
  }

  function injectStyles() {
    if (document.getElementById("ds-styles")) return;
    const style = document.createElement("style");
    style.id = "ds-styles";
    style.textContent = `
      .ds-group {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        margin-right: 2px;
        vertical-align: middle;
      }
      .ds-btn {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 9999px;
        color: rgb(113, 118, 123);
        cursor: pointer;
        transition: background-color .15s ease, color .15s ease, transform .1s ease;
        user-select: none;
        box-sizing: border-box;
      }
      .ds-btn:hover {
        background-color: var(--ds-accent-bg);
        color: var(--ds-accent);
      }
      .ds-btn:active {
        transform: scale(0.92);
      }
      .ds-btn[data-active="1"] {
        color: var(--ds-accent);
        background-color: var(--ds-accent-bg);
      }
      .ds-btn[data-busy="1"] {
        pointer-events: none;
      }
      .ds-btn svg {
        width: 19px;
        height: 19px;
      }
      .ds-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        animation: ds-spin .75s linear infinite;
      }
      @keyframes ds-spin { to { transform: rotate(360deg); } }

      .ds-btn::after {
        content: attr(data-tooltip);
        position: absolute;
        bottom: -28px;
        left: 50%;
        transform: translateX(-50%) scale(0.92);
        background: rgba(15, 20, 25, 0.88);
        color: #fff;
        font-size: 11px;
        font-weight: 500;
        padding: 3px 8px;
        border-radius: 4px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity .15s ease, transform .15s ease;
        z-index: 99999;
        backdrop-filter: blur(4px);
        box-shadow: 0 4px 10px rgba(0,0,0,0.15);
      }
      .ds-btn:hover::after {
        opacity: 1;
        transform: translateX(-50%) scale(1);
        transition-delay: .35s;
      }

      .ds-trans-card {
        margin-top: 8px;
        margin-bottom: 6px;
        padding: 10px 14px 12px;
        background: var(--ds-card-bg);
        border: 1px solid var(--ds-card-border);
        border-left: 3px solid var(--ds-accent);
        border-radius: 6px 12px 12px 6px;
        font-family: inherit;
        transition: opacity .2s ease;
      }
      .ds-trans-card.ds-error {
        border-left-color: rgb(244, 33, 46);
        background: rgba(244, 33, 46, 0.04);
      }
      .ds-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 7px;
        user-select: none;
      }
      .ds-card-meta {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .ds-brand-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        font-weight: 700;
        color: var(--ds-accent);
        letter-spacing: -0.01em;
      }
      .ds-card-header.ds-error-head .ds-brand-badge {
        color: rgb(244, 33, 46);
      }
      .ds-lang-tag {
        color: var(--ds-text-muted);
        font-size: 12px;
      }
      .ds-card-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .ds-card-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 7px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 9999px;
        color: var(--ds-text-muted);
        cursor: pointer;
        font-size: 11px;
        line-height: 14px;
        transition: all .15s ease;
      }
      .ds-card-btn:hover {
        background: var(--ds-accent-bg);
        color: var(--ds-accent);
      }
      .ds-card-btn.ds-copied {
        color: rgb(0, 186, 124);
        background: rgba(0, 186, 124, 0.1);
      }
      .ds-card-body {
        font-size: 15px;
        line-height: 22px;
        color: var(--ds-text-primary);
        white-space: pre-wrap;
        word-wrap: break-word;
      }
      .ds-card-body.ds-error-text {
        color: rgb(244, 33, 46);
      }
      .ds-cursor {
        display: inline-block;
        width: 2px;
        height: 14px;
        background: var(--ds-accent);
        margin-left: 2px;
        vertical-align: -1px;
        animation: ds-blink 0.75s infinite;
      }
      @keyframes ds-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }
      .ds-cursor.done { display: none !important; }

      .ds-popup {
        position: fixed;
        z-index: 2147483000;
        width: 370px;
        max-width: calc(100vw - 24px);
        background: var(--ds-popup-bg);
        color: var(--ds-popup-fg);
        border: 1px solid var(--ds-popup-border);
        border-radius: 16px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        font-size: 14px;
        line-height: 21px;
        font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
        overflow: hidden;
      }
      .ds-popup-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px 8px 16px;
        border-bottom: 1px solid var(--ds-card-border);
      }
      .ds-popup-title {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 13px;
        font-weight: 700;
        color: var(--ds-accent);
      }
      .ds-popup-head-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .ds-popup-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 9999px;
        cursor: pointer;
        color: var(--ds-text-muted);
        transition: background-color .15s ease, color .15s ease;
      }
      .ds-popup-close:hover {
        background-color: var(--ds-accent-bg);
        color: var(--ds-accent);
      }
      .ds-popup-body {
        padding: 12px 16px 16px;
        max-height: 55vh;
        overflow-y: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
      }
      .ds-popup-body::-webkit-scrollbar { width: 5px; }
      .ds-popup-body::-webkit-scrollbar-thumb {
        background: rgba(113, 118, 123, 0.25);
        border-radius: 9999px;
      }
      .ds-popup-body::-webkit-scrollbar-thumb:hover {
        background: rgba(113, 118, 123, 0.45);
      }
      .ds-popup-loading {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--ds-text-muted);
        padding: 8px 0;
      }
      .ds-error { color: rgb(244, 33, 46); }
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
    title.innerHTML = `${UI_ICONS.sparkle} <span>${LABELS.explain.caption}</span>`;

    const actions = document.createElement("div");
    actions.className = "ds-popup-head-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "ds-card-btn ds-copy-btn";
    copyBtn.innerHTML = `${UI_ICONS.copy}<span>复制</span>`;
    copyBtn.title = "复制解读";
    copyBtn.addEventListener("click", () => {
      if (!body) return;
      navigator.clipboard.writeText(body.textContent).then(() => {
        copyBtn.className = "ds-card-btn ds-copied";
        copyBtn.innerHTML = `${UI_ICONS.check}<span>已复制</span>`;
        setTimeout(() => {
          if (copyBtn.isConnected) {
            copyBtn.className = "ds-card-btn ds-copy-btn";
            copyBtn.innerHTML = `${UI_ICONS.copy}<span>复制</span>`;
          }
        }, 1800);
      });
    });

    const close = document.createElement("div");
    close.className = "ds-popup-close";
    close.setAttribute("role", "button");
    close.setAttribute("aria-label", "关闭");
    close.innerHTML = UI_ICONS.close;
    close.addEventListener("click", closePopup);

    actions.appendChild(copyBtn);
    actions.appendChild(close);
    head.appendChild(title);
    head.appendChild(actions);

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
    label.textContent = "DeepSeek 正在深入分析推文…";
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

    const card = document.createElement("div");
    card.className = `ds-trans-card ${isError ? "ds-error" : ""}`;
    card.setAttribute("data-deepseek-result", "1");
    card.addEventListener("click", (e) => e.stopPropagation());

    const header = document.createElement("div");
    header.className = `ds-card-header ${isError ? "ds-error-head" : ""}`;

    const meta = document.createElement("div");
    meta.className = "ds-card-meta";

    const badge = document.createElement("span");
    badge.className = "ds-brand-badge";
    badge.innerHTML = `${UI_ICONS.sparkle} <span>${isError ? "DeepSeek " + LABELS.translate.fail : "DeepSeek 翻译"}</span>`;
    meta.appendChild(badge);

    if (!isError) {
      const langTag = document.createElement("span");
      langTag.className = "ds-lang-tag";
      langTag.textContent = `· ${settings.targetLang || "简体中文"}`;
      meta.appendChild(langTag);
    }
    header.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "ds-card-actions";

    if (!isError) {
      const copyBtn = document.createElement("button");
      copyBtn.className = "ds-card-btn ds-copy-btn";
      copyBtn.innerHTML = `${UI_ICONS.copy}<span>复制</span>`;
      copyBtn.title = "复制译文";
      copyBtn.addEventListener("click", () => {
        const textToCopy = bodyContent.textContent;
        navigator.clipboard.writeText(textToCopy).then(() => {
          copyBtn.className = "ds-card-btn ds-copied";
          copyBtn.innerHTML = `${UI_ICONS.check}<span>已复制</span>`;
          setTimeout(() => {
            if (copyBtn.isConnected) {
              copyBtn.className = "ds-card-btn ds-copy-btn";
              copyBtn.innerHTML = `${UI_ICONS.copy}<span>复制</span>`;
            }
          }, 1800);
        });
      });
      actions.appendChild(copyBtn);
    }

    const closeBtn = document.createElement("button");
    closeBtn.className = "ds-card-btn";
    closeBtn.innerHTML = UI_ICONS.close;
    closeBtn.title = "收起译文";
    closeBtn.addEventListener("click", () => {
      card.style.display = "none";
      const btn = findButton(article, "translate");
      if (btn?.isConnected) btn.dataset.active = "0";
    });
    actions.appendChild(closeBtn);
    header.appendChild(actions);

    const body = document.createElement("div");
    body.className = `ds-card-body ${isError ? "ds-error-text" : ""}`;

    const bodyContent = document.createElement("span");
    bodyContent.className = "ds-content-text";
    bodyContent.textContent = text;
    body.appendChild(bodyContent);

    const cursor = document.createElement("span");
    cursor.className = `ds-cursor ${text && !isError ? "done" : ""}`;
    body.appendChild(cursor);

    card.appendChild(header);
    card.appendChild(body);

    tweetTextEl.insertAdjacentElement("afterend", card);
    st.block = card;
    return card;
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
      const textEl = block?.querySelector(".ds-content-text");
      const cursor = block?.querySelector(".ds-cursor");
      if (textEl) {
        textEl.textContent = "DeepSeek 正在翻译推文…";
        textEl.style.opacity = "0.6";
      }

      st.cancel = streamDeepSeek(payload, {
        onChunk(delta) {
          if (isFirstChunk) {
            isFirstChunk = false;
            setBusy(btn, false);
            if (btn?.isConnected) btn.dataset.active = "1";
            if (textEl) {
              textEl.textContent = "";
              textEl.style.opacity = "1";
            }
          }
          if (textEl) {
            textEl.textContent += delta;
          }
        },
        onDone(fullContent) {
          setBusy(btn, false);
          if (btn?.isConnected) btn.dataset.active = "1";
          st.cache.translate = fullContent;
          st.cancel = null;
          if (cursor) cursor.classList.add("done");
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
    btn.dataset.tooltip = LABELS[mode].idle;
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
    btn.setAttribute("aria-label", LABELS[mode].idle);
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
