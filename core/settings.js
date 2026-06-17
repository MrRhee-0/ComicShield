(function () {
  "use strict";

  const STORAGE_KEY = "comicShieldSettings";

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    hideIntrusiveAds: true,
    disableClickTraps: true,
    hideStickyAds: true,
    protectReaderClicks: true,
    showReaderController: true,
    enableAutoscrollControls: true,
    enableReaderZoomControls: true,
    rememberAutoscrollSpeed: true,
    rememberReaderZoom: true,
    resumeAutoscroll: false,
    controllerCollapsed: false,
    autoscrollSpeed: 120,
    readerZoom: 1,
    autoscrollActive: false,
    debug: false
  });

  function numberInRange(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, number));
  }

  function normalizeSettings(value) {
    const raw = value && typeof value === "object" ? value : {};
    return {
      enabled: raw.enabled !== false,
      hideIntrusiveAds: raw.hideIntrusiveAds !== false,
      disableClickTraps: raw.disableClickTraps !== false,
      hideStickyAds: raw.hideStickyAds !== false,
      protectReaderClicks: raw.protectReaderClicks !== false,
      showReaderController: raw.showReaderController !== false,
      enableAutoscrollControls: raw.enableAutoscrollControls !== false,
      enableReaderZoomControls: raw.enableReaderZoomControls !== false,
      rememberAutoscrollSpeed: raw.rememberAutoscrollSpeed !== false,
      rememberReaderZoom: raw.rememberReaderZoom !== false,
      resumeAutoscroll: raw.resumeAutoscroll === true,
      controllerCollapsed: raw.controllerCollapsed === true,
      autoscrollSpeed: numberInRange(raw.autoscrollSpeed, DEFAULT_SETTINGS.autoscrollSpeed, 20, 600),
      readerZoom: numberInRange(raw.readerZoom, DEFAULT_SETTINGS.readerZoom, 0.65, 1.6),
      autoscrollActive: raw.autoscrollActive === true,
      debug: raw.debug === true
    };
  }

  function storageArea() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      return null;
    }
    return chrome.storage.local;
  }

  function readSettings() {
    const area = storageArea();
    if (!area) {
      return Promise.resolve(normalizeSettings());
    }

    return new Promise((resolve) => {
      area.get([STORAGE_KEY], (result) => {
        resolve(normalizeSettings(result && result[STORAGE_KEY]));
      });
    });
  }

  function writeSettings(nextSettings) {
    const area = storageArea();
    const normalized = normalizeSettings(nextSettings);
    if (!area) {
      return Promise.resolve(normalized);
    }

    return new Promise((resolve) => {
      area.set({ [STORAGE_KEY]: normalized }, () => resolve(normalized));
    });
  }

  function onChanged(callback) {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.onChanged) {
      return function noop() {};
    }

    const listener = (changes, areaName) => {
      if (areaName !== "local" || !changes[STORAGE_KEY]) {
        return;
      }
      callback(normalizeSettings(changes[STORAGE_KEY].newValue));
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  globalThis.ComicShieldSettings = {
    STORAGE_KEY,
    DEFAULT_SETTINGS,
    normalizeSettings,
    readSettings,
    writeSettings,
    onChanged
  };
})();
