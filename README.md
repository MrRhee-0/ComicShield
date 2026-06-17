<p align="center">
  <img src="assets/icons/icon128.png" alt="ComicShield icon" width="128" height="128">
</p>
# ComicShield

ComicShield is a Chrome extension for cleaner comix.to reading that neutralizes intrusive click traps, deceptive ad overlays, and reader-disrupting surfaces while preserving normal comic reading controls.

ComicShield is scoped to comix.to only. It is not a universal ad blocker, not antivirus software, and not a guarantee that every future site change is covered.

## Features

- Blocks invisible empty-space click traps observed on comix.to.
- Hides intrusive ad-like overlays and floating surfaces.
- Neutralizes suspicious popup and click surfaces without opening them.
- Preserves comic panels, normal scrolling, reader controls, and chapter navigation.
- Supports browse-page filter protection for advanced filters.
- Includes a floating reader controller.
- Includes extension-owned autoscroll based on requestAnimationFrame.
- Includes reader zoom controls.
- Uses host permissions limited to comix.to and its subdomains.

## Install From Release ZIP

1. Download `ComicShield-v0.2.0.zip` from the GitHub release.
2. Extract the ZIP to a local folder.
3. Open `chrome://extensions` in Chrome.
4. Enable Developer Mode.
5. Select Load unpacked.
6. Choose the extracted ComicShield folder.

## Manual Install From Source

1. Clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable Developer Mode.
4. Select Load unpacked.
5. Choose the repository root folder containing `manifest.json`.

## Permissions

ComicShield requests only:

- `storage`: saves extension settings locally through `chrome.storage.local`.
- `https://comix.to/*` and `https://*.comix.to/*`: runs the content script only on comix.to pages and relevant subdomains.

No background service worker is used. No remote code is loaded.

## Privacy

ComicShield does not use remote servers, analytics, telemetry, or tracking. It does not collect accounts or browsing history. Settings are stored locally in Chrome through `chrome.storage.local`. See `PRIVACY.md` for details.

## Safety And Limitations

ComicShield is defensive page cleanup for observed comix.to reader and browse-page surfaces. It does not provide universal ad blocking, antivirus protection, malware removal, or guaranteed protection against every future site change. Keep Chrome and your security software active.

Known frontiers:

- comix.to DOM changes may require selector or relation updates.
- Other webcomic sites require new adapters and are not covered by this release.
- Ambiguous surfaces are intentionally preserved unless they match a defensive relation.

## Development Notes

The extension is a plain Chrome Manifest V3 project with no build step.

Key files:

- `manifest.json`: Chrome extension manifest.
- `content.js`: bootstraps ComicShield.
- `core/settings.js`: local settings storage.
- `core/domShield.js`: ad, overlay, and click-trap protection.
- `core/readerController.js`: floating reader controller, autoscroll, and reader zoom.
- `adapters/comix.js`: comix.to-specific surface relations.

Before opening a pull request, run:

```powershell
node --check content.js
node --check popup.js
node --check core/settings.js
node --check core/domShield.js
node --check core/readerController.js
node --check adapters/comix.js
```

## Release Verification

`release/SHA256SUMS.txt` contains SHA256 hashes for the release ZIP and key icon files. To verify on Windows PowerShell:

```powershell
Get-FileHash .\release\ComicShield-v0.2.0.zip -Algorithm SHA256
```

Compare the hash with the matching line in `release/SHA256SUMS.txt`.

## License

MIT License. See `LICENSE`.

