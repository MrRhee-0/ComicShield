(function () {
  "use strict";

  const CONTROLLER_ATTR = "data-comicshield-controller";
  const ZOOM_STYLE_ID = "comicshield-reader-zoom-style";
  const SPEED_MIN = 20;
  const SPEED_MAX = 600;
  const SPEED_STEP = 20;
  const ZOOM_MIN = 0.65;
  const ZOOM_MAX = 1.6;
  const ZOOM_STEP = 0.1;

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return min;
    }
    return Math.min(max, Math.max(min, number));
  }

  function uniqueElements(items) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
      if (item && !seen.has(item)) {
        seen.add(item);
        result.push(item);
      }
    }
    return result;
  }

  class ComicShieldReaderController {
    constructor(options) {
      this.adapter = options.adapter;
      this.settingsApi = options.settingsApi;
      this.settings = options.settings;
      this.host = null;
      this.shadow = null;
      this.controls = {};
      this.speed = this.settings.rememberAutoscrollSpeed ? this.settings.autoscrollSpeed : 120;
      this.zoom = this.settings.rememberReaderZoom ? this.settings.readerZoom : 1;
      this.autoscrollActive = false;
      this.rafId = 0;
      this.lastFrameAt = 0;
      this.persistTimer = 0;
      this.pendingPersist = {};
      this.basePageWidth = 0;
      this.scrollTarget = null;
      this.resumeChecked = false;
      this.drag = null;
      this.boundTick = this.tick.bind(this);
      this.boundWindowResize = this.handleWindowResize.bind(this);
      this.boundDragMove = this.handleDragMove.bind(this);
      this.boundDragEnd = this.handleDragEnd.bind(this);
    }

    start() {
      window.addEventListener("resize", this.boundWindowResize, { passive: true });
      this.updateSettings(this.settings);
    }

    updateSettings(settings) {
      const previous = this.settings || {};
      this.settings = settings;

      if (settings.rememberAutoscrollSpeed) {
        this.speed = clamp(settings.autoscrollSpeed, SPEED_MIN, SPEED_MAX);
      }
      if (settings.rememberReaderZoom) {
        this.zoom = clamp(settings.readerZoom, ZOOM_MIN, ZOOM_MAX);
      }

      if (!this.shouldShowController()) {
        this.stopAutoscroll({ persist: true });
        this.removeController();
        this.removeZoom();
        return;
      }

      this.ensureController();
      this.render();

      if (settings.enableReaderZoomControls && this.zoom !== 1) {
        this.applyZoom();
      } else {
        this.removeZoom();
      }

      if (!settings.enableAutoscrollControls) {
        this.stopAutoscroll({ persist: true });
      }

      if (this.autoscrollActive && settings.resumeAutoscroll && previous.resumeAutoscroll !== true) {
        this.persistPartial({ autoscrollActive: true });
      }

      if (!this.resumeChecked) {
        this.resumeChecked = true;
        if (settings.resumeAutoscroll && settings.autoscrollActive && settings.enableAutoscrollControls) {
          this.startAutoscroll({ persist: false });
        }
      }
    }

    shouldShowController() {
      return Boolean(
        this.settings &&
        this.settings.enabled &&
        this.settings.showReaderController &&
        this.isReaderPage()
      );
    }

    isReaderPage() {
      if (this.adapter && this.adapter.pageKind && this.adapter.pageKind() === "reader") {
        return true;
      }
      return Boolean(document.querySelector(".rpage,.rpage-main,.rpage-main__inner"));
    }

    ensureController() {
      if (this.host && this.host.isConnected) {
        return;
      }

      const host = document.createElement("div");
      host.setAttribute(CONTROLLER_ATTR, "true");
      host.setAttribute("aria-label", "ComicShield reader controller");
      host.style.setProperty("position", "fixed", "important");
      host.style.setProperty("right", "16px", "important");
      host.style.setProperty("bottom", "72px", "important");
      host.style.setProperty("z-index", "2147483646", "important");
      host.style.setProperty("pointer-events", "auto", "important");

      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = this.template();

      this.host = host;
      this.shadow = shadow;
      this.cacheControls();
      this.bindControllerEvents();
      document.body.appendChild(host);
    }

    template() {
      return `
        <style>
          :host {
            all: initial;
            color-scheme: dark;
            font-family: Arial, Helvetica, sans-serif;
          }
          * {
            box-sizing: border-box;
          }
          .panel {
            width: 226px;
            border: 1px solid rgba(141, 233, 244, 0.42);
            border-radius: 8px;
            background: rgba(18, 24, 27, 0.94);
            box-shadow: 0 14px 38px rgba(0, 0, 0, 0.34);
            color: #edf7f8;
            overflow: hidden;
            user-select: none;
          }
          .bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            min-height: 34px;
            padding: 6px 7px 6px 10px;
            border-bottom: 1px solid rgba(141, 233, 244, 0.16);
            cursor: move;
          }
          .title {
            min-width: 0;
            overflow: hidden;
            color: #aef3fb;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0;
            white-space: nowrap;
            text-overflow: ellipsis;
          }
          .body {
            display: grid;
            gap: 8px;
            padding: 8px;
          }
          .row {
            display: grid;
            grid-template-columns: 48px 28px 1fr 28px;
            align-items: center;
            gap: 6px;
          }
          .zoom-row {
            grid-template-columns: 1fr 1fr 58px;
          }
          .collapsed .body {
            display: none;
          }
          .collapsed {
            width: 154px;
          }
          button {
            min-width: 0;
            height: 28px;
            padding: 0 8px;
            border: 1px solid #3e5960;
            border-radius: 6px;
            background: #1f2c30;
            color: #effbfc;
            font: 700 12px/1 Arial, Helvetica, sans-serif;
            letter-spacing: 0;
            cursor: pointer;
          }
          button:hover {
            border-color: #7de8f6;
            background: #243a40;
          }
          button:focus-visible,
          input[type="range"]:focus-visible {
            outline: 2px solid #7de8f6;
            outline-offset: 2px;
          }
          .collapse {
            width: 32px;
            padding: 0;
          }
          input[type="range"] {
            width: 100%;
            accent-color: #7de8f6;
          }
          .value {
            grid-column: 1 / -1;
            color: #afbec2;
            font-size: 11px;
            line-height: 1;
            text-align: center;
            white-space: nowrap;
          }
          [hidden] {
            display: none !important;
          }
        </style>
        <div class="panel" part="panel">
          <div class="bar" data-role="drag">
            <div class="title">ComicShield</div>
            <button class="collapse" type="button" data-action="collapse" title="Collapse controller" aria-label="Collapse controller">_</button>
          </div>
          <div class="body">
            <div class="row" data-section="autoscroll">
              <button type="button" data-action="play" title="Play or pause autoscroll">Play</button>
              <button type="button" data-action="speed-down" title="Slow autoscroll">-</button>
              <input type="range" min="${SPEED_MIN}" max="${SPEED_MAX}" step="10" data-action="speed-slider" aria-label="Autoscroll speed">
              <button type="button" data-action="speed-up" title="Speed up autoscroll">+</button>
              <div class="value" data-value="speed"></div>
            </div>
            <div class="row zoom-row" data-section="zoom">
              <button type="button" data-action="zoom-out" title="Zoom reader out">Z-</button>
              <button type="button" data-action="zoom-in" title="Zoom reader in">Z+</button>
              <button type="button" data-action="zoom-reset" title="Reset reader zoom">100%</button>
              <div class="value" data-value="zoom"></div>
            </div>
          </div>
        </div>
      `;
    }

    cacheControls() {
      const $ = (selector) => this.shadow.querySelector(selector);
      this.controls.panel = $(".panel");
      this.controls.drag = $("[data-role='drag']");
      this.controls.collapse = $("[data-action='collapse']");
      this.controls.play = $("[data-action='play']");
      this.controls.speedDown = $("[data-action='speed-down']");
      this.controls.speedUp = $("[data-action='speed-up']");
      this.controls.speedSlider = $("[data-action='speed-slider']");
      this.controls.speedValue = $("[data-value='speed']");
      this.controls.autoscrollSection = $("[data-section='autoscroll']");
      this.controls.zoomSection = $("[data-section='zoom']");
      this.controls.zoomOut = $("[data-action='zoom-out']");
      this.controls.zoomIn = $("[data-action='zoom-in']");
      this.controls.zoomReset = $("[data-action='zoom-reset']");
      this.controls.zoomValue = $("[data-value='zoom']");
    }

    bindControllerEvents() {
      this.controls.play.addEventListener("click", () => {
        this.toggleAutoscroll();
      });
      this.controls.speedDown.addEventListener("click", () => {
        this.setSpeed(this.speed - SPEED_STEP);
      });
      this.controls.speedUp.addEventListener("click", () => {
        this.setSpeed(this.speed + SPEED_STEP);
      });
      this.controls.speedSlider.addEventListener("input", (event) => {
        this.setSpeed(event.target.value);
      });
      this.controls.speedSlider.addEventListener("change", () => {
        this.flushPersist();
      });
      this.controls.zoomOut.addEventListener("click", () => {
        this.setZoom(this.zoom - ZOOM_STEP);
      });
      this.controls.zoomIn.addEventListener("click", () => {
        this.setZoom(this.zoom + ZOOM_STEP);
      });
      this.controls.zoomReset.addEventListener("click", () => {
        this.setZoom(1);
      });
      this.controls.collapse.addEventListener("click", () => {
        this.setCollapsed(!this.settings.controllerCollapsed);
      });
      this.controls.drag.addEventListener("pointerdown", (event) => {
        if (event.target === this.controls.collapse) {
          return;
        }
        this.beginDrag(event);
      });
    }

    render() {
      if (!this.host) {
        return;
      }
      const collapsed = this.settings.controllerCollapsed === true;
      this.controls.panel.classList.toggle("collapsed", collapsed);
      this.controls.collapse.textContent = collapsed ? "+" : "_";
      this.controls.collapse.title = collapsed ? "Open controller" : "Collapse controller";
      this.controls.collapse.setAttribute("aria-label", this.controls.collapse.title);

      this.controls.play.textContent = this.autoscrollActive ? "Pause" : "Play";
      this.controls.speedSlider.value = String(Math.round(this.speed));
      this.controls.speedValue.textContent = `${Math.round(this.speed)} px/s`;
      this.controls.zoomValue.textContent = `${Math.round(this.zoom * 100)}%`;
      this.controls.autoscrollSection.hidden = !this.settings.enableAutoscrollControls;
      this.controls.zoomSection.hidden = !this.settings.enableReaderZoomControls;
    }

    toggleAutoscroll() {
      if (this.autoscrollActive) {
        this.stopAutoscroll({ persist: true });
      } else {
        this.startAutoscroll({ persist: true });
      }
    }

    startAutoscroll(options) {
      if (!this.settings.enableAutoscrollControls) {
        return;
      }
      this.scrollTarget = this.detectScrollTarget();
      if (!this.scrollTarget) {
        this.debug("autoscroll has no scroll target");
        return;
      }
      this.debug("autoscroll target selected", this.describeScrollTarget(this.scrollTarget));
      this.autoscrollActive = true;
      this.lastFrameAt = 0;
      window.cancelAnimationFrame(this.rafId);
      this.rafId = window.requestAnimationFrame(this.boundTick);
      if (!options || options.persist !== false) {
        this.persistPartial({ autoscrollActive: this.settings.resumeAutoscroll === true });
      }
      this.render();
    }

    stopAutoscroll(options) {
      if (!this.autoscrollActive && !this.rafId) {
        return;
      }
      this.autoscrollActive = false;
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
      this.lastFrameAt = 0;
      this.scrollTarget = null;
      if (!options || options.persist !== false) {
        this.persistPartial({ autoscrollActive: false });
      }
      this.render();
    }

    tick(timestamp) {
      if (!this.autoscrollActive) {
        return;
      }
      if (!this.lastFrameAt) {
        this.lastFrameAt = timestamp;
      }

      const dt = Math.min(0.08, Math.max(0, (timestamp - this.lastFrameAt) / 1000));
      this.lastFrameAt = timestamp;

      const target = this.scrollTarget || this.detectScrollTarget();
      if (!target) {
        this.stopAutoscroll({ persist: true });
        return;
      }
      this.scrollTarget = target;

      const maxScroll = target.maxScroll;
      const current = target.currentScroll;
      if (current >= maxScroll - 1) {
        this.stopAutoscroll({ persist: true });
        return;
      }

      const delta = Math.min(maxScroll - current, this.speed * dt);
      target.scrollBy(delta);
      if (delta > 0 && target.type === "window" && target.currentScroll <= current + 0.1) {
        const internalTarget = this.detectScrollTarget({ skipWindow: true });
        if (internalTarget) {
          this.scrollTarget = internalTarget;
          this.debug("autoscroll target switched", this.describeScrollTarget(internalTarget));
          internalTarget.scrollBy(delta);
        }
      }
      this.rafId = window.requestAnimationFrame(this.boundTick);
    }

    detectScrollTarget(options) {
      const skipWindow = Boolean(options && options.skipWindow);
      const documentTarget = skipWindow ? null : this.windowScrollTarget(document.scrollingElement);
      if (documentTarget) {
        return documentTarget;
      }

      for (const selector of [".rpage-main", ".rpage", ".rpage-main__inner"]) {
        const target = this.elementScrollTarget(document.querySelector(selector), selector);
        if (target) {
          return target;
        }
      }

      if (!skipWindow) {
        for (const element of uniqueElements([document.documentElement, document.body])) {
          const target = this.windowScrollTarget(element);
          if (target) {
            return target;
          }
        }
      }

      return null;
    }

    windowScrollTarget(element) {
      if (!element || element.nodeType !== 1) {
        return null;
      }
      const self = this;
      const maxScroll = this.maxWindowScroll(element);
      if (maxScroll <= 2) {
        return null;
      }

      return {
        type: "window",
        element,
        get maxScroll() {
          return self.maxWindowScroll(element);
        },
        get currentScroll() {
          return self.windowScrollTop(element);
        },
        scrollBy(delta) {
          window.scrollBy({ top: delta, left: 0, behavior: "auto" });
        }
      };
    }

    elementScrollTarget(element, selector) {
      if (!element || element.nodeType !== 1) {
        return null;
      }
      const self = this;
      const maxScroll = this.maxElementScroll(element);
      if (maxScroll <= 2) {
        return null;
      }
      const style = getComputedStyle(element);
      if (["hidden", "clip"].includes(style.overflowY)) {
        return null;
      }

      return {
        type: "element",
        selector,
        element,
        get maxScroll() {
          return self.maxElementScroll(element);
        },
        get currentScroll() {
          return element.scrollTop;
        },
        scrollBy(delta) {
          element.scrollTop = Math.min(self.maxElementScroll(element), element.scrollTop + delta);
        }
      };
    }

    maxWindowScroll(element) {
      const scrollHeight = Math.max(
        element.scrollHeight || 0,
        document.documentElement ? document.documentElement.scrollHeight : 0,
        document.body ? document.body.scrollHeight : 0
      );
      return Math.max(0, scrollHeight - Math.max(1, window.innerHeight));
    }

    windowScrollTop(element) {
      return window.scrollY ||
        window.pageYOffset ||
        element.scrollTop ||
        (document.documentElement && document.documentElement.scrollTop) ||
        (document.body && document.body.scrollTop) ||
        0;
    }

    maxElementScroll(element) {
      const clientHeight = Math.max(1, element.clientHeight);
      return Math.max(0, element.scrollHeight - clientHeight);
    }

    describeScrollTarget(target) {
      if (!target) {
        return null;
      }
      return {
        type: target.type,
        selector: target.selector || "",
        tag: target.element ? target.element.tagName.toLowerCase() : "",
        className: target.element ? String(target.element.className || "") : "",
        currentScroll: Math.round(target.currentScroll),
        maxScroll: Math.round(target.maxScroll)
      };
    }

    setSpeed(value) {
      this.speed = clamp(value, SPEED_MIN, SPEED_MAX);
      if (this.settings.rememberAutoscrollSpeed) {
        this.persistPartial({ autoscrollSpeed: this.speed });
      }
      this.render();
    }

    setZoom(value) {
      this.zoom = Math.round(clamp(value, ZOOM_MIN, ZOOM_MAX) * 100) / 100;
      if (this.settings.enableReaderZoomControls && this.zoom !== 1) {
        this.applyZoom();
      } else {
        this.removeZoom();
      }
      this.scrollTarget = null;
      if (this.settings.rememberReaderZoom) {
        this.persistPartial({ readerZoom: this.zoom });
      }
      this.render();
    }

    setCollapsed(collapsed) {
      this.settings = { ...this.settings, controllerCollapsed: collapsed };
      this.persistPartial({ controllerCollapsed: collapsed });
      this.render();
    }

    applyZoom() {
      const targets = this.resolveZoomTargets();
      if (!targets) {
        return;
      }

      if (!this.basePageWidth) {
        this.basePageWidth = this.measureBaseWidth(targets);
      }
      if (!this.basePageWidth) {
        return;
      }

      const width = Math.round(this.basePageWidth * this.zoom);
      this.ensureZoomStyle();
      document.documentElement.setAttribute("data-comicshield-reader-zoom", "true");
      document.documentElement.style.setProperty("--comicshield-reader-width", `min(${width}px, calc(100vw - 72px))`);
      document.documentElement.style.setProperty("--comicshield-reader-max-width", "calc(100vw - 72px)");
    }

    resolveZoomTargets() {
      const inner = document.querySelector(".rpage-main__inner");
      const pages = Array.from(document.querySelectorAll(".rpage-main__inner > .rpage-page, .rpage-page"));
      const images = Array.from(document.querySelectorAll(".rpage-page__img"));
      if (!inner || pages.length === 0 || images.length === 0) {
        return null;
      }
      return { inner, pages, images };
    }

    measureBaseWidth(targets) {
      const sample = targets.pages.find((page) => page.getBoundingClientRect().width > 0) ||
        targets.images.find((image) => image.getBoundingClientRect().width > 0);
      if (!sample) {
        return 0;
      }
      return Math.max(240, Math.round(sample.getBoundingClientRect().width));
    }

    ensureZoomStyle() {
      if (document.getElementById(ZOOM_STYLE_ID)) {
        return;
      }
      const style = document.createElement("style");
      style.id = ZOOM_STYLE_ID;
      style.textContent = `
html[data-comicshield-reader-zoom="true"] .rpage-main__inner {
  align-items: center !important;
}
html[data-comicshield-reader-zoom="true"] .rpage-main__inner > .rpage-page,
html[data-comicshield-reader-zoom="true"] .rpage-page {
  box-sizing: border-box !important;
  width: var(--comicshield-reader-width) !important;
  max-width: var(--comicshield-reader-max-width) !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
html[data-comicshield-reader-zoom="true"] .rpage-page__img {
  box-sizing: border-box !important;
  display: block !important;
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  object-fit: contain !important;
}
      `.trim();
      document.documentElement.appendChild(style);
    }

    removeZoom() {
      document.documentElement.removeAttribute("data-comicshield-reader-zoom");
      document.documentElement.style.removeProperty("--comicshield-reader-width");
      document.documentElement.style.removeProperty("--comicshield-reader-max-width");
      const style = document.getElementById(ZOOM_STYLE_ID);
      if (style) {
        style.remove();
      }
    }

    removeController() {
      this.handleDragEnd();
      if (this.host) {
        this.host.remove();
      }
      this.host = null;
      this.shadow = null;
      this.controls = {};
    }

    handleWindowResize() {
      this.scrollTarget = null;
      if (this.settings && this.settings.enableReaderZoomControls && this.zoom !== 1 && this.host) {
        this.applyZoom();
      }
    }

    beginDrag(event) {
      if (event.button !== 0 || !this.host) {
        return;
      }
      const rect = this.host.getBoundingClientRect();
      this.drag = {
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top
      };
      window.addEventListener("pointermove", this.boundDragMove, true);
      window.addEventListener("pointerup", this.boundDragEnd, true);
      window.addEventListener("pointercancel", this.boundDragEnd, true);
    }

    handleDragMove(event) {
      if (!this.drag || !this.host) {
        return;
      }
      const width = this.host.offsetWidth || 226;
      const height = this.host.offsetHeight || 84;
      const left = clamp(this.drag.left + event.clientX - this.drag.startX, 8, window.innerWidth - width - 8);
      const top = clamp(this.drag.top + event.clientY - this.drag.startY, 8, window.innerHeight - height - 8);
      this.host.style.removeProperty("right");
      this.host.style.removeProperty("bottom");
      this.host.style.setProperty("left", `${left}px`, "important");
      this.host.style.setProperty("top", `${top}px`, "important");
    }

    handleDragEnd() {
      this.drag = null;
      window.removeEventListener("pointermove", this.boundDragMove, true);
      window.removeEventListener("pointerup", this.boundDragEnd, true);
      window.removeEventListener("pointercancel", this.boundDragEnd, true);
    }

    persistPartial(partial) {
      this.pendingPersist = { ...this.pendingPersist, ...partial };
      window.clearTimeout(this.persistTimer);
      this.persistTimer = window.setTimeout(() => this.flushPersist(), 180);
    }

    async flushPersist() {
      window.clearTimeout(this.persistTimer);
      const partial = this.pendingPersist;
      this.pendingPersist = {};
      if (!partial || Object.keys(partial).length === 0 || !this.settingsApi) {
        return;
      }
      const current = await this.settingsApi.readSettings();
      const saved = await this.settingsApi.writeSettings({ ...current, ...partial });
      this.settings = saved;
    }

    debug(message, details) {
      if (this.settings && this.settings.debug) {
        console.warn("[ComicShield reader]", message, details || "");
      }
    }
  }

  globalThis.ComicShieldReaderController = ComicShieldReaderController;
})();
