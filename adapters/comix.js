(function () {
  "use strict";

  const READER_SURFACE_SELECTORS = [
    ".rpage",
    ".rpage-main",
    ".rpage-main__inner",
    ".rpage-page",
    ".rpage-page__img"
  ];

  const READER_CONTROL_SELECTORS = [
    "[data-comicshield-controller]",
    ".rpage-progress",
    ".rpage-progress__seg",
    ".rpage-floatctl",
    ".rpage-cmpanel",
    ".rpage-cmpanel__chapnav",
    ".rpage-cmpanel__follow",
    "[aria-label='Reader controls']",
    "[aria-label='Page progress']"
  ];

  const CHAPTER_NAV_SELECTORS = [
    ".mchap-row__primary",
    ".mchap-row a[href]",
    ".mpage__read",
    ".mpage__chapters a[href]",
    "a[href*='-chapter-']",
    "a[href*='/chapter-']"
  ];

  const NATIVE_SITE_SELECTORS = [
    "[data-comicshield-controller]",
    "#app-root",
    ".topnav",
    ".layout",
    ".layout--top",
    ".layout--single",
    ".main-col",
    ".side-col",
    ".section",
    ".card",
    ".grid-updates",
    ".mpage",
    ".mpage__hero",
    ".mpage__chapters",
    ".mchap-list",
    ".mchap-item",
    ".mchap-row",
    ".footer",
    ".announce",
    ".panel",
    ".cm-widget",
    ".comments"
  ];

  const SAFE_EXTERNAL_FRONTIER_SELECTORS = [
    ".mpage__chip--tracker",
    ".text-primary",
    ".footer a[href^='https://discord.gg/']",
    ".pwa-banner--discord"
  ];

  const KNOWN_CLICK_TRAP_SELECTORS = [
    "body > a[href='#'][target='_blank']",
    "body.rpage-body > a[href='#'][target='_blank']",
    "body > a[target='_blank']:empty"
  ];

  const BROWSE_FILTER_ATTR = "data-comicshield-browse-filter-admitted";
  const BROWSE_FILTER_LABELS = [
    "genres",
    "release status",
    "demographic",
    "types",
    "content rating",
    "sort by"
  ];

  const BROWSE_FILTER_PANEL_SELECTORS = [
    "form[action*='/browse']",
    "form",
    "[class*='advanced' i]",
    "[class*='filter' i]",
    "[class*='search' i]",
    "[class*='browse' i]",
    ".panel",
    ".section"
  ];

  const BROWSE_FILTER_CONTROL_SELECTORS = [
    "select",
    "option",
    "input",
    "button",
    "label",
    "textarea",
    "a[href]",
    "[role='button']",
    "[role='option']",
    "[role='listbox']",
    "[role='combobox']",
    "[role='menuitem']",
    "[aria-haspopup]",
    "[aria-expanded]",
    "[tabindex]",
    "[data-value]",
    "[data-key]",
    "[data-id]",
    "[data-name]",
    "[class*='select' i]",
    "[class*='dropdown' i]",
    "[class*='option' i]",
    "[class*='menu' i]",
    "[class*='filter' i]",
    "[class*='genre' i]",
    "[class*='status' i]",
    "[class*='demographic' i]",
    "[class*='type' i]",
    "[class*='rating' i]",
    "[class*='sort' i]"
  ];

  const STRICT_AD_TEXT_RE = /\b(advertisement|sponsored|ad banner|ads?|promoted|popup|popunder)\b/i;
  const USER_SUSPICIOUS_TEXT_RE = /\b(advertisement|sponsored|download|play|continue|open|claim|watch|install|read more|recommended)\b/i;
  const AD_CLASS_RE = /(^|[-_\s])(ad|ads|advert|advertisement|sponsor|sponsored|banner|popup|popunder|float|sticky)([-_\s]|$)/i;
  const POPUP_CODE_RE = /window\.open|location\.href|location\.assign|location\.replace|popunder|popup/i;
  const AD_HOST_RE = /(^|\.)((doubleclick|googlesyndication|adservice|adnxs|taboola|outbrain|mgid|popads|propellerads|adsterra|exoclick|trafficjunky|onclickads|hilltopads|adform|adskeeper|revcontent)\.)/i;
  const JAVASCRIPT_URL_RE = /^\s*javascript:/i;

  function safeMatches(element, selector) {
    try {
      return Boolean(element && element.matches && element.matches(selector));
    } catch (error) {
      return false;
    }
  }

  function closest(element, selectors) {
    if (!element || !element.closest) {
      return null;
    }
    for (const selector of selectors) {
      try {
        const match = element.closest(selector);
        if (match) {
          return match;
        }
      } catch (error) {
        continue;
      }
    }
    return null;
  }

  function hostOf(url) {
    try {
      return new URL(url, location.href).hostname;
    } catch (error) {
      return "";
    }
  }

  function isSameSiteUrl(url) {
    const host = hostOf(url);
    const base = location.hostname.replace(/^www\./, "");
    return host === location.hostname || host === base || host.endsWith("." + base);
  }

  function textOf(element) {
    return ((element && (element.innerText || element.textContent)) || "").replace(/\s+/g, " ").trim();
  }

  function relationText(element) {
    if (!element) {
      return "";
    }
    const attrs = ["id", "class", "aria-label", "title", "alt", "href", "src"]
      .map((name) => element.getAttribute && element.getAttribute(name))
      .filter(Boolean)
      .join(" ");
    return `${textOf(element)} ${attrs}`;
  }

  function hasPopupCode(element) {
    if (!element || !element.attributes) {
      return false;
    }
    return Array.from(element.attributes).some((attr) => {
      return /^on/i.test(attr.name) && POPUP_CODE_RE.test(attr.value || "");
    });
  }

  function isBrowsePage() {
    return location.pathname.replace(/\/+$/, "") === "/browse";
  }

  function countBrowseFilterLabels(element) {
    const value = textOf(element).toLowerCase();
    return BROWSE_FILTER_LABELS.reduce((count, label) => {
      return count + (value.includes(label) ? 1 : 0);
    }, 0);
  }

  function hasBrowseFilterLabel(element) {
    const value = relationText(element).toLowerCase();
    return BROWSE_FILTER_LABELS.some((label) => value.includes(label));
  }

  function findBrowseFilterPanel() {
    if (!isBrowsePage() || !document.body) {
      return null;
    }

    const candidates = [];
    for (const selector of BROWSE_FILTER_PANEL_SELECTORS) {
      try {
        for (const element of document.querySelectorAll(selector)) {
          const labelCount = countBrowseFilterLabels(element);
          if (labelCount >= 2) {
            const rect = element.getBoundingClientRect();
            const area = Math.max(1, rect.width * rect.height);
            candidates.push({
              element,
              labelCount,
              area,
              textLength: textOf(element).length
            });
          }
        }
      } catch (error) {
        continue;
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((left, right) => {
      if (right.labelCount !== left.labelCount) {
        return right.labelCount - left.labelCount;
      }
      if (left.area !== right.area) {
        return left.area - right.area;
      }
      return left.textLength - right.textLength;
    });

    return candidates[0].element;
  }

  function findBrowseFilterPanelFor(element) {
    if (!isBrowsePage() || !element || element.nodeType !== 1) {
      return null;
    }

    let current = element;
    while (current && current.nodeType === 1 && current !== document.body) {
      if (countBrowseFilterLabels(current) >= 2) {
        return current;
      }
      current = current.parentElement;
    }

    const panel = findBrowseFilterPanel();
    if (panel && panel.contains(element)) {
      return panel;
    }
    return null;
  }

  function hasUnsafeBrowseAnchor(element) {
    const anchor = element && element.closest && element.closest("a[href]");
    if (!anchor) {
      return false;
    }

    const href = anchor.getAttribute("href") || "";
    if (JAVASCRIPT_URL_RE.test(href)) {
      return true;
    }

    if ((anchor.getAttribute("target") || "").toLowerCase() === "_blank") {
      return true;
    }

    if (anchor.href && !isSameSiteUrl(anchor.href)) {
      return true;
    }

    return false;
  }

  function isBrowseFilterControl(element) {
    if (!isBrowsePage() || !element || element.nodeType !== 1) {
      return false;
    }

    if (element.closest && element.closest(`[${BROWSE_FILTER_ATTR}='true']`)) {
      return true;
    }

    if (hasUnsafeBrowseAnchor(element)) {
      return false;
    }

    const panel = findBrowseFilterPanelFor(element);
    const control = closest(element, BROWSE_FILTER_CONTROL_SELECTORS);

    if (panel && control && panel.contains(control)) {
      return true;
    }

    if (panel && hasBrowseFilterLabel(element)) {
      return true;
    }

    const floatingMenu = control && closest(control, [
      "[role='listbox']",
      "[role='menu']",
      "[class*='dropdown' i]",
      "[class*='select' i]",
      "[class*='option' i]",
      "[class*='menu' i]"
    ]);
    if (floatingMenu && findBrowseFilterPanel()) {
      return true;
    }

    return false;
  }

  function markBrowseFilterAdmitted(element) {
    if (!isBrowseFilterControl(element)) {
      return null;
    }

    const control = closest(element, BROWSE_FILTER_CONTROL_SELECTORS) || element;
    if (control && control.setAttribute) {
      control.setAttribute(BROWSE_FILTER_ATTR, "true");
    }
    return control;
  }

  function isKnownClickTrap(element, metrics) {
    if (!element || element.nodeType !== 1) {
      return false;
    }

    const selectorMatch = KNOWN_CLICK_TRAP_SELECTORS.some((selector) => safeMatches(element, selector));
    if (!selectorMatch) {
      return false;
    }

    const text = textOf(element);
    const href = element.getAttribute("href") || "";
    const target = element.getAttribute("target") || "";
    return text.length === 0 &&
      target === "_blank" &&
      href === "#" &&
      metrics &&
      metrics.position === "fixed" &&
      metrics.areaRatio >= 0.7;
  }

  function isReaderSurface(element) {
    return Boolean(closest(element, READER_SURFACE_SELECTORS));
  }

  function isComicShieldController(element) {
    return Boolean(closest(element, ["[data-comicshield-controller]"]));
  }

  function isReaderControl(element) {
    return Boolean(closest(element, READER_CONTROL_SELECTORS));
  }

  function isReaderPanel(element) {
    return Boolean(closest(element, [".rpage-page", ".rpage-page__img"]));
  }

  function isChapterNavigation(element) {
    const match = closest(element, CHAPTER_NAV_SELECTORS);
    if (!match) {
      return false;
    }
    if (match.href) {
      return isSameSiteUrl(match.href);
    }
    return true;
  }

  function isNativeSiteSurface(element) {
    return Boolean(closest(element, NATIVE_SITE_SELECTORS));
  }

  function isSafeExternalFrontier(element) {
    return Boolean(closest(element, SAFE_EXTERNAL_FRONTIER_SELECTORS));
  }

  function isAdHost(url) {
    return AD_HOST_RE.test(hostOf(url));
  }

  function hasStrictAdRelation(element) {
    const value = relationText(element);
    return STRICT_AD_TEXT_RE.test(value) || AD_CLASS_RE.test(value);
  }

  function hasSuspiciousUserLabel(element) {
    return USER_SUSPICIOUS_TEXT_RE.test(relationText(element));
  }

  function getPageKind() {
    if (document.body && document.body.classList.contains("rpage-body")) {
      return "reader";
    }
    if (isBrowsePage()) {
      return "browse";
    }
    if (document.querySelector(".mpage__chapters")) {
      return "detail";
    }
    return "site";
  }

  globalThis.ComicShieldComixAdapter = {
    id: "comix",
    pageKind: getPageKind,
    selectors: {
      readerSurface: READER_SURFACE_SELECTORS,
      readerControl: READER_CONTROL_SELECTORS,
      chapterNavigation: CHAPTER_NAV_SELECTORS,
      nativeSite: NATIVE_SITE_SELECTORS,
      knownClickTrap: KNOWN_CLICK_TRAP_SELECTORS,
      browseFilterControl: BROWSE_FILTER_CONTROL_SELECTORS
    },
    patterns: {
      strictAdText: STRICT_AD_TEXT_RE,
      suspiciousUserText: USER_SUSPICIOUS_TEXT_RE,
      adClass: AD_CLASS_RE,
      popupCode: POPUP_CODE_RE
    },
    safeMatches,
    closest,
    hostOf,
    isSameSiteUrl,
    textOf,
    relationText,
    hasPopupCode,
    isBrowsePage,
    findBrowseFilterPanel,
    isBrowseFilterControl,
    markBrowseFilterAdmitted,
    isKnownClickTrap,
    isReaderSurface,
    isComicShieldController,
    isReaderControl,
    isReaderPanel,
    isChapterNavigation,
    isNativeSiteSurface,
    isSafeExternalFrontier,
    isAdHost,
    hasStrictAdRelation,
    hasSuspiciousUserLabel
  };
})();
