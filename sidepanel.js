/**
 * Dev Toolbox — side panel UI (v0.3 free-set: 11 tools)
 */

function isMacPlatform() {
  const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  const ua = navigator.userAgent || "";
  return /Mac|iPhone|iPad|iPod/i.test(p) || /Mac OS X/i.test(ua);
}

function applyShortcutLabels() {
  const mac = isMacPlatform();
  const palette = mac ? "⌘K" : "Ctrl+K";
  const open = mac ? "⌘⇧D" : "Ctrl+Shift+D";
  const elPalette = document.getElementById("kbd-palette");
  const elHintPalette = document.getElementById("kbd-hint-palette");
  const elHintOpen = document.getElementById("kbd-hint-open");
  const btn = document.getElementById("btn-palette");
  if (elPalette) elPalette.textContent = palette;
  if (elHintPalette) elHintPalette.textContent = palette;
  if (elHintOpen) elHintOpen.textContent = open;
  if (btn) btn.title = `Command palette (${palette})`;
}



(() => {
  "use strict";

  const TOOLS = [
    {
      id: "color",
      name: "Color picker",
      desc: "EyeDropper · history · HEX/RGB/HSL",
      icon: "🎨",
      keywords: "color colour hex rgb hsl eyedropper picker swatch history",
    },
    {
      id: "pagepalette",
      name: "Palette",
      desc: "Extract page colors · copy HEX",
      icon: "🌈",
      keywords: "palette colors extract dominant swatch hex page",
    },
    {
      id: "fonts",
      name: "List fonts",
      desc: "Fonts used on the page",
      icon: "🔤",
      keywords: "fonts typography font-family typeface stack",
    },
    {
      id: "livetext",
      name: "Live text",
      desc: "Edit page text in-place",
      icon: "✏️",
      keywords: "live text edit contenteditable copy rewrite",
    },
    {
      id: "outliner",
      name: "Outliner",
      desc: "Outline elements · headings · interactive",
      icon: "▦",
      keywords: "outline outliner box model headings interactive overlay",
    },
    {
      id: "images",
      name: "Extract images",
      desc: "img · srcset · backgrounds",
      icon: "🖼️",
      keywords: "images extract img srcset background download",
    },
    {
      id: "json",
      name: "JSON",
      desc: "Format · minify · validate",
      icon: "{ }",
      keywords: "json format pretty minify validate parse",
    },
    {
      id: "a11y",
      name: "A11y check",
      desc: "Alt · labels · contrast heuristics",
      icon: "♿",
      keywords: "a11y accessibility alt contrast label wcag",
    },
    {
      id: "ruler",
      name: "Ruler / measure",
      desc: "Click-drag distance on page",
      icon: "📏",
      keywords: "ruler measure dimension size width height px distance delta",
    },
    {
      id: "css",
      name: "CSS inspect",
      desc: "Click element · computed styles",
      icon: "🧬",
      keywords: "css inspect computed styles selector element pick",
    },
    {
      id: "screenshot",
      name: "Screenshot",
      desc: "Visible · selection crop · full page",
      icon: "📷",
      keywords: "screenshot capture tab image png crop full page",
    },
    {
      id: "stack",
      name: "Site stack",
      desc: "Detect frameworks & libraries",
      icon: "🧱",
      keywords: "stack tech technology framework library cms analytics",
    },
  ];

  const COLOR_HISTORY_KEY = "colorHistory";
  const COLOR_HISTORY_MAX = 14;
  const IMPORTANT_STYLE_PROPS = [
    "display",
    "position",
    "width",
    "height",
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
    "flex-direction",
    "align-items",
    "justify-content",
    "gap",
    "overflow",
    "opacity",
    "z-index",
    "box-shadow",
    "transform",
  ];

  const els = {
    btnHome: document.getElementById("btn-home"),
    btnPalette: document.getElementById("btn-palette"),
    headerTitle: document.getElementById("header-title"),
    headerSub: document.getElementById("header-sub"),
    viewHome: document.getElementById("view-home"),
    viewTool: document.getElementById("view-tool"),
    toolList: document.getElementById("tool-list"),
    toolMount: document.getElementById("tool-mount"),
    palette: document.getElementById("palette"),
    paletteBackdrop: document.getElementById("palette-backdrop"),
    paletteInput: document.getElementById("palette-input"),
    paletteResults: document.getElementById("palette-results"),
  };

  let activeToolId = null;
  let paletteIndex = 0;
  let paletteFiltered = [...TOOLS];
  let toolCleanup = null;

  // ——— Helpers ———
  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied " + (label || text));
      return true;
    } catch {
      toast("Copy failed");
      return false;
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isRestrictedUrl(url) {
    if (!url) return true;
    return /^(chrome|chrome-extension|devtools|edge|about|view-source):/i.test(
      url
    );
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab || null;
  }

  async function sendToTab(payload) {
    const res = await chrome.runtime.sendMessage({
      type: "DT_TAB_MESSAGE",
      payload,
    });
    return res;
  }

  async function ensureCs() {
    return chrome.runtime.sendMessage({ type: "DT_ENSURE_CS" });
  }

  // ——— Color utils ———
  function normalizeHex(v) {
    let s = String(v).trim();
    if (!s.startsWith("#")) s = "#" + s;
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(s)) return null;
    return s.toLowerCase();
  }

  function hexToRgb(hex) {
    const n = normalizeHex(hex);
    if (!n) return null;
    return {
      r: parseInt(n.slice(1, 3), 16),
      g: parseInt(n.slice(3, 5), 16),
      b: parseInt(n.slice(5, 7), 16),
    };
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        default:
          h = ((r - g) / d + 4) / 6;
      }
    }
    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  function formatRgb(rgb) {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }

  function formatHsl(hsl) {
    return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
  }

  // ——— Navigation ———
  function runCleanup() {
    if (typeof toolCleanup === "function") {
      try {
        toolCleanup();
      } catch (_) {}
    }
    toolCleanup = null;
  }

  function showHome() {
    runCleanup();
    activeToolId = null;
    els.viewHome.hidden = false;
    els.viewTool.hidden = true;
    els.btnHome.hidden = true;
    els.headerTitle.textContent = "Dev Toolbox";
    els.headerSub.textContent = "12 tools · free set";
    renderToolList();
    chrome.storage.local.set({ lastTool: null }).catch(() => {});
  }

  function openTool(id) {
    const tool = TOOLS.find((t) => t.id === id);
    if (!tool) return;
    runCleanup();
    activeToolId = id;
    els.viewHome.hidden = true;
    els.viewTool.hidden = false;
    els.btnHome.hidden = false;
    els.headerTitle.textContent = tool.name;
    els.headerSub.textContent = tool.desc;
    els.toolMount.innerHTML = "";
    const render = TOOL_RENDERERS[id];
    if (render) {
      const cleanup = render(els.toolMount);
      if (typeof cleanup === "function") toolCleanup = cleanup;
    }
    chrome.storage.local.set({ lastTool: id }).catch(() => {});
    closePalette();
  }

  function renderToolList() {
    els.toolList.innerHTML = "";
    TOOLS.forEach((tool) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tool-row" + (activeToolId === tool.id ? " active" : "");
      btn.setAttribute("role", "listitem");
      btn.innerHTML = `
        <span class="tool-icon" aria-hidden="true">${tool.icon}</span>
        <span class="tool-meta">
          <span class="tool-name">${escapeHtml(tool.name)}</span>
          <span class="tool-desc">${escapeHtml(tool.desc)}</span>
        </span>
        <svg class="tool-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
      btn.addEventListener("click", () => openTool(tool.id));
      els.toolList.appendChild(btn);
    });
  }

  // ——— Command palette ———
  function openPalette() {
    els.palette.hidden = false;
    els.paletteInput.value = "";
    paletteFiltered = [...TOOLS];
    paletteIndex = 0;
    renderPaletteResults();
    requestAnimationFrame(() => els.paletteInput.focus());
  }

  function closePalette() {
    els.palette.hidden = true;
    els.paletteInput.blur();
  }

  function isPaletteOpen() {
    return !els.palette.hidden;
  }

  function renderPaletteResults() {
    const q = els.paletteInput.value.trim().toLowerCase();
    paletteFiltered = TOOLS.filter((t) => {
      if (!q) return true;
      const hay = `${t.name} ${t.desc} ${t.keywords}`.toLowerCase();
      return hay.includes(q);
    });
    if (paletteIndex >= paletteFiltered.length) paletteIndex = 0;
    if (paletteIndex < 0) paletteIndex = 0;

    els.paletteResults.innerHTML = "";
    if (!paletteFiltered.length) {
      els.paletteResults.innerHTML = `<li class="palette-empty">No tools match “${escapeHtml(q)}”</li>`;
      return;
    }

    paletteFiltered.forEach((tool, i) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === paletteIndex ? "true" : "false");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "palette-item" + (i === paletteIndex ? " active" : "");
      btn.innerHTML = `
        <span class="pi-icon" aria-hidden="true">${tool.icon}</span>
        <span class="tool-meta">
          <span class="pi-name">${escapeHtml(tool.name)}</span>
          <span class="pi-desc">${escapeHtml(tool.desc)}</span>
        </span>`;
      btn.addEventListener("click", () => openTool(tool.id));
      btn.addEventListener("mouseenter", () => {
        paletteIndex = i;
        renderPaletteResults();
      });
      li.appendChild(btn);
      els.paletteResults.appendChild(li);
    });
  }

  // ——— Tools ———
  const TOOL_RENDERERS = {
    color(root) {
      const panel = document.createElement("div");
      panel.className = "panel";
      panel.innerHTML = `
        <p class="panel-title">Current color</p>
        <div class="color-hero">
          <div class="swatch swatch-lg" id="color-swatch" style="background:#6e68e3"></div>
          <div class="color-formats">
            <div class="fmt-row">
              <span class="fmt-label">HEX</span>
              <input class="input input-mono fmt-input" id="color-hex" value="#6e68e3" maxlength="7" spellcheck="false" />
              <button type="button" class="btn btn-sm" data-copy="hex">Copy</button>
            </div>
            <div class="fmt-row">
              <span class="fmt-label">RGB</span>
              <code class="fmt-value" id="color-rgb">rgb(110, 104, 227)</code>
              <button type="button" class="btn btn-sm" data-copy="rgb">Copy</button>
            </div>
            <div class="fmt-row">
              <span class="fmt-label">HSL</span>
              <code class="fmt-value" id="color-hsl">hsl(243, 69%, 65%)</code>
              <button type="button" class="btn btn-sm" data-copy="hsl">Copy</button>
            </div>
          </div>
        </div>
        <div class="field-row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="color-pick">Pick from screen</button>
          <span class="badge" id="color-api-badge">…</span>
        </div>
        <p class="panel-title" style="margin-top:16px">History</p>
        <div class="history-swatches" id="color-history"></div>
        <p class="note" style="margin-top:10px" id="color-note"></p>`;
      root.appendChild(panel);

      const hexInput = panel.querySelector("#color-hex");
      const swatch = panel.querySelector("#color-swatch");
      const rgbEl = panel.querySelector("#color-rgb");
      const hslEl = panel.querySelector("#color-hsl");
      const badge = panel.querySelector("#color-api-badge");
      const note = panel.querySelector("#color-note");
      const historyEl = panel.querySelector("#color-history");
      const hasEye = typeof window.EyeDropper === "function";
      let current = { hex: "#6e68e3", rgb: formatRgb({ r: 110, g: 104, b: 227 }), hsl: formatHsl({ h: 243, s: 69, l: 65 }) };
      let history = [];

      badge.textContent = hasEye ? "EyeDropper API" : "Hex input";
      note.innerHTML = hasEye
        ? "Sample any pixel on screen. Formats update live; history persists in <code class=\"inline-code\">chrome.storage.local</code>."
        : "EyeDropper isn’t available here — enter hex manually. History still persists.";

      function applyHex(raw, { writeInput = false, pushHistory = false } = {}) {
        const n = normalizeHex(raw);
        if (!n) return;
        const rgb = hexToRgb(n);
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        current = { hex: n, rgb: formatRgb(rgb), hsl: formatHsl(hsl) };
        swatch.style.background = n;
        if (writeInput) hexInput.value = n;
        rgbEl.textContent = current.rgb;
        hslEl.textContent = current.hsl;
        if (pushHistory) addToHistory(n);
      }

      function renderHistory() {
        historyEl.innerHTML = "";
        if (!history.length) {
          historyEl.innerHTML = `<div class="empty-inline">No colors yet — pick or enter one</div>`;
          return;
        }
        history.forEach((hex) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "history-swatch";
          b.style.background = hex;
          b.title = hex;
          b.addEventListener("click", () => {
            applyHex(hex, { writeInput: true });
            toast(hex);
          });
          b.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            copyText(hex);
          });
          historyEl.appendChild(b);
        });
      }

      async function loadHistory() {
        try {
          const { colorHistory } = await chrome.storage.local.get(COLOR_HISTORY_KEY);
          history = Array.isArray(colorHistory) ? colorHistory : [];
        } catch {
          history = [];
        }
        renderHistory();
      }

      async function addToHistory(hex) {
        const n = normalizeHex(hex);
        if (!n) return;
        history = [n, ...history.filter((h) => h !== n)].slice(0, COLOR_HISTORY_MAX);
        renderHistory();
        try {
          await chrome.storage.local.set({ [COLOR_HISTORY_KEY]: history });
        } catch (_) {}
      }

      hexInput.addEventListener("input", () => applyHex(hexInput.value));
      hexInput.addEventListener("change", () => {
        applyHex(hexInput.value, { writeInput: true, pushHistory: true });
      });

      panel.querySelectorAll("[data-copy]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const kind = btn.getAttribute("data-copy");
          const val = current[kind];
          if (val) copyText(val, kind.toUpperCase());
        });
      });

      panel.querySelector("#color-pick").addEventListener("click", async () => {
        if (!hasEye) {
          hexInput.focus();
          hexInput.select();
          toast("EyeDropper unavailable — edit hex");
          return;
        }
        try {
          const dropper = new EyeDropper();
          const result = await dropper.open();
          applyHex(result.sRGBHex, { writeInput: true, pushHistory: true });
          toast("Picked " + result.sRGBHex);
        } catch (err) {
          if (err?.name !== "AbortError") toast("Pick cancelled");
        }
      });

      applyHex("#6e68e3", { writeInput: true });
      loadHistory();
    },

    ruler(root) {
      const panel = document.createElement("div");
      panel.className = "panel";
      panel.innerHTML = `
        <p class="panel-title">Page measure</p>
        <div class="status" id="ruler-status">Idle — start measuring on the active tab</div>
        <div class="field-row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="ruler-start">Start measuring</button>
          <button type="button" class="btn" id="ruler-stop" disabled>Stop</button>
        </div>
        <div class="dim-grid" id="ruler-result" style="margin-top:12px">
          <div class="dim-card"><div class="label">Distance</div><div class="value" id="r-dist">—<span class="unit">px</span></div></div>
          <div class="dim-card"><div class="label">ΔX</div><div class="value" id="r-dx">—<span class="unit">px</span></div></div>
          <div class="dim-card"><div class="label">ΔY</div><div class="value" id="r-dy">—<span class="unit">px</span></div></div>
          <div class="dim-card"><div class="label">|ΔX| × |ΔY|</div><div class="value" id="r-box">—</div></div>
        </div>
        <p class="note" style="margin-top:12px">
          Injects a crosshair overlay on the page. Click-drag to measure; Esc or Stop to exit.
          Restricted pages (<code class="inline-code">chrome://</code>, Web Store) can’t be measured.
        </p>`;
      root.appendChild(panel);

      const status = panel.querySelector("#ruler-status");
      const btnStart = panel.querySelector("#ruler-start");
      const btnStop = panel.querySelector("#ruler-stop");
      let measuring = false;

      function setStatus(kind, text) {
        status.className = "status" + (kind ? " " + kind : "");
        status.textContent = text;
      }

      function setMeasuring(on) {
        measuring = on;
        btnStart.disabled = on;
        btnStop.disabled = !on;
      }

      function applyResult(p) {
        panel.querySelector("#r-dist").innerHTML =
          `${p.distance}<span class="unit">px</span>`;
        panel.querySelector("#r-dx").innerHTML =
          `${p.dx}<span class="unit">px</span>`;
        panel.querySelector("#r-dy").innerHTML =
          `${p.dy}<span class="unit">px</span>`;
        panel.querySelector("#r-box").innerHTML =
          `${p.absDx}<span class="unit">×</span>${p.absDy}<span class="unit">px</span>`;
        setStatus("ok", `Measured ${p.distance}px  (ΔX ${p.dx}, ΔY ${p.dy})`);
      }

      const onMsg = (msg) => {
        if (!msg) return;
        if (msg.type === "DT_MEASURE_RESULT" && msg.payload) {
          applyResult(msg.payload);
          toast(`${msg.payload.distance}px`);
        }
        if (msg.type === "DT_MEASURE_STOPPED") {
          setMeasuring(false);
          setStatus("", "Stopped");
        }
      };
      chrome.runtime.onMessage.addListener(onMsg);

      btnStart.addEventListener("click", async () => {
        const tab = await getActiveTab();
        if (!tab) {
          setStatus("err", "No active tab");
          return;
        }
        if (isRestrictedUrl(tab.url)) {
          setStatus("warn", "Can’t measure this page — open a normal https tab");
          return;
        }
        setStatus("", "Injecting measure overlay…");
        const res = await sendToTab({ type: "DT_MEASURE_START" });
        if (!res?.ok) {
          setStatus(
            "err",
            res?.error ||
              "Injection failed — try opening the panel from the toolbar on that tab"
          );
          return;
        }
        setMeasuring(true);
        setStatus("ok", "Measuring — click-drag on the page");
        toast("Measure mode on");
      });

      btnStop.addEventListener("click", async () => {
        await sendToTab({ type: "DT_MEASURE_STOP" });
        setMeasuring(false);
        setStatus("", "Stopped");
      });

      return () => {
        chrome.runtime.onMessage.removeListener(onMsg);
        if (measuring) sendToTab({ type: "DT_MEASURE_STOP" }).catch(() => {});
      };
    },

    css(root) {
      const panel = document.createElement("div");
      panel.className = "panel";
      panel.innerHTML = `
        <p class="panel-title">Element inspect</p>
        <div class="status" id="css-status">Idle — pick an element on the page</div>
        <div class="field-row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="css-pick">Pick element</button>
          <button type="button" class="btn" id="css-stop" disabled>Stop</button>
          <button type="button" class="btn" id="css-copy" disabled>Copy CSS</button>
        </div>
        <div id="css-meta" class="css-meta" hidden>
          <div class="title-line" id="css-sel"></div>
          <div class="url-line" id="css-path"></div>
          <div class="box-chips" id="css-box"></div>
        </div>
        <div class="field" style="margin-top:10px" id="css-filter-wrap" hidden>
          <input class="input" id="css-filter" placeholder="Filter properties…" spellcheck="false" />
        </div>
        <ul class="style-list" id="css-styles" style="margin-top:10px"></ul>
        <p class="note" style="margin-top:12px">
          Highlights on hover; click to lock computed styles into this panel.
        </p>`;
      root.appendChild(panel);

      const status = panel.querySelector("#css-status");
      const btnPick = panel.querySelector("#css-pick");
      const btnStop = panel.querySelector("#css-stop");
      const btnCopy = panel.querySelector("#css-copy");
      const meta = panel.querySelector("#css-meta");
      const list = panel.querySelector("#css-styles");
      const filterWrap = panel.querySelector("#css-filter-wrap");
      const filterInput = panel.querySelector("#css-filter");
      let inspecting = false;
      let lastPayload = null;
      let allStyles = [];

      function setStatus(kind, text) {
        status.className = "status" + (kind ? " " + kind : "");
        status.textContent = text;
      }

      function setInspecting(on) {
        inspecting = on;
        btnPick.disabled = on;
        btnStop.disabled = !on;
      }

      function renderStyles(filter = "") {
        const q = filter.trim().toLowerCase();
        const rows = allStyles.filter(
          ([p]) => !q || p.includes(q) || allStyles.find(([k, v]) => k === p && String(v).toLowerCase().includes(q))
        );
        // Prefer important props first when no filter
        let ordered = rows;
        if (!q) {
          const imp = new Set(IMPORTANT_STYLE_PROPS);
          ordered = [
            ...IMPORTANT_STYLE_PROPS.map((p) => rows.find(([k]) => k === p)).filter(Boolean),
            ...rows.filter(([k]) => !imp.has(k)),
          ];
          // dedupe
          const seen = new Set();
          ordered = ordered.filter(([k]) => {
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        }
        if (!ordered.length) {
          list.innerHTML = `<li class="style-empty">No matching properties</li>`;
          return;
        }
        list.innerHTML = ordered
          .map(
            ([prop, val]) =>
              `<li class="style-row" data-prop="${escapeHtml(prop)}" data-val="${escapeHtml(val)}" title="Click to copy">
                <span class="prop">${escapeHtml(prop)}</span>
                <span class="val">${escapeHtml(val)}</span>
              </li>`
          )
          .join("");
        list.querySelectorAll(".style-row").forEach((li) => {
          li.addEventListener("click", () => {
            copyText(`${li.dataset.prop}: ${li.dataset.val};`);
          });
        });
      }

      function showPayload(p) {
        lastPayload = p;
        meta.hidden = false;
        filterWrap.hidden = false;
        btnCopy.disabled = false;
        panel.querySelector("#css-sel").textContent = p.selector || p.tag;
        panel.querySelector("#css-path").textContent = p.path || "";
        panel.querySelector("#css-box").innerHTML = `
          <span class="chip">${p.box.width}×${p.box.height}px</span>
          <span class="chip">${escapeHtml(p.tag)}</span>
          ${p.id ? `<span class="chip">#${escapeHtml(p.id)}</span>` : ""}`;
        allStyles = Object.entries(p.styles || {});
        renderStyles(filterInput.value);
        setStatus("ok", `Inspected ${p.selector || p.tag}`);
      }

      const onMsg = (msg) => {
        if (!msg) return;
        if (msg.type === "DT_INSPECT_RESULT" && msg.payload) {
          showPayload(msg.payload);
          toast("Element locked");
        }
        if (msg.type === "DT_INSPECT_STOPPED") {
          setInspecting(false);
          setStatus("", "Stopped");
        }
      };
      chrome.runtime.onMessage.addListener(onMsg);

      filterInput.addEventListener("input", () => renderStyles(filterInput.value));

      btnPick.addEventListener("click", async () => {
        const tab = await getActiveTab();
        if (!tab) {
          setStatus("err", "No active tab");
          return;
        }
        if (isRestrictedUrl(tab.url)) {
          setStatus("warn", "Can’t inspect this page — open a normal https tab");
          return;
        }
        setStatus("", "Starting picker…");
        const res = await sendToTab({ type: "DT_INSPECT_START" });
        if (!res?.ok) {
          setStatus("err", res?.error || "Injection failed");
          return;
        }
        setInspecting(true);
        setStatus("ok", "Hover & click an element on the page");
        toast("Inspect mode on");
      });

      btnStop.addEventListener("click", async () => {
        await sendToTab({ type: "DT_INSPECT_STOP" });
        setInspecting(false);
        setStatus("", "Stopped");
      });

      btnCopy.addEventListener("click", () => {
        if (!lastPayload) return;
        const css = Object.entries(lastPayload.styles || {})
          .map(([k, v]) => `  ${k}: ${v};`)
          .join("\n");
        const block = `${lastPayload.selector || lastPayload.tag} {\n${css}\n}`;
        copyText(block, "CSS block");
      });

      list.innerHTML = `<li class="style-empty">Pick an element to see computed styles</li>`;

      return () => {
        chrome.runtime.onMessage.removeListener(onMsg);
        if (inspecting) sendToTab({ type: "DT_INSPECT_STOP" }).catch(() => {});
      };
    },

    screenshot(root) {
      const panel = document.createElement("div");
      panel.className = "panel";
      panel.innerHTML = `
        <p class="panel-title">Capture</p>
        <div class="seg" id="shot-mode" role="tablist">
          <button type="button" class="seg-btn active" data-mode="visible">Visible</button>
          <button type="button" class="seg-btn" data-mode="selection">Selection</button>
          <button type="button" class="seg-btn" data-mode="full">Full page</button>
        </div>
        <div class="status" id="shot-status" style="margin-top:10px">Ready</div>
        <div class="field-row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="shot-capture">Capture</button>
          <button type="button" class="btn" id="shot-download" disabled>Download PNG</button>
          <button type="button" class="btn" id="shot-copy" disabled>Copy image</button>
        </div>
        <p class="note" id="shot-mode-note" style="margin-top:10px"></p>
        <div class="shot-stage" id="shot-stage" style="margin-top:12px">
          <div class="shot-preview" id="shot-preview">
            <div class="shot-empty">No capture yet</div>
          </div>
          <canvas id="shot-crop-canvas" class="shot-crop-canvas" hidden></canvas>
        </div>
        <div class="field-row" id="shot-crop-actions" style="margin-top:8px;gap:8px;flex-wrap:wrap" hidden>
          <button type="button" class="btn btn-primary" id="shot-apply-crop" disabled>Apply crop</button>
          <button type="button" class="btn" id="shot-reset-crop">Reset</button>
          <span class="note" id="shot-crop-hint">Drag on the image to select a region</span>
        </div>`;
      root.appendChild(panel);

      const status = panel.querySelector("#shot-status");
      const preview = panel.querySelector("#shot-preview");
      const canvas = panel.querySelector("#shot-crop-canvas");
      const ctx = canvas.getContext("2d");
      const btnDl = panel.querySelector("#shot-download");
      const btnCopy = panel.querySelector("#shot-copy");
      const btnCapture = panel.querySelector("#shot-capture");
      const cropActions = panel.querySelector("#shot-crop-actions");
      const btnApplyCrop = panel.querySelector("#shot-apply-crop");
      const modeNote = panel.querySelector("#shot-mode-note");
      let mode = "visible";
      let lastDataUrl = null;
      let sourceImg = null;
      let cropRect = null;
      let dragStart = null;

      const MODE_NOTES = {
        visible: "Captures the visible viewport of the active tab.",
        selection:
          "Captures the visible tab, then drag on the preview to crop before download.",
        full:
          "Best-effort scroll-stitch of the page (capped). Fixed headers may duplicate; long pages may be truncated.",
      };
      modeNote.textContent = MODE_NOTES.visible;

      function setStatus(kind, text) {
        status.className = "status" + (kind ? " " + kind : "");
        status.textContent = text;
      }

      function setResult(dataUrl) {
        lastDataUrl = dataUrl;
        btnDl.disabled = !dataUrl;
        btnCopy.disabled = !dataUrl;
      }

      function showPreviewImage(dataUrl) {
        preview.hidden = false;
        canvas.hidden = true;
        cropActions.hidden = true;
        preview.innerHTML = "";
        const img = document.createElement("img");
        img.src = dataUrl;
        img.alt = "Capture";
        preview.appendChild(img);
        setResult(dataUrl);
      }

      function enterCropMode(dataUrl) {
        preview.hidden = true;
        canvas.hidden = false;
        cropActions.hidden = false;
        btnApplyCrop.disabled = true;
        cropRect = null;
        sourceImg = new Image();
        sourceImg.onload = () => {
          const maxW = panel.clientWidth - 26 || 320;
          const scale = Math.min(1, maxW / sourceImg.width);
          canvas.width = Math.round(sourceImg.width * scale);
          canvas.height = Math.round(sourceImg.height * scale);
          canvas._scale = scale;
          canvas._full = sourceImg;
          redrawCrop();
        };
        sourceImg.src = dataUrl;
        setResult(dataUrl);
      }

      function redrawCrop() {
        if (!sourceImg) return;
        const scale = canvas._scale || 1;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(sourceImg, 0, 0, canvas.width, canvas.height);
        if (cropRect) {
          ctx.fillStyle = "rgba(8,10,14,0.45)";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const { x, y, w, h } = cropRect;
          ctx.clearRect(x, y, w, h);
          ctx.drawImage(
            sourceImg,
            x / scale,
            y / scale,
            w / scale,
            h / scale,
            x,
            y,
            w,
            h
          );
          ctx.strokeStyle = "#6e68e3";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
          panel.querySelector("#shot-crop-hint").textContent =
            `${Math.round(w / scale)}×${Math.round(h / scale)}px selected`;
        } else {
          panel.querySelector("#shot-crop-hint").textContent =
            "Drag on the image to select a region";
        }
      }

      canvas.addEventListener("mousedown", (e) => {
        if (canvas.hidden) return;
        const r = canvas.getBoundingClientRect();
        dragStart = {
          x: e.clientX - r.left,
          y: e.clientY - r.top,
        };
        cropRect = { x: dragStart.x, y: dragStart.y, w: 0, h: 0 };
      });
      window.addEventListener("mousemove", onCropMove);
      window.addEventListener("mouseup", onCropUp);

      function onCropMove(e) {
        if (!dragStart || canvas.hidden) return;
        const r = canvas.getBoundingClientRect();
        let x2 = Math.min(canvas.width, Math.max(0, e.clientX - r.left));
        let y2 = Math.min(canvas.height, Math.max(0, e.clientY - r.top));
        const x = Math.min(dragStart.x, x2);
        const y = Math.min(dragStart.y, y2);
        const w = Math.abs(x2 - dragStart.x);
        const h = Math.abs(y2 - dragStart.y);
        cropRect = { x, y, w, h };
        redrawCrop();
        btnApplyCrop.disabled = w < 4 || h < 4;
      }
      function onCropUp() {
        dragStart = null;
      }

      panel.querySelector("#shot-reset-crop").addEventListener("click", () => {
        cropRect = null;
        btnApplyCrop.disabled = true;
        redrawCrop();
        if (sourceImg) setResult(sourceImg.src);
      });

      btnApplyCrop.addEventListener("click", () => {
        if (!cropRect || !sourceImg) return;
        const scale = canvas._scale || 1;
        const sx = Math.round(cropRect.x / scale);
        const sy = Math.round(cropRect.y / scale);
        const sw = Math.round(cropRect.w / scale);
        const sh = Math.round(cropRect.h / scale);
        const out = document.createElement("canvas");
        out.width = sw;
        out.height = sh;
        out.getContext("2d").drawImage(sourceImg, sx, sy, sw, sh, 0, 0, sw, sh);
        const url = out.toDataURL("image/png");
        showPreviewImage(url);
        setStatus("ok", `Cropped ${sw}×${sh}px`);
        toast("Crop applied");
      });

      panel.querySelectorAll(".seg-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          panel.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          mode = btn.dataset.mode;
          modeNote.textContent = MODE_NOTES[mode];
        });
      });

      async function captureVisible() {
        return chrome.tabs.captureVisibleTab(null, { format: "png" });
      }

      function loadImage(dataUrl) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = dataUrl;
        });
      }

      async function captureFullPage() {
        const ensure = await ensureCs();
        if (!ensure?.ok) throw new Error(ensure?.error || "Cannot inject into tab");
        const metricsRes = await sendToTab({ type: "DT_PAGE_METRICS" });
        if (!metricsRes?.ok) throw new Error(metricsRes?.error || "No page metrics");
        const m = metricsRes.data;
        const origY = m.scrollY;
        const vw = m.innerWidth;
        const vh = m.innerHeight;
        const pageH = Math.min(m.pageHeight, vh * 5); // cap ~5 viewports
        const pageW = m.pageWidth;

        await sendToTab({ type: "DT_SCROLL_TO", x: 0, y: 0 });
        await sleep(120);

        const slices = [];
        let y = 0;
        let guard = 0;
        while (y < pageH - 2 && guard < 8) {
          await sendToTab({ type: "DT_SCROLL_TO", x: 0, y });
          await sleep(180);
          const dataUrl = await captureVisible();
          const img = await loadImage(dataUrl);
          slices.push({ img, y });
          y += vh;
          guard++;
          setStatus("", `Stitching… slice ${guard}`);
        }

        await sendToTab({ type: "DT_SCROLL_TO", x: 0, y: origY });

        const dpr = m.dpr || 1;
        const out = document.createElement("canvas");
        const outW = Math.round(vw * dpr);
        const outH = Math.round(Math.min(pageH, slices.length * vh) * dpr);
        out.width = outW;
        out.height = outH;
        const octx = out.getContext("2d");
        octx.fillStyle = "#fff";
        octx.fillRect(0, 0, outW, outH);

        for (const slice of slices) {
          const destY = Math.round(slice.y * dpr);
          const drawH = Math.min(slice.img.height, outH - destY);
          if (drawH <= 0) break;
          octx.drawImage(
            slice.img,
            0,
            0,
            slice.img.width,
            drawH,
            0,
            destY,
            outW,
            drawH
          );
        }

        const truncated = m.pageHeight > pageH;
        return {
          dataUrl: out.toDataURL("image/png"),
          truncated,
          pageH: m.pageHeight,
          capturedH: pageH,
        };
      }

      function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
      }

      btnCapture.addEventListener("click", async () => {
        btnCapture.disabled = true;
        setStatus("", "Capturing…");
        try {
          const tab = await getActiveTab();
          if (tab && isRestrictedUrl(tab.url)) {
            throw new Error("Cannot capture chrome:// or restricted pages");
          }

          if (mode === "visible") {
            const dataUrl = await captureVisible();
            showPreviewImage(dataUrl);
            setStatus("ok", "Captured visible tab");
            toast("Screenshot ready");
          } else if (mode === "selection") {
            const dataUrl = await captureVisible();
            enterCropMode(dataUrl);
            setStatus("ok", "Drag to select a crop region");
            toast("Draw a selection");
          } else {
            setStatus("", "Scrolling & stitching…");
            const result = await captureFullPage();
            showPreviewImage(result.dataUrl);
            if (result.truncated) {
              setStatus(
                "warn",
                `Full page (capped): captured ~${Math.round(result.capturedH)}px of ${Math.round(result.pageH)}px`
              );
            } else {
              setStatus("ok", "Full-page stitch complete");
            }
            toast("Full page ready");
          }
        } catch (err) {
          setResult(null);
          preview.hidden = false;
          canvas.hidden = true;
          cropActions.hidden = true;
          preview.innerHTML = `<div class="shot-empty">Capture failed</div>`;
          const msg = err?.message || String(err);
          if (/permission|activeTab|Cannot access|host|inject/i.test(msg)) {
            setStatus(
              "warn",
              "Needs tab access — open Dev Toolbox from the toolbar on that tab, then retry"
            );
          } else {
            setStatus("err", "Capture failed: " + msg.slice(0, 140));
          }
        } finally {
          btnCapture.disabled = false;
        }
      });

      btnDl.addEventListener("click", () => {
        if (!lastDataUrl) return;
        const a = document.createElement("a");
        a.href = lastDataUrl;
        a.download = `dev-toolbox-${mode}-${Date.now()}.png`;
        a.click();
        toast("Download started");
      });

      btnCopy.addEventListener("click", async () => {
        if (!lastDataUrl) return;
        try {
          const blob = await (await fetch(lastDataUrl)).blob();
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob }),
          ]);
          toast("Image copied");
        } catch {
          toast("Copy image failed — try Download");
        }
      });

      return () => {
        window.removeEventListener("mousemove", onCropMove);
        window.removeEventListener("mouseup", onCropUp);
      };
    },

    async stack(root) {
      const panel = document.createElement("div");
      panel.className = "panel";
      panel.innerHTML = `
        <p class="panel-title">Current tab</p>
        <div id="stack-tab"><div class="status">Loading…</div></div>
        <div class="field-row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="stack-scan">Scan page</button>
          <span class="badge" id="stack-count" hidden></span>
        </div>
        <p class="panel-title" style="margin-top:14px">Findings</p>
        <div id="stack-results">
          <div class="empty-inline">Click Scan to detect frameworks, libraries, and services</div>
        </div>
        <p class="note" style="margin-top:12px">
          Real signals from meta generator, globals, script/stylesheet URLs, and DOM fingerprints.
          Unknowns are omitted rather than faked — empty categories mean nothing matched.
        </p>`;
      root.appendChild(panel);

      const tabBox = panel.querySelector("#stack-tab");
      const results = panel.querySelector("#stack-results");
      const btnScan = panel.querySelector("#stack-scan");
      const countBadge = panel.querySelector("#stack-count");

      const CAT_COLORS = {
        Framework: "#6e68e3",
        Library: "#4285f4",
        CMS: "#e34c26",
        SSG: "#f7df1e",
        Ecommerce: "#96bf48",
        Analytics: "#e8b84a",
        CSS: "#264de4",
        CDN: "#3ecf8e",
        "CDN / Security": "#3ecf8e",
        Payments: "#635bff",
        Support: "#1f8ded",
        Security: "#3ecf8e",
        Markup: "#9aa3b2",
        Build: "#e85d6a",
        Icons: "#f0ad4e",
        Fonts: "#9b59b6",
        PWA: "#5a0fc8",
      };

      function renderFindings(data) {
        const findings = data.findings || [];
        countBadge.hidden = false;
        countBadge.textContent = `${findings.length} signal${findings.length === 1 ? "" : "s"}`;
        if (!findings.length) {
          results.innerHTML = `<div class="status warn">No strong signals found — page may be minimal or heavily obfuscated</div>`;
          return;
        }
        const byCat = {};
        findings.forEach((f) => {
          (byCat[f.category] ||= []).push(f);
        });
        results.innerHTML = Object.entries(byCat)
          .map(([cat, items]) => {
            const chips = items
              .map((f) => {
                const color = CAT_COLORS[cat] || "#6e68e3";
                const conf =
                  f.confidence === "medium"
                    ? " chip-medium"
                    : f.confidence === "low"
                      ? " chip-low"
                      : "";
                return `<span class="chip${conf}" title="${escapeHtml(f.evidence)}"><span class="chip-dot" style="background:${color}"></span>${escapeHtml(f.name)}</span>`;
              })
              .join("");
            return `<div class="stack-group"><div class="stack-cat">${escapeHtml(cat)}</div><div class="chips">${chips}</div></div>`;
          })
          .join("");
      }

      async function scan() {
        btnScan.disabled = true;
        results.innerHTML = `<div class="status">Scanning document…</div>`;
        try {
          const tab = await getActiveTab();
          if (!tab) {
            results.innerHTML = `<div class="status err">No active tab</div>`;
            return;
          }
          if (isRestrictedUrl(tab.url)) {
            results.innerHTML = `<div class="status warn">Can’t scan chrome:// or restricted pages</div>`;
            return;
          }
          const res = await sendToTab({ type: "DT_DETECT_STACK" });
          if (!res?.ok) {
            results.innerHTML = `<div class="status err">${escapeHtml(res?.error || "Scan failed")}</div>`;
            return;
          }
          renderFindings(res.data);
          toast(`${res.data.findings.length} signals`);
        } catch (err) {
          results.innerHTML = `<div class="status err">${escapeHtml(err?.message || "Scan failed")}</div>`;
        } finally {
          btnScan.disabled = false;
        }
      }

      try {
        const tab = await getActiveTab();
        if (!tab) {
          tabBox.innerHTML = `<div class="status warn">No active tab</div>`;
        } else {
          tabBox.innerHTML = `
            <div class="title-line">${escapeHtml(tab.title || "(untitled)")}</div>
            <div class="url-line">${escapeHtml(tab.url || "")}</div>`;
          if (!isRestrictedUrl(tab.url)) {
            // Auto-scan on open for polish
            scan();
          } else {
            results.innerHTML = `<div class="status warn">Open a normal https page, then Scan</div>`;
          }
        }
      } catch (err) {
        tabBox.innerHTML = `<div class="status err">${escapeHtml(err?.message || "error")}</div>`;
      }


      btnScan.addEventListener("click", scan);
    },

    pagepalette(root) {
      const panel = document.createElement("div");
      panel.className = "panel";
      panel.innerHTML = `
        <p class="panel-title">Page palette</p>
        <div class="status" id="pp-status">Extract colors from computed styles on the active tab</div>
        <div class="field-row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="pp-scan">Extract colors</button>
          <button type="button" class="btn" id="pp-copy-all" disabled>Copy all HEX</button>
          <span class="badge" id="pp-count" hidden></span>
        </div>
        <div class="palette-grid" id="pp-grid" style="margin-top:12px">
          <div class="empty-inline">No colors yet</div>
        </div>
        <p class="note" style="margin-top:12px">
          Samples color / background / border / fill from up to 2500 elements. Click a swatch to copy HEX.
        </p>`;
      root.appendChild(panel);

      const status = panel.querySelector("#pp-status");
      const grid = panel.querySelector("#pp-grid");
      const btnScan = panel.querySelector("#pp-scan");
      const btnCopy = panel.querySelector("#pp-copy-all");
      const countBadge = panel.querySelector("#pp-count");
      let lastColors = [];

      function setStatus(kind, text) {
        status.className = "status" + (kind ? " " + kind : "");
        status.textContent = text;
      }

      function render(colors) {
        lastColors = colors;
        btnCopy.disabled = !colors.length;
        countBadge.hidden = false;
        countBadge.textContent = `${colors.length} color${colors.length === 1 ? "" : "s"}`;
        if (!colors.length) {
          grid.innerHTML = `<div class="empty-inline">No colors found</div>`;
          return;
        }
        grid.innerHTML = "";
        colors.forEach((c) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "palette-swatch";
          btn.title = `${c.hex} · used ${c.count}×`;
          btn.innerHTML = `
            <span class="ps-color" style="background:${escapeHtml(c.hex)}"></span>
            <span class="ps-meta">
              <span class="ps-hex">${escapeHtml(c.hex)}</span>
              <span class="ps-count">${c.count}×</span>
            </span>`;
          btn.addEventListener("click", () => copyText(c.hex));
          grid.appendChild(btn);
        });
      }

      btnScan.addEventListener("click", async () => {
        btnScan.disabled = true;
        setStatus("", "Scanning…");
        try {
          const tab = await getActiveTab();
          if (!tab || isRestrictedUrl(tab.url)) {
            setStatus("warn", "Open a normal https page first");
            return;
          }
          const res = await sendToTab({ type: "DT_EXTRACT_COLORS" });
          if (!res?.ok) {
            setStatus("err", res?.error || "Extract failed");
            return;
          }
          render(res.data.colors || []);
          setStatus("ok", `Found ${res.data.colors.length} unique colors`);
          toast(`${res.data.colors.length} colors`);
        } catch (err) {
          setStatus("err", err?.message || "Failed");
        } finally {
          btnScan.disabled = false;
        }
      });

      btnCopy.addEventListener("click", () => {
        if (!lastColors.length) return;
        copyText(lastColors.map((c) => c.hex).join("\n"), "palette");
      });

      // auto-run
      btnScan.click();
    },

    fonts(root) {
      const panel = document.createElement("div");
      panel.className = "panel";
      panel.innerHTML = `
        <p class="panel-title">Fonts on page</p>
        <div class="status" id="font-status">Detect font-family stacks from computed styles</div>
        <div class="field-row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="font-scan">List fonts</button>
          <span class="badge" id="font-count" hidden></span>
        </div>
        <div id="font-list" style="margin-top:12px">
          <div class="empty-inline">No fonts yet</div>
        </div>`;
      root.appendChild(panel);

      const status = panel.querySelector("#font-status");
      const list = panel.querySelector("#font-list");
      const btnScan = panel.querySelector("#font-scan");
      const countBadge = panel.querySelector("#font-count");

      function setStatus(kind, text) {
        status.className = "status" + (kind ? " " + kind : "");
        status.textContent = text;
      }

      function render(fonts) {
        countBadge.hidden = false;
        countBadge.textContent = `${fonts.length}`;
        if (!fonts.length) {
          list.innerHTML = `<div class="empty-inline">No fonts detected</div>`;
          return;
        }
        list.innerHTML = "";
        fonts.forEach((f) => {
          const row = document.createElement("div");
          row.className = "font-card";
          row.innerHTML = `
            <div class="font-sample" style="font-family:${escapeHtml(f.family)}">${escapeHtml(f.sample || "The quick brown fox")}</div>
            <div class="font-primary">${escapeHtml(f.primary)}</div>
            <div class="url-line">${escapeHtml(f.family)}</div>
            <div class="font-meta">${escapeHtml(f.size)} · weight ${escapeHtml(String(f.weight))} · ${f.count} nodes</div>
            <button type="button" class="btn btn-sm" style="margin-top:8px">Copy stack</button>`;
          row.querySelector("button").addEventListener("click", () => copyText(f.family, "font stack"));
          list.appendChild(row);
        });
      }

      btnScan.addEventListener("click", async () => {
        btnScan.disabled = true;
        setStatus("", "Scanning…");
        try {
          const tab = await getActiveTab();
          if (!tab || isRestrictedUrl(tab.url)) {
            setStatus("warn", "Open a normal https page first");
            return;
          }
          const res = await sendToTab({ type: "DT_LIST_FONTS" });
          if (!res?.ok) {
            setStatus("err", res?.error || "Scan failed");
            return;
          }
          render(res.data.fonts || []);
          setStatus("ok", `${res.data.fonts.length} font stack${res.data.fonts.length === 1 ? "" : "s"}`);
          toast(`${res.data.fonts.length} fonts`);
        } catch (err) {
          setStatus("err", err?.message || "Failed");
        } finally {
          btnScan.disabled = false;
        }
      });

      btnScan.click();
    },

    livetext(root) {
      const panel = document.createElement("div");
      panel.className = "panel";
      panel.innerHTML = `
        <p class="panel-title">Live text</p>
        <div class="status" id="lt-status">Idle — start editing text on the page</div>
        <div class="field-row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="lt-start">Start editing</button>
          <button type="button" class="btn" id="lt-stop" disabled>Stop &amp; restore</button>
        </div>
        <p class="note" style="margin-top:12px">
          Click text on the page to edit it in place. <strong>Stop &amp; restore</strong> (or Esc) reverts all edits to the originals — safe for mockups.
        </p>`;
      root.appendChild(panel);

      const status = panel.querySelector("#lt-status");
      const btnStart = panel.querySelector("#lt-start");
      const btnStop = panel.querySelector("#lt-stop");
      let active = false;

      function setStatus(kind, text) {
        status.className = "status" + (kind ? " " + kind : "");
        status.textContent = text;
      }
      function setActive(on) {
        active = on;
        btnStart.disabled = on;
        btnStop.disabled = !on;
      }

      const onMsg = (msg) => {
        if (!msg) return;
        if (msg.type === "DT_LIVE_TEXT_EDITING") {
          setStatus("ok", `Editing · ${msg.payload?.count || 1} element(s) touched`);
        }
        if (msg.type === "DT_LIVE_TEXT_STOPPED") {
          setActive(false);
          setStatus("", "Stopped — originals restored");
        }
      };
      chrome.runtime.onMessage.addListener(onMsg);

      btnStart.addEventListener("click", async () => {
        const tab = await getActiveTab();
        if (!tab || isRestrictedUrl(tab.url)) {
          setStatus("warn", "Open a normal https page first");
          return;
        }
        const res = await sendToTab({ type: "DT_LIVE_TEXT_START" });
        if (!res?.ok) {
          setStatus("err", res?.error || "Failed to start");
          return;
        }
        setActive(true);
        setStatus("ok", "Click text on the page to edit");
        toast("Live text on");
      });

      btnStop.addEventListener("click", async () => {
        await sendToTab({ type: "DT_LIVE_TEXT_STOP", restore: true });
        setActive(false);
        setStatus("", "Stopped — originals restored");
      });

      return () => {
        chrome.runtime.onMessage.removeListener(onMsg);
        if (active) sendToTab({ type: "DT_LIVE_TEXT_STOP", restore: true }).catch(() => {});
      };
    },

    outliner(root) {
      const panel = document.createElement("div");
      panel.className = "panel";
      panel.innerHTML = `
        <p class="panel-title">Outliner</p>
        <div class="status" id="ol-status">Choose what to outline on the page</div>
        <div class="seg" id="ol-mode" style="margin-top:10px" role="tablist">
          <button type="button" class="seg-btn active" data-mode="all">All</button>
          <button type="button" class="seg-btn" data-mode="headings">Headings</button>
          <button type="button" class="seg-btn" data-mode="interactive">Interactive</button>
        </div>
        <div class="field-row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="ol-start">Show outlines</button>
          <button type="button" class="btn" id="ol-stop" disabled>Clear</button>
        </div>
        <p class="note" style="margin-top:12px">
          Injects a stylesheet overlay. <strong>All</strong> boxes every element; <strong>Headings</strong> h1–h6; <strong>Interactive</strong> links, buttons, inputs, and focusable nodes.
        </p>`;
      root.appendChild(panel);

      const status = panel.querySelector("#ol-status");
      const btnStart = panel.querySelector("#ol-start");
      const btnStop = panel.querySelector("#ol-stop");
      let mode = "all";
      let active = false;

      function setStatus(kind, text) {
        status.className = "status" + (kind ? " " + kind : "");
        status.textContent = text;
      }
      function setActive(on) {
        active = on;
        btnStop.disabled = !on;
      }

      panel.querySelectorAll(".seg-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          panel.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          mode = btn.dataset.mode;
          if (active) btnStart.click();
        });
      });

      const onMsg = (msg) => {
        if (msg?.type === "DT_OUTLINE_STOPPED") {
          setActive(false);
          setStatus("", "Cleared");
        }
      };
      chrome.runtime.onMessage.addListener(onMsg);

      btnStart.addEventListener("click", async () => {
        const tab = await getActiveTab();
        if (!tab || isRestrictedUrl(tab.url)) {
          setStatus("warn", "Open a normal https page first");
          return;
        }
        const res = await sendToTab({ type: "DT_OUTLINE_START", mode });
        if (!res?.ok) {
          setStatus("err", res?.error || "Failed");
          return;
        }
        setActive(true);
        setStatus("ok", `Outlining: ${mode}`);
        toast(`Outline: ${mode}`);
      });

      btnStop.addEventListener("click", async () => {
        await sendToTab({ type: "DT_OUTLINE_STOP" });
        setActive(false);
        setStatus("", "Cleared");
      });

      return () => {
        chrome.runtime.onMessage.removeListener(onMsg);
        if (active) sendToTab({ type: "DT_OUTLINE_STOP" }).catch(() => {});
      };
    },

    images(root) {
      const panel = document.createElement("div");
      panel.className = "panel";
      panel.innerHTML = `
        <p class="panel-title">Images</p>
        <div class="status" id="img-status">Pull img, srcset, and CSS background images</div>
        <div class="field-row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="img-scan">Extract images</button>
          <span class="badge" id="img-count" hidden></span>
        </div>
        <div id="img-list" class="img-list" style="margin-top:12px">
          <div class="empty-inline">No images yet</div>
        </div>`;
      root.appendChild(panel);

      const status = panel.querySelector("#img-status");
      const list = panel.querySelector("#img-list");
      const btnScan = panel.querySelector("#img-scan");
      const countBadge = panel.querySelector("#img-count");

      function setStatus(kind, text) {
        status.className = "status" + (kind ? " " + kind : "");
        status.textContent = text;
      }

      function render(images) {
        countBadge.hidden = false;
        countBadge.textContent = `${images.length}`;
        if (!images.length) {
          list.innerHTML = `<div class="empty-inline">No images found</div>`;
          return;
        }
        list.innerHTML = "";
        images.forEach((im, i) => {
          const card = document.createElement("div");
          card.className = "img-card";
          const dims =
            im.width && im.height ? `${im.width}×${im.height}` : "dims n/a";
          const label = im.dataUri ? "data URI" : im.url.split("/").pop()?.slice(0, 40) || im.url;
          card.innerHTML = `
            <div class="img-thumb-wrap">
              <img class="img-thumb" alt="" loading="lazy" />
            </div>
            <div class="img-info">
              <div class="img-name" title="${escapeHtml(im.url)}">${escapeHtml(label)}</div>
              <div class="url-line">${escapeHtml(im.source)} · ${escapeHtml(dims)}${im.alt ? " · " + escapeHtml(im.alt) : ""}</div>
              <div class="field-row" style="margin-top:6px;gap:6px;flex-wrap:wrap">
                <button type="button" class="btn btn-sm" data-act="copy">Copy URL</button>
                <a class="btn btn-sm" data-act="open" target="_blank" rel="noopener">Open</a>
              </div>
            </div>`;
          const thumb = card.querySelector(".img-thumb");
          if (!im.dataUri || (im.url || "").length < 500000) {
            thumb.src = im.url;
            thumb.onerror = () => {
              thumb.replaceWith(Object.assign(document.createElement("div"), {
                className: "img-thumb-fallback",
                textContent: "?",
              }));
            };
          } else {
            thumb.replaceWith(Object.assign(document.createElement("div"), {
              className: "img-thumb-fallback",
              textContent: "data",
            }));
          }
          card.querySelector('[data-act="copy"]').addEventListener("click", () =>
            copyText(im.url, "URL")
          );
          const open = card.querySelector('[data-act="open"]');
          if (im.dataUri) {
            open.removeAttribute("href");
            open.addEventListener("click", (e) => {
              e.preventDefault();
              copyText(im.url, "data URI");
            });
            open.textContent = "Copy data";
          } else {
            open.href = im.url;
          }
          list.appendChild(card);
        });
      }

      btnScan.addEventListener("click", async () => {
        btnScan.disabled = true;
        setStatus("", "Scanning…");
        try {
          const tab = await getActiveTab();
          if (!tab || isRestrictedUrl(tab.url)) {
            setStatus("warn", "Open a normal https page first");
            return;
          }
          const res = await sendToTab({ type: "DT_EXTRACT_IMAGES" });
          if (!res?.ok) {
            setStatus("err", res?.error || "Failed");
            return;
          }
          render(res.data.images || []);
          setStatus("ok", `${res.data.count} image${res.data.count === 1 ? "" : "s"}`);
          toast(`${res.data.count} images`);
        } catch (err) {
          setStatus("err", err?.message || "Failed");
        } finally {
          btnScan.disabled = false;
        }
      });

      btnScan.click();
    },

    json(root) {
      const panel = document.createElement("div");
      panel.className = "panel";
      panel.innerHTML = `
        <p class="panel-title">JSON tools</p>
        <div class="status" id="json-status">Paste JSON — no page required</div>
        <textarea class="input input-mono json-area" id="json-input" spellcheck="false" placeholder='{"hello": "world"}'></textarea>
        <div class="field-row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="json-pretty">Pretty</button>
          <button type="button" class="btn" id="json-minify">Minify</button>
          <button type="button" class="btn" id="json-validate">Validate</button>
          <button type="button" class="btn" id="json-copy">Copy</button>
        </div>
        <pre class="json-error" id="json-error" hidden></pre>`;
      root.appendChild(panel);

      const input = panel.querySelector("#json-input");
      const status = panel.querySelector("#json-status");
      const errEl = panel.querySelector("#json-error");

      function setStatus(kind, text) {
        status.className = "status" + (kind ? " " + kind : "");
        status.textContent = text;
      }

      function parse() {
        const raw = input.value.trim();
        if (!raw) throw new Error("Empty input");
        return JSON.parse(raw);
      }

      panel.querySelector("#json-pretty").addEventListener("click", () => {
        errEl.hidden = true;
        try {
          const obj = parse();
          input.value = JSON.stringify(obj, null, 2);
          setStatus("ok", "Formatted");
          toast("Prettified");
        } catch (err) {
          errEl.hidden = false;
          errEl.textContent = err.message;
          setStatus("err", "Invalid JSON");
        }
      });

      panel.querySelector("#json-minify").addEventListener("click", () => {
        errEl.hidden = true;
        try {
          const obj = parse();
          input.value = JSON.stringify(obj);
          setStatus("ok", "Minified");
          toast("Minified");
        } catch (err) {
          errEl.hidden = false;
          errEl.textContent = err.message;
          setStatus("err", "Invalid JSON");
        }
      });

      panel.querySelector("#json-validate").addEventListener("click", () => {
        errEl.hidden = true;
        try {
          const obj = parse();
          const keys = obj && typeof obj === "object" ? Object.keys(obj).length : 0;
          const type = Array.isArray(obj) ? `array[${obj.length}]` : typeof obj;
          setStatus("ok", `Valid · ${type}${keys && !Array.isArray(obj) ? ` · ${keys} keys` : ""}`);
          toast("Valid JSON");
        } catch (err) {
          errEl.hidden = false;
          errEl.textContent = err.message;
          setStatus("err", "Invalid JSON");
        }
      });

      panel.querySelector("#json-copy").addEventListener("click", () => {
        if (!input.value.trim()) {
          toast("Nothing to copy");
          return;
        }
        copyText(input.value, "JSON");
      });
    },

    a11y(root) {
      const panel = document.createElement("div");
      panel.className = "panel";
      panel.innerHTML = `
        <p class="panel-title">Accessibility</p>
        <div class="status" id="a11y-status">Basic scan — alt, labels, headings, contrast</div>
        <div class="field-row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="a11y-scan">Run scan</button>
          <span class="badge" id="a11y-count" hidden></span>
        </div>
        <div id="a11y-summary" class="a11y-summary" style="margin-top:10px" hidden></div>
        <div id="a11y-list" style="margin-top:10px">
          <div class="empty-inline">No scan yet</div>
        </div>
        <p class="note" style="margin-top:12px">
          Heuristic only — not a full WCAG audit. Contrast samples up to ~80 text nodes against ancestor backgrounds.
        </p>`;
      root.appendChild(panel);

      const status = panel.querySelector("#a11y-status");
      const list = panel.querySelector("#a11y-list");
      const summary = panel.querySelector("#a11y-summary");
      const btnScan = panel.querySelector("#a11y-scan");
      const countBadge = panel.querySelector("#a11y-count");

      function setStatus(kind, text) {
        status.className = "status" + (kind ? " " + kind : "");
        status.textContent = text;
      }

      function render(data) {
        const findings = data.findings || [];
        countBadge.hidden = false;
        countBadge.textContent = `${data.total ?? findings.length}`;
        const counts = { error: 0, warn: 0, info: 0 };
        findings.forEach((f) => {
          counts[f.severity] = (counts[f.severity] || 0) + 1;
        });
        summary.hidden = false;
        summary.innerHTML = `
          <span class="a11y-pill a11y-error">${counts.error} errors</span>
          <span class="a11y-pill a11y-warn">${counts.warn} warnings</span>
          <span class="a11y-pill a11y-info">${counts.info} info</span>`;
        if (!findings.length) {
          list.innerHTML = `<div class="status ok">No issues found in this pass</div>`;
          return;
        }
        list.innerHTML = findings
          .map(
            (f) => `
          <div class="a11y-item sev-${escapeHtml(f.severity)}">
            <div class="a11y-top">
              <span class="a11y-sev">${escapeHtml(f.severity)}</span>
              <span class="a11y-rule">${escapeHtml(f.rule)}</span>
            </div>
            <div class="a11y-msg">${escapeHtml(f.message)}</div>
            <div class="url-line">${escapeHtml(f.selector)}${f.detail ? " · " + escapeHtml(f.detail) : ""}</div>
          </div>`
          )
          .join("");
      }

      btnScan.addEventListener("click", async () => {
        btnScan.disabled = true;
        setStatus("", "Scanning…");
        try {
          const tab = await getActiveTab();
          if (!tab || isRestrictedUrl(tab.url)) {
            setStatus("warn", "Open a normal https page first");
            return;
          }
          const res = await sendToTab({ type: "DT_A11Y_SCAN" });
          if (!res?.ok) {
            setStatus("err", res?.error || "Scan failed");
            return;
          }
          render(res.data);
          setStatus("ok", `${res.data.total} finding${res.data.total === 1 ? "" : "s"}`);
          toast(`${res.data.total} a11y findings`);
        } catch (err) {
          setStatus("err", err?.message || "Failed");
        } finally {
          btnScan.disabled = false;
        }
      });

      btnScan.click();
    },
  };

  // ——— Events ———
  els.btnHome.addEventListener("click", showHome);
  els.btnPalette.addEventListener("click", openPalette);
  els.paletteBackdrop.addEventListener("click", closePalette);

  els.paletteInput.addEventListener("input", () => {
    paletteIndex = 0;
    renderPaletteResults();
  });

  document.addEventListener("keydown", (e) => {
    const meta = e.metaKey || e.ctrlKey;

    if (meta && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      if (isPaletteOpen()) closePalette();
      else openPalette();
      return;
    }

    if (!isPaletteOpen()) {
      if (e.key === "Escape" && activeToolId) {
        showHome();
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!paletteFiltered.length) return;
      paletteIndex = (paletteIndex + 1) % paletteFiltered.length;
      renderPaletteResults();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!paletteFiltered.length) return;
      paletteIndex =
        (paletteIndex - 1 + paletteFiltered.length) % paletteFiltered.length;
      renderPaletteResults();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const t = paletteFiltered[paletteIndex];
      if (t) openTool(t.id);
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "OPEN_PALETTE") openPalette();
  });

  async function checkPendingPalette() {
    try {
      const { openPalettePending } = await chrome.storage.session.get(
        "openPalettePending"
      );
      if (openPalettePending) {
        await chrome.storage.session.set({ openPalettePending: false });
        openPalette();
      }
    } catch (_) {}
  }

  async function restoreLastTool() {
    try {
      const { lastTool } = await chrome.storage.local.get("lastTool");
      if (lastTool && TOOLS.some((t) => t.id === lastTool)) {
        openTool(lastTool);
        return;
      }
    } catch (_) {}
    showHome();
  }

  renderToolList();
  restoreLastTool().then(checkPendingPalette);
})();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyShortcutLabels); else applyShortcutLabels();
