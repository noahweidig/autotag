// src/modules/autotagMenu.ts
// Tools menu and item right-click menu entries. Inserted manually (the
// MenuManager API was unreliable across Zotero 8-10) with retry for lazy popups.

declare const Zotero: _ZoteroTypes.Zotero;

import { openAutotagSettings } from "./autotagPrefs";
import { runAutotagForSelection } from "./autotagCore";

const IDS = [
  "autotag-tools-sep",
  "autotag-settings-menuitem",
  "autotag-run-menuitem",
  "autotag-item-sep",
  "autotag-item-run",
];

const debug = (msg: string) => (Zotero as any).debug?.(`[Autotag] ${msg}`);

function item(doc: any, id: string, label: string, onCommand: () => void) {
  const el = doc.createXULElement("menuitem");
  el.id = id;
  el.setAttribute("label", label);
  el.setAttribute("class", "menuitem-iconic autotag-menuitem");
  el.addEventListener("command", onCommand);
  return el;
}

function findPopup(doc: Document, ids: string[]): Element | null {
  for (const id of ids) {
    const el = doc.getElementById(id);
    if (el) return el;
  }
  return null;
}

function run(win: _ZoteroTypes.MainWindow) {
  runAutotagForSelection(win).catch((e) => {
    debug(`run failed: ${e?.stack || e}`);
    (win as any).alert?.(`Autotag failed\n\n${e?.message || e}`);
  });
}

export function registerAutotagMenus(
  win: _ZoteroTypes.MainWindow,
  opts: { tools: boolean; item: boolean },
  attempt = 0,
): void {
  const doc: any = win.document;
  if (IDS.some((id) => doc.getElementById(id))) return;

  const tools = opts.tools ? findPopup(doc, ["menu_ToolsPopup"]) : null;
  const itemPopup = opts.item ? findPopup(doc, ["zotero-itemmenu"]) : null;

  if ((opts.tools && !tools) || (opts.item && !itemPopup)) {
    if (attempt < 20) {
      win.setTimeout(() => registerAutotagMenus(win, opts, attempt + 1), 250);
      return;
    }
    debug("menu popups not found after retries");
  }

  if (tools) {
    const sep = doc.createXULElement("menuseparator");
    sep.id = "autotag-tools-sep";
    tools.append(
      sep,
      item(doc, "autotag-run-menuitem", "Autotag: Tag Selected Items", () =>
        run(win),
      ),
      item(doc, "autotag-settings-menuitem", "Autotag: Settings...", () =>
        openAutotagSettings(win),
      ),
    );
  }

  if (itemPopup) {
    const sep = doc.createXULElement("menuseparator");
    sep.id = "autotag-item-sep";
    itemPopup.append(
      sep,
      item(doc, "autotag-item-run", "Autotag: Generate Tags", () => run(win)),
    );
  }
}

export function unregisterAutotagMenus(win: _ZoteroTypes.MainWindow): void {
  try {
    for (const id of IDS) win.document.getElementById(id)?.remove();
  } catch {
    // window already gone
  }
}
