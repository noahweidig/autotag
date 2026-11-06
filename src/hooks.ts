// src/hooks.ts

declare const Zotero: _ZoteroTypes.Zotero;

import { config } from "../package.json";
import {
  PREF_PANE_ID,
  getBool,
  migrateLegacyPrefs,
} from "./modules/autotagPrefs";
import {
  registerAutotagMenus,
  unregisterAutotagMenus,
} from "./modules/autotagMenu";
import { initPrefsPane } from "./modules/autotagPrefsPane";

const debug = (msg: string) => (Zotero as any).debug?.(`[Autotag] ${msg}`);

function injectStyles(win: _ZoteroTypes.MainWindow): void {
  const doc = win.document;
  if (doc.getElementById("autotag-stylesheet")) return;
  const link = doc.createElement("link");
  link.id = "autotag-stylesheet";
  link.setAttribute("rel", "stylesheet");
  link.setAttribute("type", "text/css");
  link.setAttribute("href", "chrome://autotag/content/autotag.css");
  doc.documentElement?.appendChild(link);
}

async function onStartup(): Promise<void> {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  migrateLegacyPrefs();

  try {
    await (Zotero as any).PreferencePanes.register({
      pluginID: config.addonID,
      id: PREF_PANE_ID,
      src: rootURI + "content/preferences.xhtml",
      scripts: [rootURI + "content/preferences.js"],
      stylesheets: [rootURI + "content/preferences.css"],
      label: "Autotag",
      image: rootURI + "content/icons/Jesse.png",
    });
  } catch (e) {
    debug(`preference pane registration failed: ${String(e)}`);
  }

  for (const win of Zotero.getMainWindows() as _ZoteroTypes.MainWindow[]) {
    await onMainWindowLoad(win);
  }
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  injectStyles(win);
  registerAutotagMenus(win, {
    tools: getBool("ui.toolsMenu", true),
    item: getBool("ui.itemMenu", true),
  });
}

async function onMainWindowUnload(win: Window): Promise<void> {
  unregisterAutotagMenus(win as any);
}

async function onShutdown(): Promise<void> {
  for (const win of Zotero.getMainWindows() as _ZoteroTypes.MainWindow[]) {
    unregisterAutotagMenus(win);
    win.document.getElementById("autotag-stylesheet")?.remove();
  }
}

async function onNotify(): Promise<void> {}

async function onPrefsEvent(
  type: string,
  data: { [key: string]: any },
): Promise<void> {
  if (type === "load") initPrefsPane(data.window);
}

function onShortcuts(_type: string): void {}
function onDialogEvents(_type: string): void {}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
