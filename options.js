// X-Flow Unified Options Controller

(function () {
  const PRESET_LANGS = ["简体中文", "繁體中文", "English", "日本語", "한국어"];
  const RETIRED_MODELS = new Set(["deepseek-chat", "deepseek-reasoner"]);

  const core = globalThis.XFlow?.core || {
    STORAGE_KEYS: { obsidianConfig: "obsidianConfig" },
    DEFAULT_CONFIG: {
      saveMethod: "filesystem",
      obsidianVault: "",
      relativePathTemplate: "Clippings/X/{{yyyy}}/{{mm}}",
      attachmentPathTemplate: "Attachments/X/{{yyyy}}/{{mm}}/{{id}}",
      fileNameTemplate: "{{pathSafeTitle}}",
      noteTemplate: "",
      overwriteExisting: false,
      downloadImages: true,
    },
    TEMPLATE_TOKENS: [],
    mergeConfig: (c) => c,
  };

  const db = globalThis.XFlow?.db;

  const els = {
    // Header
    enabled: document.getElementById("enabled"),

    // Tabs
    tabBtns: document.querySelectorAll(".tab-btn"),
    tabContents: document.querySelectorAll(".tab-content"),

    // DeepSeek Tab
    apiKey: document.getElementById("apiKey"),
    testApiKey: document.getElementById("testApiKey"),
    testResult: document.getElementById("testResult"),
    targetLang: document.getElementById("targetLang"),
    targetLangCustom: document.getElementById("targetLangCustom"),
    translateModel: document.getElementById("translateModel"),
    explainModel: document.getElementById("explainModel"),

    // Obsidian Tab
    saveMethodFs: document.getElementById("saveMethodFs"),
    saveMethodUri: document.getElementById("saveMethodUri"),
    modeCardFs: document.getElementById("modeCardFs"),
    modeCardUri: document.getElementById("modeCardUri"),
    fsConfigCard: document.getElementById("fsConfigCard"),
    uriConfigCard: document.getElementById("uriConfigCard"),
    vaultName: document.getElementById("vaultName"),
    vaultPermission: document.getElementById("vaultPermission"),
    pickVaultBtn: document.getElementById("pickVaultBtn"),
    obsidianVault: document.getElementById("obsidianVault"),
    relativePathTemplate: document.getElementById("relativePathTemplate"),
    attachmentPathTemplate: document.getElementById("attachmentPathTemplate"),
    fileNameTemplate: document.getElementById("fileNameTemplate"),
    downloadImages: document.getElementById("downloadImages"),
    overwriteExisting: document.getElementById("overwriteExisting"),
    noteTemplate: document.getElementById("noteTemplate"),
    resetTemplateBtn: document.getElementById("resetTemplateBtn"),
    tokenCloud: document.getElementById("tokenCloud"),

    // Buttons Tab
    showTranslate: document.getElementById("showTranslate"),
    showExplain: document.getElementById("showExplain"),
    showClip: document.getElementById("showClip"),

    // Footer
    saveBtn: document.getElementById("saveBtn"),
    status: document.getElementById("status"),
  };

  function normalizeModel(value, fallback) {
    const v = (value || "").trim();
    return !v || RETIRED_MODELS.has(v) ? fallback : v;
  }

  function setStatus(text, kind = "") {
    els.status.textContent = text;
    els.status.className = kind;
    if (kind === "ok") {
      setTimeout(() => {
        if (els.status.textContent === text) {
          els.status.textContent = "";
          els.status.className = "";
        }
      }, 3500);
    }
  }

  // ------------------------------------------------------------- Tab Handling

  function initTabs() {
    els.tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabKey = btn.dataset.tab;
        els.tabBtns.forEach((b) => b.classList.toggle("active", b === btn));
        els.tabContents.forEach((content) => {
          content.classList.toggle("active", content.id === `tab-${tabKey}`);
        });
      });
    });
  }

  // ------------------------------------------------------------- Language UI

  function applyTargetLangToUI(value) {
    if (PRESET_LANGS.includes(value)) {
      els.targetLang.value = value;
      els.targetLangCustom.style.display = "none";
      els.targetLangCustom.value = "";
    } else {
      els.targetLang.value = "__custom__";
      els.targetLangCustom.style.display = "block";
      els.targetLangCustom.value = value || "";
    }
  }

  function currentTargetLang() {
    if (els.targetLang.value === "__custom__") {
      return els.targetLangCustom.value.trim() || "简体中文";
    }
    return els.targetLang.value;
  }

  // -------------------------------------------------------- Obsidian UI Sync

  function syncSaveMethodUI() {
    const isFs = els.saveMethodFs.checked;
    els.modeCardFs.classList.toggle("selected", isFs);
    els.modeCardUri.classList.toggle("selected", !isFs);
    els.fsConfigCard.classList.toggle("is-hidden", !isFs);
    els.uriConfigCard.classList.toggle("is-hidden", isFs);
  }

  async function refreshVaultStatus() {
    if (!db?.getVaultHandle) return;
    try {
      const handle = await db.getVaultHandle();
      els.vaultName.textContent = handle?.name || "未配置";

      if (!handle) {
        els.vaultPermission.textContent = "未授权";
        els.vaultPermission.className = "perm-badge warning";
        return;
      }

      const permission = await handle.queryPermission({ mode: "readwrite" });
      if (permission === "granted") {
        els.vaultPermission.textContent = "已授权";
        els.vaultPermission.className = "perm-badge granted";
      } else {
        els.vaultPermission.textContent = "待授权";
        els.vaultPermission.className = "perm-badge warning";
      }
    } catch (_) {
      els.vaultName.textContent = "获取失败";
      els.vaultPermission.textContent = "异常";
      els.vaultPermission.className = "perm-badge warning";
    }
  }

  async function handlePickVault() {
    if (typeof window.showDirectoryPicker !== "function") {
      alert(
        "当前浏览器未启用目录选择器 (File System Access API)。Brave 浏览器请访问 brave://flags/#file-system-access-api 启用并重启，或使用「Obsidian URI 模式」。"
      );
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      const permission = await handle.requestPermission({ mode: "readwrite" });

      if (permission !== "granted") {
        throw new Error("未能获取目录读写权限。");
      }

      await db.saveVaultHandle(handle);
      await refreshVaultStatus();
      setStatus(`已成功关联 Obsidian Vault：${handle.name}`, "ok");
    } catch (error) {
      if (error && error.name === "AbortError") return;
      alert(`选择目录失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function renderTokenList() {
    els.tokenCloud.innerHTML = "";
    core.TEMPLATE_TOKENS.forEach((token) => {
      const chip = document.createElement("span");
      chip.className = "token-chip";
      chip.textContent = token;
      chip.title = "点击插入到光标处";
      chip.addEventListener("click", () => {
        const textarea = els.noteTemplate;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        textarea.value = text.substring(0, start) + token + text.substring(end);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + token.length;
      });
      els.tokenCloud.appendChild(chip);
    });
  }

  // ------------------------------------------------------------- Load & Save

  async function loadSettings() {
    const obsidianKey = core.STORAGE_KEYS.obsidianConfig;
    const stored = await chrome.storage.local.get([
      "enabled",
      "apiKey",
      "targetLang",
      "translateModel",
      "explainModel",
      "showTranslate",
      "showExplain",
      "showClip",
      obsidianKey,
    ]);

    // Extension header
    els.enabled.checked = stored.enabled !== false;

    // DeepSeek
    els.apiKey.value = stored.apiKey || "";
    applyTargetLangToUI(stored.targetLang || "简体中文");
    els.translateModel.value = normalizeModel(stored.translateModel, "deepseek-flash");
    els.explainModel.value = normalizeModel(stored.explainModel, "deepseek-v4-pro");

    // Buttons
    els.showTranslate.checked = stored.showTranslate !== false;
    els.showExplain.checked = stored.showExplain !== false;
    els.showClip.checked = stored.showClip !== false;

    // Obsidian
    const obsConfig = core.mergeConfig(stored[obsidianKey]);
    if (obsConfig.saveMethod === "obsidian-uri") {
      els.saveMethodUri.checked = true;
    } else {
      els.saveMethodFs.checked = true;
    }
    syncSaveMethodUI();

    els.obsidianVault.value = obsConfig.obsidianVault || "";
    els.relativePathTemplate.value = obsConfig.relativePathTemplate || "Clippings/X/{{yyyy}}/{{mm}}";
    els.attachmentPathTemplate.value = obsConfig.attachmentPathTemplate || "Attachments/X/{{yyyy}}/{{mm}}/{{id}}";
    els.fileNameTemplate.value = obsConfig.fileNameTemplate || "{{pathSafeTitle}}";
    els.downloadImages.checked = obsConfig.downloadImages !== false;
    els.overwriteExisting.checked = Boolean(obsConfig.overwriteExisting);
    els.noteTemplate.value = obsConfig.noteTemplate || core.DEFAULT_CONFIG.noteTemplate;

    await refreshVaultStatus();
  }

  async function saveSettings() {
    const obsidianKey = core.STORAGE_KEYS.obsidianConfig;
    const saveMethod = els.saveMethodUri.checked ? "obsidian-uri" : "filesystem";

    const obsidianConfig = {
      saveMethod,
      obsidianVault: els.obsidianVault.value.trim(),
      relativePathTemplate: els.relativePathTemplate.value.trim() || "Clippings/X/{{yyyy}}/{{mm}}",
      attachmentPathTemplate: els.attachmentPathTemplate.value.trim() || "Attachments/X/{{yyyy}}/{{mm}}/{{id}}",
      fileNameTemplate: els.fileNameTemplate.value.trim() || "{{pathSafeTitle}}",
      downloadImages: els.downloadImages.checked,
      overwriteExisting: els.overwriteExisting.checked,
      noteTemplate: els.noteTemplate.value,
    };

    const generalSettings = {
      enabled: els.enabled.checked,
      apiKey: els.apiKey.value.trim(),
      targetLang: currentTargetLang(),
      translateModel: els.translateModel.value.trim() || "deepseek-flash",
      explainModel: els.explainModel.value.trim() || "deepseek-v4-pro",
      showTranslate: els.showTranslate.checked,
      showExplain: els.showExplain.checked,
      showClip: els.showClip.checked,
      [obsidianKey]: obsidianConfig,
    };

    await chrome.storage.local.set(generalSettings);
    setStatus("设置已成功保存！", "ok");
  }

  // ------------------------------------------------------------ Bind Events

  function bindEvents() {
    initTabs();
    renderTokenList();

    els.targetLang.addEventListener("change", () => {
      els.targetLangCustom.style.display =
        els.targetLang.value === "__custom__" ? "block" : "none";
    });

    els.saveMethodFs.addEventListener("change", syncSaveMethodUI);
    els.saveMethodUri.addEventListener("change", syncSaveMethodUI);
    els.pickVaultBtn.addEventListener("click", handlePickVault);

    els.resetTemplateBtn.addEventListener("click", () => {
      if (confirm("确定要恢复默认的 Markdown 剪藏模板吗？")) {
        els.noteTemplate.value = core.DEFAULT_CONFIG.noteTemplate;
      }
    });

    els.testApiKey.addEventListener("click", async () => {
      const key = els.apiKey.value.trim();
      if (!key) {
        els.testResult.textContent = "请先填写 API Key";
        els.testResult.style.color = "var(--danger)";
        return;
      }
      els.testResult.textContent = "正在测试连接 DeepSeek API…";
      els.testResult.style.color = "var(--text-muted)";
      await chrome.storage.local.set({ apiKey: key });

      const resp = await chrome.runtime.sendMessage({ type: "DEEPSEEK_TEST_KEY" });
      if (resp?.ok) {
        els.testResult.textContent = `连接成功（模型 ${resp.model}）！`;
        els.testResult.style.color = "var(--success)";
      } else {
        els.testResult.textContent = `连接失败：${resp?.error || "请检查密钥"}`;
        els.testResult.style.color = "var(--danger)";
      }
    });

    els.saveBtn.addEventListener("click", saveSettings);
  }

  loadSettings().then(bindEvents);
})();
