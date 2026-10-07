# Dev Toolbox (v0.3.1)

Chrome Manifest V3 side-panel extension — SuperDev-style developer toolbox for Ben Counsell.

**12 free-set tools**, command palette (`⌘/Ctrl+K`), keyboard open (`⌘/Ctrl+Shift+D`).

Repo (seed separately): https://github.com/bencounsell/grokbot-prodev-extension

## Load unpacked (Chrome on Mac)

**Folder:**

```
/Users/ben/dev-toolbox-prototype
```

1. Chrome → `chrome://extensions`
2. Developer mode on
3. **Remove** existing Dev Toolbox (required after permission / new-file changes), then **Load unpacked**
4. Select `/Users/ben/dev-toolbox-prototype`
5. Open a normal **https** page (not `chrome://`)
6. Open panel via toolbar icon or **⌘⇧D**

### After code changes

Prefer **Remove + Load unpacked**, then **refresh the tab** you want to measure/inspect (content script is injected on demand; a stale tab may still hold an older inject until reload).

## Tools (free set)

| Tool | What it does |
|------|----------------|
| **Color picker** | EyeDropper, HEX/RGB/HSL copy, history in `chrome.storage.local` |
| **Palette** | Extract dominant/unique page colors from computed styles; swatch grid; copy HEX |
| **List fonts** | Walk computed `font-family`; sample text; copy stack |
| **Live text** | Click-to-edit page text; **Stop & restore** reverts originals |
| **Outliner** | Toggle outlines: all elements / headings / interactive |
| **Extract images** | `img`, `srcset`, CSS backgrounds; open/copy URL; dims when known |
| **JSON** | Panel-only pretty / minify / validate / copy (no page needed) |
| **A11y check** | Missing alt, unlabeled controls, heading skips, contrast heuristics |
| **Ruler / measure** | Click-drag distance overlay; ΔX/ΔY |
| **CSS inspect** | Hover highlight, click for computed styles |
| **Screenshot** | Visible · selection crop · full-page stitch (capped) |
| **Site stack** | Framework/library/CMS signals from DOM & globals |

## Shortcuts

Suggested keys: **Ctrl+Shift+D** (open panel) and **Ctrl+Shift+K** (palette). On Mac: **⌘⇧D** / **⌘⇧K**.

If a shortcut does nothing after Load unpacked, open `chrome://extensions/shortcuts` and assign **Open Dev Toolbox side panel** / **Open Dev Toolbox command palette**.

## Permissions

| Permission | Why |
|------------|-----|
| `sidePanel` | Side panel UI |
| `activeTab` | Tab context on gesture |
| `tabs` | Title/URL; `captureVisibleTab` |
| `storage` | Last tool, color history, palette handshake |
| `scripting` | Inject `content.js` for page tools |
| `host_permissions: <all_urls>` | Reliable inject on arbitrary https pages after the panel is already open |

## Shortcuts

| Action | Default |
|--------|---------|
| Open side panel | ⌘⇧D / Ctrl+Shift+D |
| Open command palette | ⌘⇧K / Ctrl+Shift+K |
| Palette (panel focused) | ⌘/Ctrl+K |
| Close / back | Esc |
| Stop measure / inspect / live text / outliner | Esc on page |

## Files

```
dev-toolbox-prototype/
├── manifest.json
├── background.js
├── content.js
├── sidepanel.html
├── sidepanel.css
├── sidepanel.js
├── icons/
└── README.md
```

No build step.

## Known limits

- Restricted URLs (`chrome://`, Web Store) cannot be scripted or captured
- Full-page screenshot: stitch capped (~5 viewports); fixed headers may duplicate
- Live text restores originals on stop (by design)
- A11y contrast is a heuristic sample, not a full WCAG engine
- Palette/fonts/images capped for performance on huge DOMs
- Site stack is heuristic, not Wappalyzer-complete
- After upgrading the extension, refresh the page before page tools

## License

Prototype for internal demo — throwaway-ok.
