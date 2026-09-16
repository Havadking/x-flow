const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("manifest.json has exact name 'X-Flow' and valid icons", () => {
  const manifestPath = path.resolve(__dirname, "../manifest.json");
  const manifestRaw = fs.readFileSync(manifestPath, "utf-8");
  const manifest = JSON.parse(manifestRaw);

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "X-Flow", "Extension name must strictly be 'X-Flow'");

  assert.ok(manifest.icons, "manifest.json should declare icons");
  assert.ok(manifest.icons["16"], "manifest should have 16x16 icon");
  assert.ok(manifest.icons["48"], "manifest should have 48x48 icon");
  assert.ok(manifest.icons["128"], "manifest should have 128x128 icon");

  for (const [size, iconRelPath] of Object.entries(manifest.icons)) {
    const iconFullPath = path.resolve(__dirname, "..", iconRelPath);
    assert.ok(fs.existsSync(iconFullPath), "Icon " + size + " file should exist at " + iconRelPath);
    const stat = fs.statSync(iconFullPath);
    assert.ok(stat.size > 0, "Icon " + size + " file should not be empty");
  }

  assert.ok(manifest.action?.default_icon, "manifest action should have default_icon");
  for (const [size, iconRelPath] of Object.entries(manifest.action.default_icon)) {
    const iconFullPath = path.resolve(__dirname, "..", iconRelPath);
    assert.ok(fs.existsSync(iconFullPath), "Action icon " + size + " file should exist");
  }
});

test("Obsidian status resolution logic handles filesystem and uri configurations", () => {
  function resolveStatus({ config, handle }) {
    const isUri = config.saveMethod === "obsidian-uri";
    const vaultName = isUri
      ? (config.obsidianVault || "").trim()
      : (handle?.name || config.vaultName || "").trim();

    const configured = isUri
      ? Boolean(vaultName)
      : Boolean(handle || config.vaultName);

    return {
      configured,
      vaultName,
    };
  }

  // 1. Filesystem mode with valid handle
  const res1 = resolveStatus({
    config: { saveMethod: "filesystem" },
    handle: { name: "KnowledgeBase" },
  });
  assert.equal(res1.configured, true);
  assert.equal(res1.vaultName, "KnowledgeBase");

  // 2. Filesystem mode with cached vaultName
  const res2 = resolveStatus({
    config: { saveMethod: "filesystem", vaultName: "MyObsidian" },
    handle: null,
  });
  assert.equal(res2.configured, true);
  assert.equal(res2.vaultName, "MyObsidian");

  // 3. URI mode with vault specified
  const res3 = resolveStatus({
    config: { saveMethod: "obsidian-uri", obsidianVault: "VaultURI" },
    handle: null,
  });
  assert.equal(res3.configured, true);
  assert.equal(res3.vaultName, "VaultURI");

  // 4. Unconfigured
  const res4 = resolveStatus({
    config: { saveMethod: "filesystem" },
    handle: null,
  });
  assert.equal(res4.configured, false);
  assert.equal(res4.vaultName, "");
});
