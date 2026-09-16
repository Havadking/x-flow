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
  const s = await chrome.storage.local.get(["enabled", "apiKey"]);
  els.enabled.checked = s.enabled !== false;

  if (s.apiKey) {
    els.dotApi.className = "status-dot ok";
    els.textApi.textContent = "DeepSeek API 已就绪";
  } else {
    els.dotApi.className = "status-dot warn";
    els.textApi.textContent = "未配置 DeepSeek Key";
  }

  chrome.runtime.sendMessage({ type: "GET_OBSIDIAN_STATUS" }, (resp) => {
    if (resp?.configured) {
      els.dotObs.className = "status-dot ok";
      els.textObs.textContent = `Obsidian: ${resp.vaultName || "已连接"}`;
    } else {
      els.dotObs.className = "status-dot warn";
      els.textObs.textContent = "未配置 Obsidian Vault";
    }
  });
}

els.enabled.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: els.enabled.checked });
});

els.openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

load();
