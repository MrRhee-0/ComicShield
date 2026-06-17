(function () {
  "use strict";

  const SHIELD_ATTR = "data-comicshield";
  const RELATION_ATTR = "data-comicshield-relation";
  const ACTION_ATTR = "data-comicshield-action";
  const FRONTIER_ATTR = "data-comicshield-frontier";
  const CONTROLLER_SELECTOR = "[data-comicshield-controller]";

  class ComicShieldDomShield {
    constructor(options) {
      this.adapter = options.adapter;
      this.settings = options.settings;
      this.observer = null;
      this.scanTimer = 0;
      this.processed = new WeakSet();
      this.frontier = new WeakSet();
      this.guardEvents = ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "input", "change", "keydown"];
      this.boundGuard = this.handleGuardEvent.bind(this);
      this.boundMutations = this.handleMutations.bind(this);
    }

    start() {
      this.installGuards();
      this.scanDocument();
      this.installObserver();
    }

    updateSettings(settings) {
      this.settings = settings;
      if (this.isEnabled()) {
        this.scanDocument();
      }
    }

    isEnabled() {
      return Boolean(this.settings && this.settings.enabled);
    }

    debug(message, details) {
      if (!this.settings || !this.settings.debug) {
        return;
      }
      console.warn("[ComicShield]", message, details || "");
    }

    installGuards() {
      for (const eventName of this.guardEvents) {
        document.addEventListener(eventName, this.boundGuard, true);
      }
    }

    installObserver() {
      if (this.observer || !document.documentElement) {
        return;
      }
      this.observer = new MutationObserver(this.boundMutations);
      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "href", "target", "src"]
      });
    }

    handleMutations(mutations) {
      if (!this.isEnabled()) {
        return;
      }

      const roots = [];
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.target && mutation.target.nodeType === 1) {
          roots.push(mutation.target);
        }
        for (const node of mutation.addedNodes || []) {
          if (node.nodeType === 1) {
            roots.push(node);
          }
        }
      }

      if (roots.length === 0) {
        return;
      }

      window.clearTimeout(this.scanTimer);
      this.scanTimer = window.setTimeout(() => {
        for (const root of roots.slice(0, 50)) {
          this.scanRoot(root);
        }
      }, 120);
    }

    scanDocument() {
      if (!this.isEnabled() || !document.body) {
        return;
      }
      this.scanRoot(document.body);
    }

    scanRoot(root) {
      if (!root || root.nodeType !== 1) {
        return;
      }

      const candidates = new Set();
      this.addIfElement(candidates, root);

      this.collect(candidates, root, [
        "body > a[href='#'][target='_blank']",
        "body.rpage-body > a[href='#'][target='_blank']",
        "body > a[target='_blank']:empty",
        "iframe",
        "a[href]",
        "[style]",
        "[onclick]",
        "[onmousedown]",
        "[onpointerdown]",
        "[class*='ad' i]",
        "[id*='ad' i]",
        "[class*='sponsor' i]",
        "[id*='sponsor' i]",
        "[class*='banner' i]",
        "[id*='banner' i]",
        "[class*='popup' i]",
        "[id*='popup' i]",
        "[class*='float' i]",
        "[id*='float' i]",
        "[class*='sticky' i]",
        "[id*='sticky' i]"
      ]);

      for (const element of candidates) {
        this.processElement(element);
      }
    }

    addIfElement(set, value) {
      if (value && value.nodeType === 1) {
        set.add(value);
      }
    }

    collect(set, root, selectors) {
      const selector = selectors.join(",");
      try {
        if (root.matches && root.matches(selector)) {
          set.add(root);
        }
        if (root.querySelectorAll) {
          for (const element of root.querySelectorAll(selector)) {
            set.add(element);
          }
        }
      } catch (error) {
        this.debug("selector collection failed", { error: String(error) });
      }
    }

    processElement(element) {
      if (!this.isEnabled() || !element || element.nodeType !== 1) {
        return;
      }

      const relation = this.classifyElement(element);
      if (!relation) {
        return;
      }

      if (relation.action === "frontier") {
        this.markFrontier(element, relation.reason);
        return;
      }

      if (this.processed.has(element)) {
        return;
      }
      this.processed.add(element);

      if (relation.action === "hide") {
        this.hideElement(element, relation.reason);
      } else if (relation.action === "pointer-disable") {
        this.pointerDisable(element, relation.reason);
      }
    }

    classifyElement(element) {
      const metrics = this.metrics(element);
      const adapter = this.adapter;

      if (adapter.isReaderSurface(element) ||
        adapter.isReaderControl(element) ||
        adapter.isChapterNavigation(element) ||
        this.isBrowseFilterControl(element)) {
        return null;
      }

      if (this.settings.disableClickTraps && adapter.isKnownClickTrap(element, metrics)) {
        return { action: "hide", reason: "known-full-viewport-click-trap" };
      }

      if (element.tagName === "IFRAME") {
        return this.classifyIframe(element, metrics);
      }

      if (element.tagName === "A" && element.href) {
        const anchorRelation = this.classifyAnchor(element, metrics);
        if (anchorRelation) {
          return anchorRelation;
        }
      }

      if (this.settings.disableClickTraps && this.isLargeTransparentClickSurface(element, metrics)) {
        return { action: "pointer-disable", reason: "large-transparent-click-surface" };
      }

      if (this.settings.hideStickyAds && this.isStickyFloatingAd(element, metrics)) {
        return { action: "hide", reason: "sticky-floating-ad-surface" };
      }

      if (this.settings.hideIntrusiveAds && this.isVisibleAdSurface(element, metrics)) {
        return { action: "hide", reason: "visible-intrusive-ad-surface" };
      }

      if (this.settings.disableClickTraps && adapter.hasPopupCode(element)) {
        return { action: "pointer-disable", reason: "inline-popup-handler" };
      }

      return null;
    }

    classifyIframe(element, metrics) {
      if (this.adapter.isReaderSurface(element) || this.adapter.isReaderControl(element)) {
        return null;
      }

      const src = element.getAttribute("src") || element.src || "";
      const hiddenTiny = metrics.area <= 4 || metrics.visibility === "hidden" || metrics.display === "none";
      if (hiddenTiny || this.adapter.isAdHost(src)) {
        return { action: "hide", reason: "iframe-outside-reader" };
      }

      if (this.settings.debug && !this.frontier.has(element)) {
        return { action: "frontier", reason: "unclassified-iframe-outside-reader" };
      }
      return null;
    }

    classifyAnchor(element, metrics) {
      const href = element.href;

      if (this.adapter.isSameSiteUrl(href)) {
        return null;
      }

      if (this.adapter.isSafeExternalFrontier(element)) {
        if (this.settings.debug && !this.frontier.has(element)) {
          return { action: "frontier", reason: "safe-external-metadata-link" };
        }
        return null;
      }

      const adHost = this.adapter.isAdHost(href);
      const suspiciousText = this.adapter.hasSuspiciousUserLabel(element);
      const structuralAd = this.adapter.hasStrictAdRelation(element);
      const emptyLargeBlank = metrics.areaRatio >= 0.1 && this.adapter.textOf(element).length === 0 && element.target === "_blank";

      if (adHost || structuralAd || emptyLargeBlank || (suspiciousText && (metrics.isPositioned || element.target === "_blank"))) {
        return { action: "pointer-disable", reason: "suspicious-external-link" };
      }

      if (this.settings.debug && !this.frontier.has(element)) {
        return { action: "frontier", reason: "external-link-not-classified-as-ad" };
      }

      return null;
    }

    isVisibleAdSurface(element, metrics) {
      if (this.adapter.isNativeSiteSurface(element)) {
        return false;
      }
      return this.adapter.hasStrictAdRelation(element) &&
        (metrics.areaRatio >= 0.02 || metrics.isPositioned || element.tagName === "IFRAME");
    }

    isStickyFloatingAd(element, metrics) {
      if (!metrics.isPositioned || this.adapter.isNativeSiteSurface(element)) {
        return false;
      }

      const relationAd = this.adapter.hasStrictAdRelation(element);
      const suspiciousLabel = this.adapter.hasSuspiciousUserLabel(element);
      const containsExternal = Boolean(element.querySelector && Array.from(element.querySelectorAll("a[href]")).some((anchor) => {
        return !this.adapter.isSameSiteUrl(anchor.href) && !this.adapter.isSafeExternalFrontier(anchor);
      }));
      const edgeBar = metrics.position === "fixed" &&
        metrics.areaRatio >= 0.08 &&
        (metrics.rect.top <= 8 || metrics.rect.left <= 8 || metrics.rect.bottom >= window.innerHeight - 8);

      return relationAd || containsExternal || (edgeBar && suspiciousLabel);
    }

    isLargeTransparentClickSurface(element, metrics) {
      if (this.adapter.isReaderSurface(element) ||
        this.adapter.isReaderControl(element) ||
        this.adapter.isNativeSiteSurface(element) ||
        this.isBrowseFilterControl(element)) {
        return false;
      }

      if (!metrics.isPositioned || metrics.areaRatio < 0.1) {
        return false;
      }

      const clickable = this.isInteractive(element) ||
        element.hasAttribute("onclick") ||
        element.hasAttribute("onmousedown") ||
        element.hasAttribute("onpointerdown");
      const empty = this.adapter.textOf(element).length === 0;
      const transparent = metrics.transparent || metrics.opacity <= 0.2;

      return clickable && empty && transparent;
    }

    metrics(element) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
      const area = Math.max(0, rect.width * rect.height);
      const zIndex = Number.parseInt(style.zIndex, 10);
      const bg = style.backgroundColor || "";
      const transparent = bg === "transparent" || /rgba\([^)]*,\s*0(?:\.0+)?\)/.test(bg);

      return {
        rect,
        area,
        areaRatio: area / viewportArea,
        position: style.position,
        isPositioned: ["fixed", "absolute", "sticky"].includes(style.position),
        zIndex: Number.isFinite(zIndex) ? zIndex : 0,
        opacity: Number.parseFloat(style.opacity || "1"),
        transparent,
        display: style.display,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents
      };
    }

    hideElement(element, reason) {
      this.mark(element, reason, "hide");
      element.style.setProperty("display", "none", "important");
      element.style.setProperty("pointer-events", "none", "important");
      this.debug("hidden surface", this.describe(element, reason));
    }

    pointerDisable(element, reason) {
      this.mark(element, reason, "pointer-disable");
      if (element.tagName === "A" && element.target === "_blank") {
        element.setAttribute("rel", "noopener noreferrer");
      }
      element.style.setProperty("pointer-events", "none", "important");
      this.debug("pointer-disabled surface", this.describe(element, reason));
    }

    mark(element, reason, action) {
      element.setAttribute(SHIELD_ATTR, "true");
      element.setAttribute(RELATION_ATTR, reason);
      element.setAttribute(ACTION_ATTR, action);
    }

    markFrontier(element, reason) {
      this.frontier.add(element);
      element.setAttribute(FRONTIER_ATTR, reason);
      this.debug("unresolved frontier surface", this.describe(element, reason));
    }

    describe(element, reason) {
      return {
        reason,
        tag: element.tagName.toLowerCase(),
        id: element.id || "",
        className: String(element.className || ""),
        text: this.adapter.textOf(element).slice(0, 120),
        href: element.href || "",
        src: element.src || ""
      };
    }

    handleGuardEvent(event) {
      if (!this.isEnabled() || !this.settings.protectReaderClicks) {
        return;
      }

      const target = event.target && event.target.nodeType === 1 ? event.target : null;
      if (!target) {
        return;
      }

      if (this.isComicShieldControllerEvent(event, target)) {
        return;
      }

      if (this.isBrowseFilterEvent(event, target)) {
        return;
      }

      const unsafe = this.findUnsafeEventSurface(target);
      if (unsafe) {
        this.blockEvent(event, unsafe.reason, unsafe.element);
        return;
      }

      if (this.isAllowedInteraction(target)) {
        return;
      }

      if (event.type === "click" && this.isEmptyClickSurface(target)) {
        this.blockEvent(event, "empty-space-click-trap-guard", target);
      }
    }

    isComicShieldControllerEvent(event, target) {
      if (target.closest && target.closest(CONTROLLER_SELECTOR)) {
        return true;
      }

      const path = event.composedPath ? event.composedPath() : this.pathFrom(target);
      return path.some((node) => {
        return node &&
          node.nodeType === 1 &&
          node.matches &&
          node.matches(CONTROLLER_SELECTOR);
      });
    }

    isBrowseFilterEvent(event, target) {
      if (!this.isBrowseFilterControl(target)) {
        return false;
      }

      const admitted = this.adapter.markBrowseFilterAdmitted && this.adapter.markBrowseFilterAdmitted(target);
      this.debug("admitted browse filter event", {
        type: event.type,
        target: this.describe(admitted || target, "browse-filter-admitted")
      });
      return true;
    }

    isBrowseFilterControl(target) {
      return Boolean(this.adapter.isBrowseFilterControl && this.adapter.isBrowseFilterControl(target));
    }

    findUnsafeEventSurface(target) {
      const path = target.composedPath ? target.composedPath() : this.pathFrom(target);
      for (const node of path) {
        if (!node || node.nodeType !== 1) {
          continue;
        }
        if (this.adapter.isComicShieldController && this.adapter.isComicShieldController(node)) {
          return null;
        }
        if (this.isBrowseFilterControl(node)) {
          return null;
        }
        if (this.adapter.isReaderControl(node) || this.adapter.isChapterNavigation(node)) {
          return null;
        }
        const metrics = this.metrics(node);
        if (this.adapter.isKnownClickTrap(node, metrics)) {
          return { element: node, reason: "known-full-viewport-click-trap" };
        }
        if (node.tagName === "A" && node.href) {
          const relation = this.classifyAnchor(node, metrics);
          if (relation && relation.action !== "frontier") {
            return { element: node, reason: relation.reason };
          }
        }
        if (this.isLargeTransparentClickSurface(node, metrics)) {
          return { element: node, reason: "large-transparent-click-surface" };
        }
        if (this.adapter.hasPopupCode(node)) {
          return { element: node, reason: "inline-popup-handler" };
        }
      }
      return null;
    }

    isAllowedInteraction(target) {
      if (this.adapter.isComicShieldController && this.adapter.isComicShieldController(target)) {
        return true;
      }

      if (this.isBrowseFilterControl(target)) {
        return true;
      }

      if (this.adapter.isReaderControl(target) || this.adapter.isChapterNavigation(target)) {
        return true;
      }

      const anchor = target.closest && target.closest("a[href]");
      if (anchor && this.adapter.isSameSiteUrl(anchor.href)) {
        return true;
      }

      if (this.adapter.isReaderPanel(target)) {
        return true;
      }

      const interactive = target.closest && target.closest("button,input,textarea,select,label,[role='button'],[role='tab'],[role='menuitem']");
      return Boolean(interactive && !this.isLargeTransparentClickSurface(interactive, this.metrics(interactive)));
    }

    isEmptyClickSurface(target) {
      const interactive = target.closest && target.closest("a[href],button,input,textarea,select,label,[role='button'],[role='tab'],[role='menuitem']");
      if (interactive) {
        return false;
      }

      if (this.isBrowseFilterControl(target)) {
        return false;
      }

      if (target === document.body || target === document.documentElement) {
        return true;
      }

      const readerBackground = target.closest && target.closest(".rpage,.rpage-main,.rpage-main__inner");
      if (readerBackground && !this.adapter.isReaderPanel(target) && !this.adapter.isReaderControl(target)) {
        return true;
      }

      const siteBackground = target.closest && target.closest("#app-root,.layout,.main-col,.side-col,.section");
      if (siteBackground && !target.closest(".card,.mchap-row,.mpage__hero,.topnav,.footer")) {
        return true;
      }

      return false;
    }

    blockEvent(event, reason, element) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.debug("blocked event", {
        type: event.type,
        reason,
        target: this.describe(element, reason)
      });
    }

    isInteractive(element) {
      return Boolean(element && element.matches && element.matches("a[href],button,input,textarea,select,label,[role='button'],[role='link'],[tabindex]"));
    }

    pathFrom(target) {
      const path = [];
      let current = target;
      while (current) {
        path.push(current);
        current = current.parentNode;
      }
      path.push(window);
      return path;
    }
  }

  globalThis.ComicShieldDomShield = ComicShieldDomShield;
})();
