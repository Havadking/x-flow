// X-Flow Popup Controller

const els = {
  enabled: document.getElementById("enabled"),
  dotApi: document.getElementById("dotApi"),
  textApi: document.getElementById("textApi"),
  dotObs: document.getElementById("dotObs"),
  textObs: document.getElementById("textObs"),
  openOptions: document.getElementById("openOptions"),
};

async function load() {
  const s = await chrome.storage.local.get(["enabled", "apiKey", "obsidianConfig"]);
  els.enabled.checked = s.enabled !== false;

  if (s.apiKey) {
    els.dotApi.className = "status-dot ok";
    els.textApi.textContent = "DeepSeek API 已就绪";
  } else {
    els.dotApi.className = "status-dot warn";
    els.textApi.textContent = "未配置 DeepSeek Key";
  }

  // Fast check from local storage
  const obsConfig = s.obsidianConfig || {};
  const isUri = obsConfig.saveMethod === "obsidian-uri";
  const knownName = isUri
    ? (obsConfig.obsidianVault || "").trim()
    : (obsConfig.vaultName || "").trim();

  if (knownName) {
    els.dotObs.className = "status-dot ok";
    els.textObs.textContent = `Obsidian: ${knownName}`;
  }

  // Query background service worker for live status
  try {
    chrome.runtime.sendMessage({ type: "GET_OBSIDIAN_STATUS" }, (resp) => {
      if (chrome.runtime.lastError) {
        if (!knownName) {
          els.dotObs.className = "status-dot warn";
          els.textObs.textContent = "未配置 Obsidian Vault";
        }
        return;
      }

      const isConfigured = Boolean(
        resp?.configured ||
        resp?.vaultName ||
        (resp?.config?.saveMethod === "obsidian-uri" && resp?.config?.obsidianVault) ||
        resp?.config?.vaultName
      );

      if (isConfigured) {
        els.dotObs.className = "status-dot ok";
        const name =
          resp?.vaultName ||
          resp?.config?.obsidianVault ||
          resp?.config?.vaultName ||
          knownName ||
          "已连接";
        els.textObs.textContent = `Obsidian: ${name}`;
      } else {
        els.dotObs.className = "status-dot warn";
        els.textObs.textContent = "未配置 Obsidian Vault";
      }
    });
  } catch (_) {
    if (!knownName) {
      els.dotObs.className = "status-dot warn";
      els.textObs.textContent = "未配置 Obsidian Vault";
    }
  }
}

els.enabled.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: els.enabled.checked });
});

els.openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

load();
