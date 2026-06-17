(function () {
  "use strict";

  async function bootComicShield() {
    const settings = await globalThis.ComicShieldSettings.readSettings();
    const shield = new globalThis.ComicShieldDomShield({
      adapter: globalThis.ComicShieldComixAdapter,
      settings
    });

    shield.start();

    let readerController = null;
    if (globalThis.ComicShieldReaderController) {
      readerController = new globalThis.ComicShieldReaderController({
        adapter: globalThis.ComicShieldComixAdapter,
        settings,
        settingsApi: globalThis.ComicShieldSettings
      });
      readerController.start();
    }

    globalThis.ComicShieldSettings.onChanged((nextSettings) => {
      shield.updateSettings(nextSettings);
      if (readerController) {
        readerController.updateSettings(nextSettings);
      }
    });

    globalThis.__comicShield = shield;
    globalThis.__comicShieldReaderController = readerController;
  }

  bootComicShield().catch((error) => {
    if (globalThis.ComicShieldSettings && globalThis.ComicShieldSettings.DEFAULT_SETTINGS.debug) {
      console.warn("[ComicShield] startup failed", error);
    }
  });
})();
