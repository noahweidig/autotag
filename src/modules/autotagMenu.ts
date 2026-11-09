// src/modules/autotagMenu.ts
// Tools menu and item right-click menu entries. Inserted manually (the
// MenuManager API was unreliable across Zotero 8-10) with retry for lazy popups.

declare const Zotero: _ZoteroTypes.Zotero;

import { openAutotagSettings } from "./autotagPrefs";
import { runAutotagForCollection, runAutotagForSelection } from "./autotagCore";
import type { TagMode } from "./autotagPrefs";
import { openTagManager } from "./tagManager";

const IDS = [
  "autotag-tools-sep",
  "autotag-settings-menuitem",
  "autotag-run-menuitem",
  "autotag-manager-menuitem",
  "autotag-tools-free",
  "autotag-item-sep",
  "autotag-item-menu",
  "autotag-col-sep",
  "autotag-col-menu",
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

function run(win: _ZoteroTypes.MainWindow, mode?: TagMode, collection = false) {
  const p = collection
    ? runAutotagForCollection(win, { mode })
    : runAutotagForSelection(win, { mode });
  p.catch((e) => {
    debug(`run failed: ${e?.stack || e}`);
    (win as any).alert?.(`Autotag failed\n\n${e?.message || e}`);
  });
}

function openManager(win: _ZoteroTypes.MainWindow) {
  try {
    openTagManager(win);
  } catch (e: any) {
    debug(`tag manager failed: ${e?.stack || e}`);
    (win as any).alert?.(`Autotag Tag Manager failed\n\n${e?.message || e}`);
  }
}

function submenu(
  doc: any,
  id: string,
  win: _ZoteroTypes.MainWindow,
  collection: boolean,
) {
  const menu = doc.createXULElement("menu");
  menu.id = id;
  menu.setAttribute("label", collection ? "Autotag collection" : "Autotag");
  menu.setAttribute("class", "menu-iconic autotag-menuitem");
  const popup = doc.createXULElement("menupopup");
  const label = collection ? "collection" : "selected items";
  popup.append(
    item(doc, `${id}-default`, `Tag ${label}`, () =>
      run(win, undefined, collection),
    ),
    item(doc, `${id}-free`, `Suggest tags without AI (${label})`, () =>
      run(win, "free", collection),
    ),
    item(doc, `${id}-ai`, `Generate tags with AI (${label})`, () =>
      run(win, "ai", collection),
    ),
  );
  if (!collection) {
    popup.append(
      doc.createXULElement("menuseparator"),
      item(doc, `${id}-manager`, "Tag Manager...", () => openManager(win)),
    );
  }
  popup.append(
    doc.createXULElement("menuseparator"),
    item(doc, `${id}-settings`, "Settings...", () => openAutotagSettings(win)),
  );
  menu.append(popup);
  return menu;
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
  const colPopup = opts.item ? findPopup(doc, ["zotero-collectionmenu"]) : null;

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
      item(doc, "autotag-tools-free", "Autotag: Suggest Tags Without AI", () =>
        run(win, "free"),
      ),
      item(doc, "autotag-manager-menuitem", "Autotag: Tag Manager...", () =>
        openManager(win),
      ),
      item(doc, "autotag-settings-menuitem", "Autotag: Settings...", () =>
        openAutotagSettings(win),
      ),
    );
  }

  if (itemPopup) {
    const sep = doc.createXULElement("menuseparator");
    sep.id = "autotag-item-sep";
    itemPopup.append(sep, submenu(doc, "autotag-item-menu", win, false));
  }

  if (colPopup) {
    const sep = doc.createXULElement("menuseparator");
    sep.id = "autotag-col-sep";
    colPopup.append(sep, submenu(doc, "autotag-col-menu", win, true));
  }
}

export function unregisterAutotagMenus(win: _ZoteroTypes.MainWindow): void {
  try {
    for (const id of IDS) win.document.getElementById(id)?.remove();
  } catch {
    // window already gone
  }
}
