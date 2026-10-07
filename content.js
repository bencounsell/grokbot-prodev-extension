/**
 * Dev Toolbox — content script (injected on demand)
 * Modes: measure, inspect, live text, outliner; extract colors/fonts/images/a11y/stack.
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
  };

  const api = {
    ready: true,
    stopAll() {
      stopMeasure();
      stopInspect();
      stopLiveText(true);
      stopOutline();
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

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return;

    if (msg.type === "DT_PING") {
      sendResponse({
        ok: true,
        measure: STATE.measure,
        inspect: STATE.inspect,
        liveText: STATE.liveText,
        outline: STATE.outline,
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
    if (msg.type === "DT_STOP_ALL") {
      api.stopAll();
      sendResponse({ ok: true });
      return true;
    }
  });
})();
