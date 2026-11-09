---
icon: lucide/download
tags:
  - Getting started
  - Zotero
---

# Install

1. **Download** the `.xpi` file from the [latest release](https://github.com/noahweidig/autotag/releases/latest).

    !!! tip "Firefox"

        Right-click the link and choose **Save Link As…**. A plain click makes Firefox try to install it as a Firefox add-on.

2. In Zotero, open **Tools → Add-ons**.
3. Click the gear :lucide-settings: → **Install Add-on from File…** and pick the downloaded `.xpi`.
4. Restart Zotero.

**Compatibility:** Zotero 6.999 through 10.0.x (from the plugin manifest).

You now have three entries in the **Tools** menu and the item right-click menu:

- **Autotag: Tag Selected Items**
- **Autotag: Tag Manager…**
- **Autotag: Settings…**

Next: [set up a provider](providers.md).

## Build from source

```bash
git clone https://github.com/noahweidig/autotag.git
cd autotag
npm ci
npm run build
```

The `.xpi` lands in `build/`. Run `npm run check` for typecheck, lint and unit tests.

## Build these docs

```bash
python -m venv .venv && . .venv/bin/activate
pip install --require-hashes --only-binary=:all: -r docs-requirements.txt
zensical serve
```
