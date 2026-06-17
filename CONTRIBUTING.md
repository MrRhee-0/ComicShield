# Contributing

Thank you for helping improve ComicShield.

## Issue Reports

When reporting a bug, include:

- ComicShield version.
- Chrome version.
- The URL path, such as `/browse` or a reader path, if safe to share.
- What broke and what you expected instead.
- A screenshot if it is safe and does not expose private information.

## Pull Requests

Please keep changes scoped and defensive:

- Avoid rules that break comic panels, scrolling, reader controls, chapter navigation, browse filters, or the ComicShield controller.
- Do not add code that scrapes or downloads copyrighted comic content.
- Do not bypass login, payment, or access-control systems.
- Do not add remote scripts, analytics, telemetry, or broad host permissions.
- Do not weaken existing click-trap, popup-surface, or intrusive-overlay protections.
- Prefer site-specific adapter relations over broad page-wide rules.

Run syntax checks before submitting:

```powershell
node --check content.js
node --check popup.js
node --check core/settings.js
node --check core/domShield.js
node --check core/readerController.js
node --check adapters/comix.js
```
