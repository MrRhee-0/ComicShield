(function () {
  "use strict";

  const statusText = document.getElementById("statusText");
  const inputs = Array.from(document.querySelectorAll("[data-setting]"));
  let currentSettings = null;

  function render(settings) {
    currentSettings = settings;
    for (const input of inputs) {
      input.checked = Boolean(settings[input.dataset.setting]);
    }
    statusText.textContent = settings.enabled ? "Protection settings" : "Protection paused";
  }

  async function updateSetting(key, value) {
    const next = { ...currentSettings, [key]: value };
    const saved = await globalThis.ComicShieldSettings.writeSettings(next);
    render(saved);
  }

  async function boot() {
    render(await globalThis.ComicShieldSettings.readSettings());
    for (const input of inputs) {
      input.addEventListener("change", () => {
        updateSetting(input.dataset.setting, input.checked);
      });
    }
  }

  boot();
})();
