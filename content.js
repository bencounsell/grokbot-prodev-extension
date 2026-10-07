/**
 * Dev Toolbox — content script (injected on demand)
 * Modes: free (measure/inspect/live/outliner/…) + Pro wave 1 (layout/font/move/image/dark/export/…).
 */
(() => {
  "use strict";

  if (window.__DEV_TOOLBOX_CS__) {
    window.__DEV_TOOLBOX_CS__.ready = true;
    return;
  }

  const NS = "__dt_toolbox__";
  const STATE = {
    measure: false,
    inspect: false,
    liveText: false,
    outline: false,
    outlineMode: null,
    measureStart: null,
    overlay: null,
    line: null,
    label: null,
    highlight: null,
    liveEdits: [], // { el, originalHTML, originalCE }
    // Pro wave 1
    layoutOverlay: false,
    layoutMode: null,
    layoutTarget: null,
    layoutLocked: false,
    fontChanger: false,
    fontTarget: null,
    moveMode: false,
    moveEl: null,
    moveDragging: false,
    deleteMode: false,
    deletedEls: [],
    imageReplace: false,
    imageTarget: null,
    darkMode: false,
    exportPick: false,
    proHighlight: null,
  };

  const api = {
    ready: true,
    stopAll() {
      stopMeasure();
      stopInspect();
      stopLiveText(true);
      stopOutline();
      if (typeof stopInteractiveProModes === "function") stopInteractiveProModes();
    },
  };
  window.__DEV_TOOLBOX_CS__ = api;

  function ensureOverlayRoot() {
    let root = document.getElementById(NS + "-root");
    if (root) return root;
    root = document.createElement("div");
    root.id = NS + "-root";
    root.setAttribute("data-dt", "1");
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      pointerEvents: "none",
      fontFamily:
        'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    });
    (document.documentElement || document.body).appendChild(root);
    return root;
  }

  function clearOverlayChildren() {
    const root = document.getElementById(NS + "-root");
    if (root) root.innerHTML = "";
    STATE.overlay = null;
    STATE.line = null;
    STATE.label = null;
    STATE.highlight = null;
  }

  function removeRoot() {
    const root = document.getElementById(NS + "-root");
    if (root) root.remove();
    clearOverlayChildren();
  }

  // ——— Measure ———
  function startMeasure() {
    stopInspect();
    stopMeasure(false);
    STATE.measure = true;
    STATE.measureStart = null;

    const root = ensureOverlayRoot();
    root.style.pointerEvents = "auto";
    root.style.cursor = "crosshair";

    const veil = document.createElement("div");
    Object.assign(veil.style, {
      position: "absolute",
      inset: "0",
      background: "rgba(8,10,14,0.08)",
      cursor: "crosshair",
    });
    root.appendChild(veil);
    STATE.overlay = veil;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    Object.assign(svg.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      overflow: "visible",
      pointerEvents: "none",
    });
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("stroke", "#6e68e3");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-dasharray", "6 4");
    const c1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    const c2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    [c1, c2].forEach((c) => {
      c.setAttribute("r", "4");
      c.setAttribute("fill", "#817cf0");
      c.setAttribute("stroke", "#fff");
      c.setAttribute("stroke-width", "1.5");
    });
    svg.appendChild(line);
    svg.appendChild(c1);
    svg.appendChild(c2);
    root.appendChild(svg);
    STATE.line = { svg, line, c1, c2 };

    const label = document.createElement("div");
    Object.assign(label.style, {
      position: "fixed",
      padding: "6px 10px",
      borderRadius: "8px",
      background: "rgba(22,26,34,0.94)",
      border: "1px solid rgba(110,104,227,0.45)",
      color: "#e8eaed",
      fontSize: "12px",
      fontWeight: "560",
      fontFamily:
        '"SF Mono", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      pointerEvents: "none",
      display: "none",
      zIndex: "2147483647",
      whiteSpace: "nowrap",
    });
    root.appendChild(label);
    STATE.label = label;

    const hint = document.createElement("div");
    Object.assign(hint.style, {
      position: "fixed",
      top: "12px",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "8px 14px",
      borderRadius: "999px",
      background: "rgba(22,26,34,0.95)",
      border: "1px solid #2a3140",
      color: "#9aa3b2",
      fontSize: "12px",
      pointerEvents: "none",
      zIndex: "2147483647",
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    });
    hint.textContent = "Click and drag to measure · Esc to stop";
    hint.id = NS + "-hint";
    root.appendChild(hint);

    veil.addEventListener("mousedown", onMeasureDown);
    window.addEventListener("keydown", onMeasureKey, true);
  }

  function onMeasureDown(e) {
    if (!STATE.measure || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    STATE.measureStart = { x: e.clientX, y: e.clientY };
    const { line, c1, c2 } = STATE.line;
    line.setAttribute("x1", e.clientX);
    line.setAttribute("y1", e.clientY);
    line.setAttribute("x2", e.clientX);
    line.setAttribute("y2", e.clientY);
    c1.setAttribute("cx", e.clientX);
    c1.setAttribute("cy", e.clientY);
    c2.setAttribute("cx", e.clientX);
    c2.setAttribute("cy", e.clientY);
    STATE.label.style.display = "block";
    updateMeasureLabel(e.clientX, e.clientY, e.clientX, e.clientY);

    const onMove = (ev) => {
      if (!STATE.measureStart) return;
      line.setAttribute("x2", ev.clientX);
      line.setAttribute("y2", ev.clientY);
      c2.setAttribute("cx", ev.clientX);
      c2.setAttribute("cy", ev.clientY);
      updateMeasureLabel(
        STATE.measureStart.x,
        STATE.measureStart.y,
        ev.clientX,
        ev.clientY
      );
    };
    const onUp = (ev) => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      if (!STATE.measureStart) return;
      const x1 = STATE.measureStart.x;
      const y1 = STATE.measureStart.y;
      const x2 = ev.clientX;
      const y2 = ev.clientY;
      const dx = Math.round(x2 - x1);
      const dy = Math.round(y2 - y1);
      const distance = Math.round(Math.hypot(dx, dy));
      updateMeasureLabel(x1, y1, x2, y2);
      chrome.runtime
        .sendMessage({
          type: "DT_MEASURE_RESULT",
          payload: {
            distance,
            dx,
            dy,
            x1: Math.round(x1),
            y1: Math.round(y1),
            x2: Math.round(x2),
            y2: Math.round(y2),
            absDx: Math.abs(dx),
            absDy: Math.abs(dy),
          },
        })
        .catch(() => {});
      STATE.measureStart = null;
    };
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
  }

  function updateMeasureLabel(x1, y1, x2, y2) {
    const dx = Math.round(x2 - x1);
    const dy = Math.round(y2 - y1);
    const distance = Math.round(Math.hypot(dx, dy));
    const label = STATE.label;
    if (!label) return;
    label.innerHTML = `<span style="color:#b4b0f5">${distance}px</span>  <span style="color:#6b7385">·</span>  ΔX ${dx}  ΔY ${dy}`;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    label.style.left = `${Math.min(window.innerWidth - 12, Math.max(12, mx))}px`;
    label.style.top = `${Math.min(window.innerHeight - 12, Math.max(12, my - 36))}px`;
    label.style.transform = "translateX(-50%)";
  }

  function onMeasureKey(e) {
    if (e.key === "Escape" && STATE.measure) {
      e.preventDefault();
      e.stopPropagation();
      stopMeasure();
      chrome.runtime.sendMessage({ type: "DT_MEASURE_STOPPED" }).catch(() => {});
    }
  }

  function stopMeasure(remove = true) {
    STATE.measure = false;
    STATE.measureStart = null;
    window.removeEventListener("keydown", onMeasureKey, true);
    if (remove) {
      if (!STATE.inspect) removeRoot();
      else {
        clearOverlayChildren();
        const root = ensureOverlayRoot();
        root.style.pointerEvents = "none";
        root.style.cursor = "";
      }
    }
  }

  // ——— Inspect ———
  function startInspect() {
    stopMeasure();
    stopInspect(false);
    STATE.inspect = true;

    const root = ensureOverlayRoot();
    root.style.pointerEvents = "none";
    root.style.cursor = "";

    const hl = document.createElement("div");
    Object.assign(hl.style, {
      position: "fixed",
      pointerEvents: "none",
      border: "2px solid #6e68e3",
      background: "rgba(110,104,227,0.12)",
      borderRadius: "2px",
      zIndex: "2147483646",
      display: "none",
      boxSizing: "border-box",
      boxShadow: "0 0 0 1px rgba(255,255,255,0.25)",
    });
    root.appendChild(hl);
    STATE.highlight = hl;

    const tag = document.createElement("div");
    Object.assign(tag.style, {
      position: "fixed",
      padding: "4px 8px",
      borderRadius: "6px",
      background: "#6e68e3",
      color: "#fff",
      fontSize: "11px",
      fontWeight: "600",
      fontFamily:
        '"SF Mono", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
      pointerEvents: "none",
      zIndex: "2147483647",
      display: "none",
      maxWidth: "320px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    tag.id = NS + "-tag";
    root.appendChild(tag);

    const hint = document.createElement("div");
    Object.assign(hint.style, {
      position: "fixed",
      top: "12px",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "8px 14px",
      borderRadius: "999px",
      background: "rgba(22,26,34,0.95)",
      border: "1px solid #2a3140",
      color: "#9aa3b2",
      fontSize: "12px",
      pointerEvents: "none",
      zIndex: "2147483647",
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    });
    hint.textContent = "Hover to highlight · Click to inspect · Esc to stop";
    root.appendChild(hint);

    document.addEventListener("mousemove", onInspectMove, true);
    document.addEventListener("click", onInspectClick, true);
    document.addEventListener("keydown", onInspectKey, true);
  }

  function isDtNode(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el.id === NS + "-root" || el.closest?.("#" + NS + "-root")) return true;
    if (el.getAttribute?.("data-dt") === "1") return true;
    return false;
  }

  function onInspectMove(e) {
    if (!STATE.inspect) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isDtNode(el)) return;
    const r = el.getBoundingClientRect();
    const hl = STATE.highlight;
    if (!hl) return;
    hl.style.display = "block";
    hl.style.left = r.left + "px";
    hl.style.top = r.top + "px";
    hl.style.width = r.width + "px";
    hl.style.height = r.height + "px";
    const tag = document.getElementById(NS + "-tag");
    if (tag) {
      tag.style.display = "block";
      tag.textContent = describeElement(el);
      let top = r.top - 26;
      if (top < 4) top = r.bottom + 4;
      tag.style.left = Math.max(4, r.left) + "px";
      tag.style.top = top + "px";
    }
  }

  function onInspectClick(e) {
    if (!STATE.inspect) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isDtNode(el)) return;
    const payload = buildInspectPayload(el);
    chrome.runtime.sendMessage({ type: "DT_INSPECT_RESULT", payload }).catch(() => {});
  }

  function onInspectKey(e) {
    if (e.key === "Escape" && STATE.inspect) {
      e.preventDefault();
      e.stopPropagation();
      stopInspect();
      chrome.runtime.sendMessage({ type: "DT_INSPECT_STOPPED" }).catch(() => {});
    }
  }

  function stopInspect(remove = true) {
    STATE.inspect = false;
    document.removeEventListener("mousemove", onInspectMove, true);
    document.removeEventListener("click", onInspectClick, true);
    document.removeEventListener("keydown", onInspectKey, true);
    if (remove) removeRoot();
  }

  function describeElement(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + CSS.escape(el.id);
    if (el.classList?.length) {
      const classes = [...el.classList].slice(0, 3).map((c) => "." + CSS.escape(c));
      s += classes.join("");
      if (el.classList.length > 3) s += "…";
    }
    return s;
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return "#" + CSS.escape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      let part = cur.tagName.toLowerCase();
      if (cur.id) {
        parts.unshift("#" + CSS.escape(cur.id));
        break;
      }
      const parent = cur.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter(
          (c) => c.tagName === cur.tagName
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(cur) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(part);
      cur = parent;
      if (parts.length > 6) break;
    }
    return parts.join(" > ");
  }

  const STYLE_PROPS = [
    "display",
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "width",
    "height",
    "min-width",
    "min-height",
    "max-width",
    "max-height",
    "margin",
    "padding",
    "border",
    "border-radius",
    "background",
    "background-color",
    "color",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "letter-spacing",
    "text-align",
    "text-decoration",
    "white-space",
    "overflow",
    "opacity",
    "visibility",
    "z-index",
    "flex",
    "flex-direction",
    "flex-wrap",
    "align-items",
    "justify-content",
    "gap",
    "grid-template-columns",
    "grid-template-rows",
    "box-shadow",
    "transform",
    "transition",
    "cursor",
    "pointer-events",
    "object-fit",
  ];

  function buildInspectPayload(el) {
    const cs = window.getComputedStyle(el);
    const styles = {};
    for (const prop of STYLE_PROPS) {
      const v = cs.getPropertyValue(prop);
      if (v && v !== "none" && v !== "normal" && v !== "auto" && v !== "0px") {
        styles[prop] = v.trim();
      } else if (
        ["display", "position", "width", "height", "color", "font-size"].includes(
          prop
        )
      ) {
        styles[prop] = (v || "").trim();
      }
    }
    // Always include a few core ones
    ["display", "position", "width", "height", "margin", "padding", "color", "background-color", "font-family", "font-size"].forEach(
      (p) => {
        styles[p] = cs.getPropertyValue(p).trim();
      }
    );

    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      className: typeof el.className === "string" ? el.className : "",
      selector: describeElement(el),
      path: cssPath(el),
      styles,
      box: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        left: Math.round(rect.left),
      },
      text: (el.innerText || "").trim().slice(0, 80),
    };
  }

  // ——— Stack detection ———
  function detectStack() {
    const findings = [];
    const seen = new Set();

    function add(name, category, evidence, confidence = "high") {
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      findings.push({ name, category, evidence, confidence });
    }

    // Generator / CMS meta
    const generator = document.querySelector('meta[name="generator"]');
    if (generator?.content) {
      const g = generator.content;
      add(g.split(/[\s]/)[0] || g, "CMS / Generator", `meta generator: ${g}`, "high");
      if (/wordpress/i.test(g)) add("WordPress", "CMS", `meta generator: ${g}`, "high");
      if (/shopify/i.test(g)) add("Shopify", "Ecommerce", `meta generator: ${g}`, "high");
      if (/squarespace/i.test(g)) add("Squarespace", "CMS", `meta generator: ${g}`, "high");
      if (/wix/i.test(g)) add("Wix", "CMS", `meta generator: ${g}`, "high");
      if (/drupal/i.test(g)) add("Drupal", "CMS", `meta generator: ${g}`, "high");
      if (/ghost/i.test(g)) add("Ghost", "CMS", `meta generator: ${g}`, "high");
      if (/hugo/i.test(g)) add("Hugo", "SSG", `meta generator: ${g}`, "high");
      if (/jekyll/i.test(g)) add("Jekyll", "SSG", `meta generator: ${g}`, "high");
      if (/gatsby/i.test(g)) add("Gatsby", "SSG", `meta generator: ${g}`, "high");
      if (/next\.?js/i.test(g)) add("Next.js", "Framework", `meta generator: ${g}`, "high");
      if (/nuxt/i.test(g)) add("Nuxt", "Framework", `meta generator: ${g}`, "high");
      if (/webflow/i.test(g)) add("Webflow", "CMS", `meta generator: ${g}`, "high");
    }

    // Globals
    const win = window;
    const globalChecks = [
      ["React", "Framework", () => !!(win.React || document.querySelector("[data-reactroot],[data-reactid],#__next,#root [data-reactroot]") || [...document.querySelectorAll("*")].some((n) => Object.keys(n).some((k) => k.startsWith("__react"))) )],
      ["Next.js", "Framework", () => !!(win.__NEXT_DATA__ || document.getElementById("__NEXT_DATA__") || document.querySelector("script#__NEXT_DATA__"))],
      ["Vue.js", "Framework", () => !!(win.Vue || document.querySelector("[data-v-]"))],
      ["Nuxt", "Framework", () => !!(win.__NUXT__ || document.getElementById("__NUXT__"))],
      ["Angular", "Framework", () => !!(win.ng || document.querySelector("[ng-version]") || document.querySelector("[_ngcontent],[ng-app]"))],
      ["Svelte", "Framework", () => !!document.querySelector("[class*='svelte-']")],
      ["jQuery", "Library", () => !!(win.jQuery || win.$?.fn?.jquery)],
      ["Alpine.js", "Library", () => !!(win.Alpine || document.querySelector("[x-data]"))],
      ["Backbone.js", "Library", () => !!win.Backbone],
      ["Ember.js", "Framework", () => !!win.Ember],
      ["Knockout", "Library", () => !!win.ko],
      ["lodash", "Library", () => !!(win._ && win._.VERSION && win._.map)],
      ["moment.js", "Library", () => !!win.moment],
      ["D3.js", "Library", () => !!win.d3],
      ["Three.js", "Library", () => !!win.THREE],
      ["GSAP", "Library", () => !!(win.gsap || win.TweenMax)],
      ["Shopify", "Ecommerce", () => !!(win.Shopify || document.querySelector("script[src*='cdn.shopify.com']"))],
      ["WordPress", "CMS", () => !!(win.wp || document.querySelector("link#wp-block-library-css, script[src*='/wp-content/'], link[href*='/wp-content/']"))],
      ["Google Analytics", "Analytics", () => !!(win.ga || win.gtag || win.dataLayer || document.querySelector("script[src*='google-analytics.com'],script[src*='googletagmanager.com']"))],
      ["Google Tag Manager", "Analytics", () => !!(win.google_tag_manager || document.querySelector("script[src*='googletagmanager.com/gtm']"))],
      ["Segment", "Analytics", () => !!win.analytics],
      ["Mixpanel", "Analytics", () => !!win.mixpanel],
      ["Hotjar", "Analytics", () => !!(win.hj || document.querySelector("script[src*='static.hotjar.com']"))],
      ["Intercom", "Support", () => !!win.Intercom],
      ["Stripe", "Payments", () => !!(win.Stripe || document.querySelector("script[src*='js.stripe.com']"))],
      ["Tailwind CSS", "CSS", () => !!(document.querySelector("[class*='bg-'],[class*='text-'],[class*='flex']") && document.querySelectorAll("[class*='sm:'],[class*='md:'],[class*='lg:']").length > 2)],
      ["Bootstrap", "CSS", () => !!(win.bootstrap || document.querySelector("link[href*='bootstrap']") || document.querySelector(".container-fluid,.btn-primary[class*='btn']"))],
    ];

    for (const [name, category, test] of globalChecks) {
      try {
        if (test()) {
          let evidence = "runtime signal";
          if (name === "jQuery" && win.jQuery?.fn?.jquery)
            evidence = `jQuery ${win.jQuery.fn.jquery}`;
          if (name === "Angular") {
            const v = document.querySelector("[ng-version]");
            if (v) evidence = `ng-version=${v.getAttribute("ng-version")}`;
          }
          if (name === "Next.js" && win.__NEXT_DATA__) evidence = "__NEXT_DATA__ present";
          add(name, category, evidence, "high");
        }
      } catch (_) {
        /* ignore */
      }
    }

    // Script src patterns
    const scriptPatterns = [
      [/react(?:\.production|\.development|\.min)?\.js/i, "React", "Framework"],
      [/react-dom/i, "React DOM", "Library"],
      [/vue(?:\.runtime)?(?:\.min)?\.js/i, "Vue.js", "Framework"],
      [/angular(?:\.min)?\.js/i, "AngularJS", "Framework"],
      [/jquery(?:[\w.-]*)\.js/i, "jQuery", "Library"],
      [/cdn\.shopify\.com/i, "Shopify", "Ecommerce"],
      [/wp-content|wp-includes/i, "WordPress", "CMS"],
      [/cloudflare\.com\/cdn-cgi|challenge-platform/i, "Cloudflare", "CDN / Security"],
      [/js\.stripe\.com/i, "Stripe", "Payments"],
      [/googletagmanager\.com/i, "Google Tag Manager", "Analytics"],
      [/google-analytics\.com|gtag\/js/i, "Google Analytics", "Analytics"],
      [/cdn\.segment\.com|analytics\.js/i, "Segment", "Analytics"],
      [/static\.hotjar\.com/i, "Hotjar", "Analytics"],
      [/js\.intercomcdn\.com/i, "Intercom", "Support"],
      [/cdn\.tailwindcss\.com|tailwind/i, "Tailwind CSS", "CSS"],
      [/bootstrap(?:\.min)?\.(?:js|css)/i, "Bootstrap", "CSS"],
      [/unpkg\.com\/svelte|svelte/i, "Svelte", "Framework"],
      [/webpack|chunk/i, "Webpack bundles", "Build"],
      [/vite|@vite/i, "Vite", "Build"],
      [/parcel/i, "Parcel", "Build"],
      [/cloudfront\.net/i, "Amazon CloudFront", "CDN"],
      [/fastly/i, "Fastly", "CDN"],
      [/jsdelivr\.net/i, "jsDelivr", "CDN"],
      [/unpkg\.com/i, "unpkg", "CDN"],
      [/cdnjs\.cloudflare\.com/i, "cdnjs", "CDN"],
    ];

    document.querySelectorAll("script[src]").forEach((s) => {
      const src = s.getAttribute("src") || "";
      for (const [re, name, category] of scriptPatterns) {
        if (re.test(src)) add(name, category, `script: ${src.slice(0, 80)}`, "medium");
      }
    });

    document.querySelectorAll('link[rel="stylesheet"][href]').forEach((l) => {
      const href = l.getAttribute("href") || "";
      if (/bootstrap/i.test(href)) add("Bootstrap", "CSS", `stylesheet: ${href.slice(0, 80)}`, "high");
      if (/tailwind/i.test(href)) add("Tailwind CSS", "CSS", `stylesheet: ${href.slice(0, 80)}`, "high");
      if (/font-awesome|fontawesome/i.test(href))
        add("Font Awesome", "Icons", `stylesheet: ${href.slice(0, 80)}`, "high");
      if (/googleapis\.com\/css|fonts\.google/i.test(href))
        add("Google Fonts", "Fonts", `stylesheet: ${href.slice(0, 80)}`, "high");
    });

    // Framework fingerprints in DOM
    if (document.querySelector("#__next") || document.querySelector("script#__NEXT_DATA__"))
      add("Next.js", "Framework", "#__next / __NEXT_DATA__", "high");
    if (document.querySelector("#___gatsby"))
      add("Gatsby", "SSG", "#___gatsby", "high");
    if (document.querySelector("[data-reactroot]"))
      add("React", "Framework", "data-reactroot", "high");
    if (document.querySelector("astro-island, [data-astro-cid]"))
      add("Astro", "Framework", "astro-island / data-astro-cid", "high");
    if (document.querySelector("[data-svelte]"))
      add("Svelte", "Framework", "data-svelte", "medium");

    // Meta / og
    if (document.querySelector('meta[property="og:site_name"]')) {
      /* informational only */
    }

    // HTTPS / basics
    if (location.protocol === "https:")
      add("HTTPS", "Security", "page served over HTTPS", "high");
    add("HTML5", "Markup", `doctype / ${document.documentElement?.lang || "html"}`, "high");

    // Viewport
    if (document.querySelector('meta[name="viewport"]'))
      add("Responsive viewport", "Markup", "meta viewport present", "medium");

    // Service worker
    if (navigator.serviceWorker?.controller)
      add("Service Worker", "PWA", "active service worker controller", "high");

    // Sort: high first, then by category
    const confRank = { high: 0, medium: 1, low: 2 };
    findings.sort(
      (a, b) =>
        (confRank[a.confidence] ?? 9) - (confRank[b.confidence] ?? 9) ||
        a.category.localeCompare(b.category) ||
        a.name.localeCompare(b.name)
    );

    return {
      url: location.href,
      title: document.title,
      findings,
      scannedAt: Date.now(),
    };
  }


  // ——— Color extraction ———
  function rgbToHex(r, g, b) {
    const h = (n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  function parseCssColor(str) {
    if (!str || str === "transparent" || str === "rgba(0, 0, 0, 0)") return null;
    const s = String(str).trim();
    let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return `#${h.toLowerCase()}`;
    }
    m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (m) {
      const a = s.includes("rgba")
        ? parseFloat((s.match(/,\s*([\d.]+)\s*\)/) || [])[1] ?? 1)
        : 1;
      if (a < 0.08) return null;
      return rgbToHex(+m[1], +m[2], +m[3]);
    }
    return null;
  }

  function extractColors() {
    const counts = new Map();
    const props = [
      "color",
      "background-color",
      "border-top-color",
      "border-right-color",
      "border-bottom-color",
      "border-left-color",
      "outline-color",
      "fill",
      "stroke",
    ];
    const nodes = document.body
      ? document.body.querySelectorAll("*")
      : [];
    const limit = Math.min(nodes.length, 2500);
    for (let i = 0; i < limit; i++) {
      const el = nodes[i];
      if (el.id === NS + "-root" || el.closest?.("#" + NS + "-root")) continue;
      let cs;
      try {
        cs = getComputedStyle(el);
      } catch {
        continue;
      }
      for (const p of props) {
        const hex = parseCssColor(cs.getPropertyValue(p));
        if (!hex) continue;
        const prev = counts.get(hex) || { hex, count: 0, sources: new Set() };
        prev.count++;
        prev.sources.add(p);
        counts.set(hex, prev);
      }
    }
    // Also scrape inline styles / style tags lightly
    document.querySelectorAll("[style]").forEach((el) => {
      const st = el.getAttribute("style") || "";
      const re = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/g;
      let m;
      while ((m = re.exec(st))) {
        const hex = parseCssColor(m[0]);
        if (!hex) continue;
        const prev = counts.get(hex) || { hex, count: 0, sources: new Set() };
        prev.count++;
        prev.sources.add("inline");
        counts.set(hex, prev);
      }
    });

    const colors = [...counts.values()]
      .map((c) => ({
        hex: c.hex,
        count: c.count,
        sources: [...c.sources].slice(0, 4),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 48);

    return { colors, scanned: limit, url: location.href };
  }

  // ——— Fonts ———
  function extractFonts() {
    const map = new Map();
    const nodes = document.body
      ? document.body.querySelectorAll(
          "p, span, a, li, h1, h2, h3, h4, h5, h6, button, label, td, th, div, input, textarea"
        )
      : [];
    const limit = Math.min(nodes.length, 2000);
    for (let i = 0; i < limit; i++) {
      const el = nodes[i];
      if (el.id === NS + "-root" || el.closest?.("#" + NS + "-root")) continue;
      const text = (el.innerText || el.value || "").trim();
      if (!text || text.length < 1) continue;
      let cs;
      try {
        cs = getComputedStyle(el);
      } catch {
        continue;
      }
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const family = cs.fontFamily || "";
      const primary = family.split(",")[0].trim().replace(/^["']|["']$/g, "");
      if (!primary) continue;
      const key = family.toLowerCase();
      const sample = text.replace(/\s+/g, " ").slice(0, 42);
      if (!map.has(key)) {
        map.set(key, {
          family,
          primary,
          count: 0,
          sample,
          size: cs.fontSize,
          weight: cs.fontWeight,
        });
      }
      const e = map.get(key);
      e.count++;
      if (sample.length > e.sample.length) e.sample = sample;
    }
    const fonts = [...map.values()].sort((a, b) => b.count - a.count);
    return { fonts, scanned: limit, url: location.href };
  }

  // ——— Live text ———
  function startLiveText() {
    stopMeasure();
    stopInspect();
    stopOutline();
    if (STATE.liveText) return;
    STATE.liveText = true;
    STATE.liveEdits = [];

    const root = ensureOverlayRoot();
    root.style.pointerEvents = "none";
    const hint = document.createElement("div");
    Object.assign(hint.style, {
      position: "fixed",
      top: "12px",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "8px 14px",
      borderRadius: "999px",
      background: "rgba(22,26,34,0.95)",
      border: "1px solid #2a3140",
      color: "#9aa3b2",
      fontSize: "12px",
      pointerEvents: "none",
      zIndex: "2147483647",
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    });
    hint.id = NS + "-live-hint";
    hint.textContent = "Click text to edit · Esc or Stop restores originals";
    root.appendChild(hint);

    document.addEventListener("click", onLiveTextClick, true);
    document.addEventListener("keydown", onLiveTextKey, true);
  }

  function onLiveTextClick(e) {
    if (!STATE.liveText) return;
    const el = e.target;
    if (!el || isDtNode(el)) return;
    if (!el.closest) return;
    // Prefer a text-ish element
    let target = el;
    const tag = (target.tagName || "").toLowerCase();
    if (["html", "body", "script", "style", "svg", "path", "img", "video", "iframe", "input", "textarea", "select"].includes(tag)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const existing = STATE.liveEdits.find((x) => x.el === target);
    if (!existing) {
      STATE.liveEdits.push({
        el: target,
        originalHTML: target.innerHTML,
        originalCE: target.getAttribute("contenteditable"),
      });
    }
    target.setAttribute("contenteditable", "true");
    target.style.outline = "2px solid #6e68e3";
    target.style.outlineOffset = "2px";
    target.focus();
    chrome.runtime
      .sendMessage({
        type: "DT_LIVE_TEXT_EDITING",
        payload: { tag: tag, count: STATE.liveEdits.length },
      })
      .catch(() => {});
  }

  function onLiveTextKey(e) {
    if (e.key === "Escape" && STATE.liveText) {
      e.preventDefault();
      e.stopPropagation();
      stopLiveText(true);
      chrome.runtime.sendMessage({ type: "DT_LIVE_TEXT_STOPPED" }).catch(() => {});
    }
  }

  function stopLiveText(restore) {
    document.removeEventListener("click", onLiveTextClick, true);
    document.removeEventListener("keydown", onLiveTextKey, true);
    STATE.liveText = false;
    const hint = document.getElementById(NS + "-live-hint");
    if (hint) hint.remove();
    for (const item of STATE.liveEdits) {
      try {
        if (restore) item.el.innerHTML = item.originalHTML;
        if (item.originalCE == null) item.el.removeAttribute("contenteditable");
        else item.el.setAttribute("contenteditable", item.originalCE);
        item.el.style.outline = "";
        item.el.style.outlineOffset = "";
      } catch (_) {}
    }
    STATE.liveEdits = [];
    if (!STATE.measure && !STATE.inspect && !STATE.outline) removeRoot();
  }

  // ——— Outliner ———
  function startOutline(mode) {
    stopMeasure();
    stopInspect();
    stopLiveText(true);
    stopOutline();
    STATE.outline = true;
    STATE.outlineMode = mode || "all";

    let css = "";
    if (STATE.outlineMode === "all") {
      css = `
        body *:not(#${NS}-root):not(#${NS}-root *) {
          outline: 1px solid rgba(110, 104, 227, 0.45) !important;
          outline-offset: -1px;
        }`;
    } else if (STATE.outlineMode === "headings") {
      css = `
        h1, h2, h3, h4, h5, h6, [role="heading"] {
          outline: 2px solid #e8b84a !important;
          outline-offset: 2px;
        }`;
    } else if (STATE.outlineMode === "interactive") {
      css = `
        a, button, input, select, textarea, summary, [role="button"], [role="link"],
        [role="checkbox"], [role="radio"], [role="tab"], [tabindex]:not([tabindex="-1"]) {
          outline: 2px solid #3ecf8e !important;
          outline-offset: 2px;
        }`;
    }

    let style = document.getElementById(NS + "-outline-style");
    if (!style) {
      style = document.createElement("style");
      style.id = NS + "-outline-style";
      style.setAttribute("data-dt", "1");
      document.documentElement.appendChild(style);
    }
    style.textContent = css;

    const root = ensureOverlayRoot();
    root.style.pointerEvents = "none";
    let hint = document.getElementById(NS + "-outline-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.id = NS + "-outline-hint";
      Object.assign(hint.style, {
        position: "fixed",
        top: "12px",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "8px 14px",
        borderRadius: "999px",
        background: "rgba(22,26,34,0.95)",
        border: "1px solid #2a3140",
        color: "#9aa3b2",
        fontSize: "12px",
        pointerEvents: "none",
        zIndex: "2147483647",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      });
      root.appendChild(hint);
    }
    hint.textContent = `Outliner: ${STATE.outlineMode} · Esc or Stop to clear`;
    document.addEventListener("keydown", onOutlineKey, true);
  }

  function onOutlineKey(e) {
    if (e.key === "Escape" && STATE.outline) {
      e.preventDefault();
      stopOutline();
      chrome.runtime.sendMessage({ type: "DT_OUTLINE_STOPPED" }).catch(() => {});
    }
  }

  function stopOutline() {
    STATE.outline = false;
    STATE.outlineMode = null;
    document.removeEventListener("keydown", onOutlineKey, true);
    const style = document.getElementById(NS + "-outline-style");
    if (style) style.remove();
    const hint = document.getElementById(NS + "-outline-hint");
    if (hint) hint.remove();
    if (!STATE.measure && !STATE.inspect && !STATE.liveText) removeRoot();
  }

  // ——— Images ———
  function absoluteUrl(u) {
    try {
      return new URL(u, location.href).href;
    } catch {
      return u;
    }
  }

  function extractImages() {
    const seen = new Map();
    function add(url, source, el) {
      if (!url || url.startsWith("data:") && url.length > 200) {
        if (url && url.startsWith("data:")) {
          const key = url.slice(0, 64);
          if (seen.has(key)) return;
          seen.set(key, {
            url,
            source,
            width: el?.naturalWidth || null,
            height: el?.naturalHeight || null,
            alt: el?.alt || "",
            dataUri: true,
          });
        }
        return;
      }
      if (/^(?:about|blob):/i.test(url)) return;
      const abs = absoluteUrl(url.split(" ")[0]);
      if (!abs || seen.has(abs)) {
        if (seen.has(abs) && el?.naturalWidth) {
          const prev = seen.get(abs);
          if (!prev.width) {
            prev.width = el.naturalWidth;
            prev.height = el.naturalHeight;
          }
        }
        return;
      }
      seen.set(abs, {
        url: abs,
        source,
        width: el?.naturalWidth || null,
        height: el?.naturalHeight || null,
        alt: (el?.alt || "").slice(0, 80),
        dataUri: abs.startsWith("data:"),
      });
    }

    document.querySelectorAll("img").forEach((img) => {
      if (img.src) add(img.src, "img", img);
      const ss = img.getAttribute("srcset");
      if (ss) {
        ss.split(",").forEach((part) => {
          const u = part.trim().split(/\s+/)[0];
          if (u) add(u, "srcset", img);
        });
      }
    });
    document.querySelectorAll("source[srcset], source[src]").forEach((s) => {
      if (s.src) add(s.src, "source", null);
      const ss = s.getAttribute("srcset");
      if (ss) {
        ss.split(",").forEach((part) => {
          const u = part.trim().split(/\s+/)[0];
          if (u) add(u, "source-srcset", null);
        });
      }
    });
    document.querySelectorAll("*").forEach((el) => {
      if (el.id === NS + "-root" || el.closest?.("#" + NS + "-root")) return;
      let cs;
      try {
        cs = getComputedStyle(el);
      } catch {
        return;
      }
      const bg = cs.backgroundImage;
      if (!bg || bg === "none") return;
      const re = /url\(["']?([^"')]+)["']?\)/g;
      let m;
      while ((m = re.exec(bg))) add(m[1], "background", null);
    });

    const images = [...seen.values()].slice(0, 100);
    return { images, count: images.length, url: location.href };
  }

  // ——— A11y ———
  function relativeLuminance(hex) {
    const n = parseCssColor(hex);
    if (!n) return null;
    const r = parseInt(n.slice(1, 3), 16) / 255;
    const g = parseInt(n.slice(3, 5), 16) / 255;
    const b = parseInt(n.slice(5, 7), 16) / 255;
    const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }

  function contrastRatio(fg, bg) {
    const L1 = relativeLuminance(fg);
    const L2 = relativeLuminance(bg);
    if (L1 == null || L2 == null) return null;
    const lighter = Math.max(L1, L2);
    const darker = Math.min(L1, L2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function accessibleName(el) {
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim();
    const labelled = el.getAttribute("aria-labelledby");
    if (labelled) {
      const t = labelled
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.innerText?.trim())
        .filter(Boolean)
        .join(" ");
      if (t) return t;
    }
    if (el.tagName === "IMG") return (el.alt || "").trim();
    const title = el.getAttribute("title");
    if (title && title.trim()) return title.trim();
    return (el.innerText || el.value || el.getAttribute("placeholder") || "").trim();
  }

  function describeSel(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    else if (el.classList?.length)
      s += "." + [...el.classList].slice(0, 2).join(".");
    return s.slice(0, 60);
  }

  function scanA11y() {
    const findings = [];

    document.querySelectorAll("img").forEach((img) => {
      if (img.closest?.("#" + NS + "-root")) return;
      const alt = img.getAttribute("alt");
      if (alt === null) {
        findings.push({
          severity: "error",
          rule: "img-alt",
          message: "Image missing alt attribute",
          selector: describeSel(img),
          detail: (img.src || "").slice(0, 80),
        });
      } else if (alt === "" && img.getAttribute("role") !== "presentation") {
        // empty alt can be decorative — flag as warn if not marked decorative
        if (!img.hasAttribute("role") && !img.hasAttribute("aria-hidden")) {
          findings.push({
            severity: "info",
            rule: "img-alt-empty",
            message: "Image has empty alt (ok if decorative)",
            selector: describeSel(img),
            detail: (img.src || "").slice(0, 80),
          });
        }
      }
    });

    document.querySelectorAll("button, a, [role='button']").forEach((el) => {
      if (el.closest?.("#" + NS + "-root")) return;
      const name = accessibleName(el);
      if (!name) {
        findings.push({
          severity: "error",
          rule: "control-name",
          message: `${el.tagName.toLowerCase()} has no accessible name`,
          selector: describeSel(el),
          detail: "",
        });
      }
    });

    document.querySelectorAll("input, select, textarea").forEach((el) => {
      if (el.closest?.("#" + NS + "-root")) return;
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(type)) return;
      const id = el.id;
      let labeled = false;
      if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) labeled = true;
      if (el.closest("label")) labeled = true;
      if (accessibleName(el)) labeled = true;
      if (!labeled) {
        findings.push({
          severity: "error",
          rule: "input-label",
          message: "Form control missing label",
          selector: describeSel(el),
          detail: type || el.tagName.toLowerCase(),
        });
      }
    });

    // Heading order
    let lastLevel = 0;
    document.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => {
      const level = parseInt(h.tagName[1], 10);
      if (lastLevel && level > lastLevel + 1) {
        findings.push({
          severity: "warn",
          rule: "heading-order",
          message: `Heading level skipped (h${lastLevel} → h${level})`,
          selector: describeSel(h),
          detail: (h.innerText || "").trim().slice(0, 60),
        });
      }
      lastLevel = level;
    });

    // Contrast heuristic on text nodes' parents
    const textEls = document.body
      ? document.body.querySelectorAll("p, span, a, li, h1, h2, h3, h4, h5, h6, button, label, td, th")
      : [];
    let contrastChecked = 0;
    for (const el of textEls) {
      if (contrastChecked >= 80) break;
      if (el.closest?.("#" + NS + "-root")) continue;
      const text = (el.innerText || "").trim();
      if (text.length < 3) continue;
      let cs;
      try {
        cs = getComputedStyle(el);
      } catch {
        continue;
      }
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const fg = cs.color;
      let bg = cs.backgroundColor;
      let node = el;
      while (
        node &&
        (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)")
      ) {
        node = node.parentElement;
        if (!node) break;
        try {
          bg = getComputedStyle(node).backgroundColor;
        } catch {
          break;
        }
      }
      if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") bg = "rgb(255,255,255)";
      const ratio = contrastRatio(fg, bg);
      contrastChecked++;
      if (ratio != null && ratio < 4.5) {
        const fontSize = parseFloat(cs.fontSize) || 14;
        const bold = parseInt(cs.fontWeight, 10) >= 700;
        const large = fontSize >= 24 || (fontSize >= 18.66 && bold);
        const threshold = large ? 3 : 4.5;
        if (ratio < threshold) {
          findings.push({
            severity: ratio < 3 ? "error" : "warn",
            rule: "contrast",
            message: `Low contrast (~${ratio.toFixed(2)}:1)`,
            selector: describeSel(el),
            detail: text.slice(0, 40),
          });
        }
      }
    }

    // Dedupe similar
    const uniq = [];
    const keys = new Set();
    for (const f of findings) {
      const k = `${f.rule}|${f.selector}|${f.message}`;
      if (keys.has(k)) continue;
      keys.add(k);
      uniq.push(f);
    }
    const sev = { error: 0, warn: 1, info: 2 };
    uniq.sort((a, b) => (sev[a.severity] ?? 9) - (sev[b.severity] ?? 9));
    return {
      findings: uniq.slice(0, 80),
      total: uniq.length,
      url: location.href,
      title: document.title,
    };
  }

  // Page metrics for full-page screenshot
  function pageMetrics() {
    const body = document.body;
    const html = document.documentElement;
    const width = Math.max(
      body?.scrollWidth || 0,
      html?.scrollWidth || 0,
      window.innerWidth
    );
    const height = Math.max(
      body?.scrollHeight || 0,
      html?.scrollHeight || 0,
      window.innerHeight
    );
    return {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      pageWidth: width,
      pageHeight: height,
      dpr: window.devicePixelRatio || 1,
    };
  }

  // ——— Pro wave 1 ———
  const PRO_FONT_STACKS = [
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "Inter, system-ui, sans-serif",
    "Georgia, 'Times New Roman', serif",
    "'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
    "'Helvetica Neue', Helvetica, Arial, sans-serif",
    "Roboto, 'Helvetica Neue', Arial, sans-serif",
    "'Comic Sans MS', 'Chalkboard SE', cursive",
    "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
  ];

  function showPageHint(id, text) {
    const root = ensureOverlayRoot();
    root.style.pointerEvents = "none";
    let hint = document.getElementById(id);
    if (!hint) {
      hint = document.createElement("div");
      hint.id = id;
      Object.assign(hint.style, {
        position: "fixed",
        top: "12px",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "8px 14px",
        borderRadius: "999px",
        background: "rgba(22,26,34,0.95)",
        border: "1px solid #2a3140",
        color: "#9aa3b2",
        fontSize: "12px",
        pointerEvents: "none",
        zIndex: "2147483647",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        maxWidth: "90vw",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      });
      root.appendChild(hint);
    }
    hint.textContent = text;
    return hint;
  }

  function clearPageHint(id) {
    const hint = document.getElementById(id);
    if (hint) hint.remove();
  }

  function ensureHighlightBox() {
    const root = ensureOverlayRoot();
    let hl = STATE.proHighlight;
    if (!hl) {
      hl = document.createElement("div");
      Object.assign(hl.style, {
        position: "fixed",
        pointerEvents: "none",
        border: "2px solid #6e68e3",
        background: "rgba(110,104,227,0.10)",
        borderRadius: "2px",
        zIndex: "2147483646",
        display: "none",
        boxSizing: "border-box",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.2)",
      });
      root.appendChild(hl);
      STATE.proHighlight = hl;
    }
    return hl;
  }

  function placeHighlight(el) {
    const hl = ensureHighlightBox();
    if (!el) {
      hl.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    hl.style.display = "block";
    hl.style.left = r.left + "px";
    hl.style.top = r.top + "px";
    hl.style.width = Math.max(0, r.width) + "px";
    hl.style.height = Math.max(0, r.height) + "px";
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return "#" + CSS.escape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body && parts.length < 5) {
      let part = cur.tagName.toLowerCase();
      if (cur.classList?.length) {
        part +=
          "." +
          [...cur.classList]
            .slice(0, 2)
            .map((c) => CSS.escape(c))
            .join(".");
      }
      const parent = cur.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((c) => c.tagName === cur.tagName);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
        }
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(" > ");
  }

  // ——— Layout overlays ———
  function stopLayoutOverlay() {
    STATE.layoutOverlay = false;
    document.removeEventListener("mousemove", onLayoutMove, true);
    document.removeEventListener("click", onLayoutClick, true);
    document.removeEventListener("keydown", onLayoutKey, true);
    const box = document.getElementById(NS + "-layout-box");
    if (box) box.remove();
    clearPageHint(NS + "-layout-hint");
    STATE.layoutTarget = null;
    if (!hasActiveProMode() && !STATE.measure && !STATE.inspect && !STATE.liveText && !STATE.outline) {
      removeRoot();
    }
  }

  function hasActiveProMode() {
    return !!(
      STATE.layoutOverlay ||
      STATE.fontChanger ||
      STATE.moveMode ||
      STATE.deleteMode ||
      STATE.imageReplace ||
      STATE.exportPick
    );
  }

  function startLayoutOverlay(mode) {
    stopInteractiveProModes();
    stopMeasure();
    stopInspect();
    STATE.layoutOverlay = true;
    STATE.layoutMode = mode || "box";
    ensureOverlayRoot();
    showPageHint(
      NS + "-layout-hint",
      `Layout: ${STATE.layoutMode} · hover · click to lock · Esc to stop`
    );
    document.addEventListener("mousemove", onLayoutMove, true);
    document.addEventListener("click", onLayoutClick, true);
    document.addEventListener("keydown", onLayoutKey, true);
  }

  function onLayoutMove(e) {
    if (!STATE.layoutOverlay || STATE.layoutLocked) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isDtNode(el)) return;
    STATE.layoutTarget = el;
    renderLayoutOverlay(el);
  }

  function onLayoutClick(e) {
    if (!STATE.layoutOverlay) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isDtNode(el)) return;
    STATE.layoutTarget = el;
    STATE.layoutLocked = !STATE.layoutLocked;
    renderLayoutOverlay(el);
    showPageHint(
      NS + "-layout-hint",
      STATE.layoutLocked
        ? `Locked · ${describeElement(el)} · click again to unlock · Esc`
        : `Layout: ${STATE.layoutMode} · hover · click to lock · Esc`
    );
    chrome.runtime
      .sendMessage({
        type: "DT_LAYOUT_INFO",
        payload: buildLayoutInfo(el),
      })
      .catch(() => {});
  }

  function onLayoutKey(e) {
    if (e.key === "Escape" && STATE.layoutOverlay) {
      e.preventDefault();
      stopLayoutOverlay();
      chrome.runtime.sendMessage({ type: "DT_LAYOUT_STOPPED" }).catch(() => {});
    }
  }

  function buildLayoutInfo(el) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      selector: cssPath(el),
      tag: describeElement(el),
      display: cs.display,
      position: cs.position,
      width: Math.round(r.width),
      height: Math.round(r.height),
      margin: cs.margin,
      padding: cs.padding,
      flexDirection: cs.flexDirection,
      justifyContent: cs.justifyContent,
      alignItems: cs.alignItems,
      gap: cs.gap,
      gridTemplateColumns: cs.gridTemplateColumns,
      gridTemplateRows: cs.gridTemplateRows,
    };
  }

  function renderLayoutOverlay(el) {
    const root = ensureOverlayRoot();
    let box = document.getElementById(NS + "-layout-box");
    if (!box) {
      box = document.createElement("div");
      box.id = NS + "-layout-box";
      box.setAttribute("data-dt", "1");
      Object.assign(box.style, {
        position: "fixed",
        pointerEvents: "none",
        zIndex: "2147483645",
      });
      root.appendChild(box);
    }
    box.innerHTML = "";
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const mt = parseFloat(cs.marginTop) || 0;
    const mr = parseFloat(cs.marginRight) || 0;
    const mb = parseFloat(cs.marginBottom) || 0;
    const ml = parseFloat(cs.marginLeft) || 0;
    const pt = parseFloat(cs.paddingTop) || 0;
    const pr = parseFloat(cs.paddingRight) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const pl = parseFloat(cs.paddingLeft) || 0;

    function layer(left, top, w, h, bg, border) {
      const d = document.createElement("div");
      Object.assign(d.style, {
        position: "fixed",
        left: left + "px",
        top: top + "px",
        width: Math.max(0, w) + "px",
        height: Math.max(0, h) + "px",
        background: bg,
        border: border || "none",
        boxSizing: "border-box",
        pointerEvents: "none",
      });
      box.appendChild(d);
      return d;
    }

    if (STATE.layoutMode === "box" || STATE.layoutMode === "all") {
      layer(r.left - ml, r.top - mt, r.width + ml + mr, r.height + mt + mb, "rgba(232,184,74,0.22)");
      layer(r.left, r.top, r.width, r.height, "rgba(110,104,227,0.12)", "1px solid #6e68e3");
      layer(r.left + pl, r.top + pt, r.width - pl - pr, r.height - pt - pb, "rgba(62,207,142,0.18)");
      const label = document.createElement("div");
      Object.assign(label.style, {
        position: "fixed",
        left: Math.max(4, r.left) + "px",
        top: Math.max(4, r.top - 22) + "px",
        padding: "2px 6px",
        borderRadius: "4px",
        background: "#6e68e3",
        color: "#fff",
        fontSize: "10px",
        fontWeight: "600",
        fontFamily: '"SF Mono", ui-monospace, Menlo, monospace',
        whiteSpace: "nowrap",
      });
      label.textContent = `${Math.round(r.width)}×${Math.round(r.height)} · ${cs.display}`;
      box.appendChild(label);
    }

    if (
      (STATE.layoutMode === "flex" || STATE.layoutMode === "all") &&
      (cs.display.includes("flex") || cs.display === "inline-flex")
    ) {
      const kids = [...el.children].filter((c) => c.nodeType === 1);
      kids.forEach((kid, i) => {
        const kr = kid.getBoundingClientRect();
        const d = layer(kr.left, kr.top, kr.width, kr.height, "rgba(110,104,227,0.08)", "1px dashed #817cf0");
        const n = document.createElement("div");
        Object.assign(n.style, {
          position: "absolute",
          top: "2px",
          left: "2px",
          fontSize: "9px",
          background: "#6e68e3",
          color: "#fff",
          padding: "0 4px",
          borderRadius: "3px",
        });
        n.textContent = String(i + 1);
        d.style.position = "fixed";
        box.appendChild(n);
        n.style.position = "fixed";
        n.style.left = kr.left + 2 + "px";
        n.style.top = kr.top + 2 + "px";
      });
      const meta = document.createElement("div");
      Object.assign(meta.style, {
        position: "fixed",
        left: Math.max(4, r.left) + "px",
        top: Math.min(window.innerHeight - 28, r.bottom + 4) + "px",
        padding: "3px 8px",
        borderRadius: "4px",
        background: "rgba(22,26,34,0.95)",
        border: "1px solid #2a3140",
        color: "#e8eaed",
        fontSize: "10px",
        fontFamily: '"SF Mono", ui-monospace, Menlo, monospace',
      });
      meta.textContent = `flex ${cs.flexDirection} · ${cs.justifyContent}/${cs.alignItems} · gap ${cs.gap}`;
      box.appendChild(meta);
    }

    if (
      (STATE.layoutMode === "grid" || STATE.layoutMode === "all") &&
      (cs.display.includes("grid") || cs.display === "inline-grid")
    ) {
      layer(r.left, r.top, r.width, r.height, "transparent", "2px solid #3ecf8e");
      const meta = document.createElement("div");
      Object.assign(meta.style, {
        position: "fixed",
        left: Math.max(4, r.left) + "px",
        top: Math.min(window.innerHeight - 28, r.bottom + 4) + "px",
        padding: "3px 8px",
        borderRadius: "4px",
        background: "rgba(22,26,34,0.95)",
        border: "1px solid #2a3140",
        color: "#e8eaed",
        fontSize: "10px",
        fontFamily: '"SF Mono", ui-monospace, Menlo, monospace',
        maxWidth: "70vw",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });
      meta.textContent = `grid cols: ${cs.gridTemplateColumns}`;
      box.appendChild(meta);
    }
  }

  function stopInteractiveProModes() {
    STATE.layoutLocked = false;
    stopLayoutOverlay();
    stopFontChanger();
    stopMoveMode();
    stopDeleteMode();
    stopImageReplace();
    stopExportPick();
  }

  // ——— Font changer ———
  function startFontChanger() {
    stopInteractiveProModes();
    stopMeasure();
    stopInspect();
    STATE.fontChanger = true;
    ensureOverlayRoot();
    showPageHint(NS + "-font-hint", "Click an element to restyle its font · Esc to stop");
    document.addEventListener("mousemove", onFontMove, true);
    document.addEventListener("click", onFontClick, true);
    document.addEventListener("keydown", onFontKey, true);
  }

  function onFontMove(e) {
    if (!STATE.fontChanger) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isDtNode(el)) return;
    placeHighlight(el);
  }

  function onFontClick(e) {
    if (!STATE.fontChanger) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isDtNode(el)) return;
    STATE.fontTarget = el;
    placeHighlight(el);
    const cs = getComputedStyle(el);
    chrome.runtime
      .sendMessage({
        type: "DT_FONT_TARGET",
        payload: {
          selector: cssPath(el),
          tag: describeElement(el),
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight,
          letterSpacing: cs.letterSpacing,
          color: cs.color,
        },
      })
      .catch(() => {});
  }

  function onFontKey(e) {
    if (e.key === "Escape" && STATE.fontChanger) {
      e.preventDefault();
      stopFontChanger();
      chrome.runtime.sendMessage({ type: "DT_FONT_STOPPED" }).catch(() => {});
    }
  }

  function applyFontChange(opts) {
    const el = STATE.fontTarget;
    if (!el) return { ok: false, error: "No element selected" };
    if (!el.__dtFontOrig) {
      el.__dtFontOrig = {
        fontFamily: el.style.fontFamily,
        fontSize: el.style.fontSize,
        fontWeight: el.style.fontWeight,
        lineHeight: el.style.lineHeight,
        letterSpacing: el.style.letterSpacing,
        color: el.style.color,
      };
    }
    if (opts.fontFamily != null) el.style.fontFamily = opts.fontFamily;
    if (opts.fontSize != null) el.style.fontSize = opts.fontSize;
    if (opts.fontWeight != null) el.style.fontWeight = opts.fontWeight;
    if (opts.lineHeight != null) el.style.lineHeight = opts.lineHeight;
    if (opts.letterSpacing != null) el.style.letterSpacing = opts.letterSpacing;
    if (opts.color != null) el.style.color = opts.color;
    placeHighlight(el);
    return { ok: true };
  }

  function restoreFontTarget() {
    const el = STATE.fontTarget;
    if (el?.__dtFontOrig) {
      const o = el.__dtFontOrig;
      el.style.fontFamily = o.fontFamily;
      el.style.fontSize = o.fontSize;
      el.style.fontWeight = o.fontWeight;
      el.style.lineHeight = o.lineHeight;
      el.style.letterSpacing = o.letterSpacing;
      el.style.color = o.color;
      delete el.__dtFontOrig;
    }
  }

  function stopFontChanger() {
    STATE.fontChanger = false;
    document.removeEventListener("mousemove", onFontMove, true);
    document.removeEventListener("click", onFontClick, true);
    document.removeEventListener("keydown", onFontKey, true);
    clearPageHint(NS + "-font-hint");
    if (STATE.proHighlight) STATE.proHighlight.style.display = "none";
    if (!hasActiveProMode() && !STATE.measure && !STATE.inspect && !STATE.liveText && !STATE.outline) {
      removeRoot();
    }
  }

  // ——— Move / delete ———
  function startMoveMode() {
    stopInteractiveProModes();
    stopMeasure();
    stopInspect();
    STATE.moveMode = true;
    STATE.moveEl = null;
    ensureOverlayRoot();
    showPageHint(NS + "-move-hint", "Click element, then drag to move · Esc to stop");
    document.addEventListener("mousemove", onMoveHover, true);
    document.addEventListener("mousedown", onMoveDown, true);
    document.addEventListener("keydown", onMoveKey, true);
  }

  function onMoveHover(e) {
    if (!STATE.moveMode || STATE.moveDragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isDtNode(el)) return;
    placeHighlight(el);
  }

  function onMoveDown(e) {
    if (!STATE.moveMode || e.button !== 0) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isDtNode(el)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    STATE.moveEl = el;
    if (!el.__dtMoveOrig) {
      const cs = getComputedStyle(el);
      el.__dtMoveOrig = {
        position: el.style.position,
        left: el.style.left,
        top: el.style.top,
        right: el.style.right,
        bottom: el.style.bottom,
        transform: el.style.transform,
        zIndex: el.style.zIndex,
        width: el.style.width,
        computedPosition: cs.position,
      };
    }
    const r = el.getBoundingClientRect();
    if (getComputedStyle(el).position === "static") {
      el.style.position = "relative";
    }
    el.style.zIndex = "2147483000";
    STATE.moveDragging = true;
    STATE.moveOffset = { x: e.clientX - r.left, y: e.clientY - r.top };
    STATE.moveStartLeft = parseFloat(el.style.left) || 0;
    STATE.moveStartTop = parseFloat(el.style.top) || 0;
    STATE.movePointer = { x: e.clientX, y: e.clientY };
    window.addEventListener("mousemove", onMoveDrag, true);
    window.addEventListener("mouseup", onMoveUp, true);
    placeHighlight(el);
  }

  function onMoveDrag(e) {
    if (!STATE.moveDragging || !STATE.moveEl) return;
    const el = STATE.moveEl;
    const dx = e.clientX - STATE.movePointer.x;
    const dy = e.clientY - STATE.movePointer.y;
    el.style.left = STATE.moveStartLeft + dx + "px";
    el.style.top = STATE.moveStartTop + dy + "px";
    placeHighlight(el);
  }

  function onMoveUp() {
    STATE.moveDragging = false;
    window.removeEventListener("mousemove", onMoveDrag, true);
    window.removeEventListener("mouseup", onMoveUp, true);
    if (STATE.moveEl) {
      chrome.runtime
        .sendMessage({
          type: "DT_MOVE_DONE",
          payload: { selector: cssPath(STATE.moveEl), tag: describeElement(STATE.moveEl) },
        })
        .catch(() => {});
    }
  }

  function onMoveKey(e) {
    if (e.key === "Escape" && STATE.moveMode) {
      e.preventDefault();
      stopMoveMode();
      chrome.runtime.sendMessage({ type: "DT_MOVE_STOPPED" }).catch(() => {});
    }
  }

  function undoMove() {
    const el = STATE.moveEl;
    if (el?.__dtMoveOrig) {
      const o = el.__dtMoveOrig;
      el.style.position = o.position;
      el.style.left = o.left;
      el.style.top = o.top;
      el.style.right = o.right;
      el.style.bottom = o.bottom;
      el.style.transform = o.transform;
      el.style.zIndex = o.zIndex;
      el.style.width = o.width;
      delete el.__dtMoveOrig;
    }
    return { ok: true };
  }

  function stopMoveMode() {
    STATE.moveMode = false;
    STATE.moveDragging = false;
    document.removeEventListener("mousemove", onMoveHover, true);
    document.removeEventListener("mousedown", onMoveDown, true);
    document.removeEventListener("keydown", onMoveKey, true);
    window.removeEventListener("mousemove", onMoveDrag, true);
    window.removeEventListener("mouseup", onMoveUp, true);
    clearPageHint(NS + "-move-hint");
    if (STATE.proHighlight) STATE.proHighlight.style.display = "none";
  }

  function startDeleteMode() {
    stopInteractiveProModes();
    stopMeasure();
    stopInspect();
    STATE.deleteMode = true;
    if (!STATE.deletedEls) STATE.deletedEls = [];
    ensureOverlayRoot();
    showPageHint(NS + "-del-hint", "Click to hide element · Esc to stop");
    document.addEventListener("mousemove", onDelMove, true);
    document.addEventListener("click", onDelClick, true);
    document.addEventListener("keydown", onDelKey, true);
  }

  function onDelMove(e) {
    if (!STATE.deleteMode) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isDtNode(el)) return;
    placeHighlight(el);
  }

  function onDelClick(e) {
    if (!STATE.deleteMode) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isDtNode(el) || el === document.body || el === document.documentElement) return;
    STATE.deletedEls.push({ el, display: el.style.display });
    el.style.display = "none";
    chrome.runtime
      .sendMessage({
        type: "DT_DELETE_DONE",
        payload: { selector: cssPath(el), tag: describeElement(el), count: STATE.deletedEls.length },
      })
      .catch(() => {});
  }

  function onDelKey(e) {
    if (e.key === "Escape" && STATE.deleteMode) {
      e.preventDefault();
      stopDeleteMode();
      chrome.runtime.sendMessage({ type: "DT_DELETE_STOPPED" }).catch(() => {});
    }
  }

  function restoreDeleted() {
    const list = STATE.deletedEls || [];
    for (const item of list) {
      try {
        item.el.style.display = item.display;
      } catch (_) {}
    }
    STATE.deletedEls = [];
    return { ok: true };
  }

  function stopDeleteMode() {
    STATE.deleteMode = false;
    document.removeEventListener("mousemove", onDelMove, true);
    document.removeEventListener("click", onDelClick, true);
    document.removeEventListener("keydown", onDelKey, true);
    clearPageHint(NS + "-del-hint");
    if (STATE.proHighlight) STATE.proHighlight.style.display = "none";
  }

  // ——— Image replace ———
  function startImageReplace() {
    stopInteractiveProModes();
    stopMeasure();
    stopInspect();
    STATE.imageReplace = true;
    ensureOverlayRoot();
    showPageHint(NS + "-img-hint", "Click an image (or element with background-image) · Esc");
    document.addEventListener("mousemove", onImgMove, true);
    document.addEventListener("click", onImgClick, true);
    document.addEventListener("keydown", onImgKey, true);
  }

  function findImageTarget(el) {
    let cur = el;
    while (cur && cur !== document.body) {
      if (cur.tagName === "IMG" || cur.tagName === "PICTURE" || cur.tagName === "SVG" || cur.tagName === "VIDEO") {
        return cur.tagName === "PICTURE" ? cur.querySelector("img") || cur : cur;
      }
      const bg = getComputedStyle(cur).backgroundImage;
      if (bg && bg !== "none" && /url\(/i.test(bg)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function onImgMove(e) {
    if (!STATE.imageReplace) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isDtNode(el)) return;
    const target = findImageTarget(el) || el;
    placeHighlight(target);
  }

  function onImgClick(e) {
    if (!STATE.imageReplace) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isDtNode(el)) return;
    const target = findImageTarget(el);
    if (!target) {
      chrome.runtime
        .sendMessage({ type: "DT_IMAGE_TARGET", payload: { ok: false, error: "Not an image target" } })
        .catch(() => {});
      return;
    }
    STATE.imageTarget = target;
    placeHighlight(target);
    const payload = {
      ok: true,
      tag: describeElement(target),
      selector: cssPath(target),
      isImg: target.tagName === "IMG",
      src: target.tagName === "IMG" ? target.currentSrc || target.src : null,
      bg: target.tagName !== "IMG" ? getComputedStyle(target).backgroundImage : null,
      width: target.naturalWidth || Math.round(target.getBoundingClientRect().width),
      height: target.naturalHeight || Math.round(target.getBoundingClientRect().height),
    };
    chrome.runtime.sendMessage({ type: "DT_IMAGE_TARGET", payload }).catch(() => {});
  }

  function onImgKey(e) {
    if (e.key === "Escape" && STATE.imageReplace) {
      e.preventDefault();
      stopImageReplace();
      chrome.runtime.sendMessage({ type: "DT_IMAGE_STOPPED" }).catch(() => {});
    }
  }

  function replaceImage(url) {
    const el = STATE.imageTarget;
    if (!el) return { ok: false, error: "No image selected" };
    if (!url) return { ok: false, error: "No URL" };
    if (!el.__dtImgOrig) {
      if (el.tagName === "IMG") {
        el.__dtImgOrig = { src: el.getAttribute("src"), srcset: el.getAttribute("srcset") };
      } else {
        el.__dtImgOrig = { backgroundImage: el.style.backgroundImage };
      }
    }
    if (el.tagName === "IMG") {
      el.removeAttribute("srcset");
      el.src = url;
    } else {
      el.style.backgroundImage = `url("${url.replace(/"/g, '\\"')}")`;
      el.style.backgroundSize = el.style.backgroundSize || "cover";
      el.style.backgroundPosition = el.style.backgroundPosition || "center";
    }
    placeHighlight(el);
    return { ok: true };
  }

  function restoreImage() {
    const el = STATE.imageTarget;
    if (el?.__dtImgOrig) {
      if (el.tagName === "IMG") {
        if (el.__dtImgOrig.src != null) el.setAttribute("src", el.__dtImgOrig.src);
        if (el.__dtImgOrig.srcset != null) el.setAttribute("srcset", el.__dtImgOrig.srcset);
        else el.removeAttribute("srcset");
      } else {
        el.style.backgroundImage = el.__dtImgOrig.backgroundImage;
      }
      delete el.__dtImgOrig;
    }
    return { ok: true };
  }

  function stopImageReplace() {
    STATE.imageReplace = false;
    document.removeEventListener("mousemove", onImgMove, true);
    document.removeEventListener("click", onImgClick, true);
    document.removeEventListener("keydown", onImgKey, true);
    clearPageHint(NS + "-img-hint");
    if (STATE.proHighlight) STATE.proHighlight.style.display = "none";
  }

  // ——— Dark mode ———
  function getDarkModeStyle() {
    return `
html[data-dt-dark="1"] {
  color-scheme: dark !important;
}
html[data-dt-dark="1"] img,
html[data-dt-dark="1"] video,
html[data-dt-dark="1"] picture,
html[data-dt-dark="1"] canvas,
html[data-dt-dark="1"] svg,
html[data-dt-dark="1"] iframe {
  filter: invert(1) hue-rotate(180deg) !important;
}
html[data-dt-dark="1"] {
  filter: invert(1) hue-rotate(180deg) !important;
  background: #111 !important;
}
`;
  }

  function setDarkMode(on) {
    let style = document.getElementById(NS + "-dark-style");
    if (on) {
      if (!style) {
        style = document.createElement("style");
        style.id = NS + "-dark-style";
        style.setAttribute("data-dt", "1");
        style.textContent = getDarkModeStyle();
        document.documentElement.appendChild(style);
      }
      document.documentElement.setAttribute("data-dt-dark", "1");
      STATE.darkMode = true;
    } else {
      document.documentElement.removeAttribute("data-dt-dark");
      if (style) style.remove();
      STATE.darkMode = false;
    }
    return { ok: true, on: !!STATE.darkMode, host: location.host };
  }

  function getDarkModeState() {
    return {
      ok: true,
      on: document.documentElement.getAttribute("data-dt-dark") === "1",
      host: location.host,
    };
  }

  // ——— PDF / print ———
  function preparePrint() {
    window.print();
    return { ok: true };
  }

  function exportPageHtml() {
    const html = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
    return {
      ok: true,
      html,
      title: document.title || "page",
      url: location.href,
    };
  }

  // ——— Export element ———
  function startExportPick() {
    stopInteractiveProModes();
    stopMeasure();
    stopInspect();
    STATE.exportPick = true;
    ensureOverlayRoot();
    showPageHint(NS + "-export-hint", "Click an element to export HTML + CSS · Esc");
    document.addEventListener("mousemove", onExportMove, true);
    document.addEventListener("click", onExportClick, true);
    document.addEventListener("keydown", onExportKey, true);
  }

  function onExportMove(e) {
    if (!STATE.exportPick) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isDtNode(el)) return;
    placeHighlight(el);
  }

  function collectRelevantCss(el) {
    const props = [
      "display", "position", "top", "right", "bottom", "left", "width", "height",
      "min-width", "min-height", "max-width", "max-height", "margin", "padding",
      "border", "border-radius", "background", "background-color", "background-image",
      "color", "font-family", "font-size", "font-weight", "line-height", "letter-spacing",
      "text-align", "text-decoration", "text-transform", "white-space", "overflow",
      "flex", "flex-direction", "flex-wrap", "align-items", "justify-content", "gap",
      "grid-template-columns", "grid-template-rows", "box-shadow", "opacity", "transform",
      "z-index", "object-fit", "cursor",
    ];
    const cs = getComputedStyle(el);
    const lines = [];
    for (const p of props) {
      const v = cs.getPropertyValue(p);
      if (!v || v === "none" || v === "normal" || v === "auto" || v === "static" || v === "visible" || v === "rgba(0, 0, 0, 0)") continue;
      if (p === "width" || p === "height") {
        lines.push(`  ${p}: ${Math.round(parseFloat(v))}px;`);
      } else {
        lines.push(`  ${p}: ${v};`);
      }
    }
    return lines.join("\n");
  }

  function buildExportPayload(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("[data-dt], #" + NS + "-root").forEach((n) => n.remove());
    const html = el.outerHTML;
    const css = collectRelevantCss(el);
    const selector = cssPath(el);
    const snippet = `/* ${selector} */\n${selector} {\n${css}\n}\n\n<!-- HTML -->\n${html}`;
    return {
      selector,
      tag: describeElement(el),
      html,
      css,
      snippet,
      box: {
        width: Math.round(el.getBoundingClientRect().width),
        height: Math.round(el.getBoundingClientRect().height),
      },
    };
  }

  function onExportClick(e) {
    if (!STATE.exportPick) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isDtNode(el)) return;
    placeHighlight(el);
    const payload = buildExportPayload(el);
    chrome.runtime.sendMessage({ type: "DT_EXPORT_RESULT", payload }).catch(() => {});
  }

  function onExportKey(e) {
    if (e.key === "Escape" && STATE.exportPick) {
      e.preventDefault();
      stopExportPick();
      chrome.runtime.sendMessage({ type: "DT_EXPORT_STOPPED" }).catch(() => {});
    }
  }

  function stopExportPick() {
    STATE.exportPick = false;
    document.removeEventListener("mousemove", onExportMove, true);
    document.removeEventListener("click", onExportClick, true);
    document.removeEventListener("keydown", onExportKey, true);
    clearPageHint(NS + "-export-hint");
    if (STATE.proHighlight) STATE.proHighlight.style.display = "none";
  }

  // ——— Responsive metrics ———
  function getViewportInfo() {
    return {
      ok: true,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      dpr: window.devicePixelRatio || 1,
      host: location.host,
      url: location.href,
      title: document.title,
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return;

    if (msg.type === "DT_PING") {
      sendResponse({
        ok: true,
        measure: STATE.measure,
        inspect: STATE.inspect,
        liveText: STATE.liveText,
        outline: STATE.outline,
        layoutOverlay: STATE.layoutOverlay,
        fontChanger: STATE.fontChanger,
        moveMode: STATE.moveMode,
        deleteMode: STATE.deleteMode,
        imageReplace: STATE.imageReplace,
        darkMode: STATE.darkMode,
        exportPick: STATE.exportPick,
      });
      return true;
    }

    if (msg.type === "DT_MEASURE_START") {
      startMeasure();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_MEASURE_STOP") {
      stopMeasure();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_INSPECT_START") {
      startInspect();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_INSPECT_STOP") {
      stopInspect();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_DETECT_STACK") {
      try {
        sendResponse({ ok: true, data: detectStack() });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
      return true;
    }
    if (msg.type === "DT_EXTRACT_COLORS") {
      try {
        sendResponse({ ok: true, data: extractColors() });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
      return true;
    }
    if (msg.type === "DT_LIST_FONTS") {
      try {
        sendResponse({ ok: true, data: extractFonts() });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
      return true;
    }
    if (msg.type === "DT_LIVE_TEXT_START") {
      startLiveText();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_LIVE_TEXT_STOP") {
      stopLiveText(msg.restore !== false);
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_OUTLINE_START") {
      startOutline(msg.mode || "all");
      sendResponse({ ok: true, mode: STATE.outlineMode });
      return true;
    }
    if (msg.type === "DT_OUTLINE_STOP") {
      stopOutline();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_EXTRACT_IMAGES") {
      try {
        sendResponse({ ok: true, data: extractImages() });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
      return true;
    }
    if (msg.type === "DT_A11Y_SCAN") {
      try {
        sendResponse({ ok: true, data: scanA11y() });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
      return true;
    }
    if (msg.type === "DT_PAGE_METRICS") {
      sendResponse({ ok: true, data: pageMetrics() });
      return true;
    }
    if (msg.type === "DT_SCROLL_TO") {
      window.scrollTo(msg.x || 0, msg.y || 0);
      sendResponse({ ok: true, scrollY: window.scrollY, scrollX: window.scrollX });
      return true;
    }

    if (msg.type === "DT_LAYOUT_START") {
      startLayoutOverlay(msg.mode || "box");
      sendResponse({ ok: true, mode: STATE.layoutMode });
      return true;
    }
    if (msg.type === "DT_LAYOUT_STOP") {
      stopLayoutOverlay();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_FONT_START") {
      startFontChanger();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_FONT_STOP") {
      stopFontChanger();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_FONT_APPLY") {
      sendResponse(applyFontChange(msg));
      return true;
    }
    if (msg.type === "DT_FONT_RESTORE") {
      restoreFontTarget();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_MOVE_START") {
      startMoveMode();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_MOVE_STOP") {
      stopMoveMode();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_MOVE_UNDO") {
      sendResponse(undoMove());
      return true;
    }
    if (msg.type === "DT_DELETE_START") {
      startDeleteMode();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_DELETE_STOP") {
      stopDeleteMode();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_DELETE_RESTORE") {
      sendResponse(restoreDeleted());
      return true;
    }
    if (msg.type === "DT_IMAGE_START") {
      startImageReplace();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_IMAGE_STOP") {
      stopImageReplace();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_IMAGE_REPLACE") {
      sendResponse(replaceImage(msg.url));
      return true;
    }
    if (msg.type === "DT_IMAGE_RESTORE") {
      sendResponse(restoreImage());
      return true;
    }
    if (msg.type === "DT_DARK_SET") {
      sendResponse(setDarkMode(!!msg.on));
      return true;
    }
    if (msg.type === "DT_DARK_GET") {
      sendResponse(getDarkModeState());
      return true;
    }
    if (msg.type === "DT_PDF_PRINT") {
      sendResponse(preparePrint());
      return true;
    }
    if (msg.type === "DT_PAGE_HTML") {
      try {
        sendResponse(exportPageHtml());
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
      return true;
    }
    if (msg.type === "DT_EXPORT_START") {
      startExportPick();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_EXPORT_STOP") {
      stopExportPick();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DT_VIEWPORT_INFO") {
      sendResponse(getViewportInfo());
      return true;
    }

    if (msg.type === "DT_STOP_ALL") {
      api.stopAll();
      sendResponse({ ok: true });
      return true;
    }
  });
})();
