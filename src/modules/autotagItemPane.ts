// src/modules/autotagItemPane.ts
// Item pane section: suggest tags for the selected item and add them with one click.

declare const Zotero: _ZoteroTypes.Zotero;

import { config } from "../../package.json";
import {
  getProviderConfigError,
  getSelectedProvider,
  getSourceOptions,
  getTagOptions,
  type TagMode,
} from "./autotagPrefs";
import { applyTags, collectSuggestions } from "./autotagCore";
import { getItemMetadata } from "./autotagItems";
import { getLocaleID } from "../utils/locale";

const PANE_ID = "autotag-suggestions";
const ICON = "chrome://autotag/content/icons/autotag-48.png";

type Chip = { tag: string; source: string };
type State = {
  busy: boolean;
  message: string;
  error: boolean;
  chips: Chip[] | null;
};

// Keyed by item id so switching items and coming back keeps the suggestions.
const states = new Map<number, State>();
const stateOf = (id: number): State => {
  let s = states.get(id);
  if (!s) {
    s = { busy: false, message: "", error: false, chips: null };
    states.set(id, s);
  }
  return s;
};

type View = { doc: Document; body: HTMLElement; item: any; editable: boolean };
const views = new WeakMap<HTMLElement, View>();
let sectionKey: string | false = false;

const el = (
  doc: Document,
  tag: string,
  cls?: string,
  text?: string,
): HTMLElement => {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function redraw(v: View): void {
  // The pane may have moved to another item while a lookup was running.
  if (views.get(v.body) !== v) return;
  draw(v);
}

function draw(v: View): void {
  const { doc, body, item } = v;
  body.textContent = "";
  const st = stateOf(item.id);
  const root = el(doc, "div", "autotag-section");
  const bar = el(doc, "div", "autotag-section-bar");

  const mkBtn = (label: string, onClick: () => void, disabled = false) => {
    const b = el(doc, "button", "autotag-btn", label) as HTMLButtonElement;
    b.type = "button";
    b.disabled = disabled || st.busy;
    b.addEventListener("click", onClick);
    return b;
  };
  bar.append(
    mkBtn("Suggest (free)", () => void suggest(v, "free")),
    mkBtn("Suggest (AI)", () => void suggest(v, "ai")),
  );
  root.append(bar);

  if (st.message) {
    root.append(
      el(
        doc,
        "div",
        "autotag-section-msg" + (st.error ? " err" : ""),
        st.message,
      ),
    );
  }

  const have = new Set(
    (item.getTags?.() || []).map((x: any) => String(x.tag).toLowerCase()),
  );
  const chips = (st.chips || []).filter((c) => !have.has(c.tag.toLowerCase()));
  if (st.chips && !chips.length && !st.message && !st.busy) {
    root.append(
      el(doc, "div", "autotag-section-msg", "No new tags to suggest."),
    );
  }
  if (chips.length) {
    const wrap = el(doc, "div", "autotag-chips");
    for (const c of chips) {
      const b = el(doc, "button", "autotag-chip") as HTMLButtonElement;
      b.type = "button";
      b.disabled = !v.editable || st.busy;
      b.title = `Add tag (from ${c.source})`;
      b.append(
        el(doc, "span", "autotag-chip-plus", "+ "),
        doc.createTextNode(c.tag),
      );
      b.append(el(doc, "small", "autotag-chip-src", c.source));
      b.addEventListener("click", () => void accept(v, [c.tag]));
      wrap.append(b);
    }
    root.append(wrap);
    const acts = el(doc, "div", "autotag-section-bar");
    acts.append(
      mkBtn(
        `Add all (${chips.length})`,
        () =>
          void accept(
            v,
            chips.map((c) => c.tag),
          ),
        !v.editable,
      ),
      mkBtn("Dismiss", () => {
        st.chips = null;
        st.message = "";
        redraw(v);
      }),
    );
    root.append(acts);
  }
  body.append(root);
}

async function accept(v: View, tags: string[]): Promise<void> {
  const st = stateOf(v.item.id);
  try {
    await applyTags(
      new Map([[v.item.key, v.item]]),
      new Map([[v.item.key, tags]]),
      getTagOptions(),
    );
    const done = new Set(tags.map((t) => t.toLowerCase()));
    st.chips = (st.chips || []).filter((c) => !done.has(c.tag.toLowerCase()));
    st.message = "";
    st.error = false;
  } catch (e: any) {
    st.message = `Could not add tags: ${e?.message || e}`;
    st.error = true;
  }
  redraw(v);
}

async function suggest(v: View, mode: TagMode): Promise<void> {
  const st = stateOf(v.item.id);
  if (st.busy) return;
  if (mode === "ai") {
    const err = getProviderConfigError(getSelectedProvider());
    if (err) {
      st.message = `${err} Set it up in Settings > Autotag > AI.`;
      st.error = true;
      redraw(v);
      return;
    }
  } else {
    const o = getSourceOptions();
    if (!o.openalex && !o.crossref && !o.pubmed && !o.local) {
      st.message =
        "No free source is enabled. See Settings > Autotag > Free sources.";
      st.error = true;
      redraw(v);
      return;
    }
  }
  st.busy = true;
  st.error = false;
  st.message = mode === "ai" ? "Asking the AI model..." : "Looking up tags...";
  redraw(v);
  try {
    const meta = await getItemMetadata(v.item);
    const out = await collectSuggestions(
      [meta],
      v.item.libraryID,
      mode,
      getTagOptions(),
      {
        update: (text) => {
          st.message = text;
          redraw(v);
        },
      },
    );
    const tags = out.results.get(meta.key) || [];
    const src = out.sourcesFor(meta.key, tags);
    st.chips = tags.map((tag) => ({
      tag,
      source: src[tag.toLowerCase()] || "",
    }));
    st.message = out.errors.length ? out.errors.join(" ") : "";
    st.error = !!out.errors.length;
  } catch (e: any) {
    st.message = String(e?.message || e);
    st.error = true;
  }
  st.busy = false;
  redraw(v);
}

export function registerItemPaneSection(): void {
  if (sectionKey) return;
  const l10n = (id: string) => getLocaleID(id as any);
  sectionKey = (Zotero as any).ItemPaneManager.registerSection({
    paneID: PANE_ID,
    pluginID: config.addonID,
    header: {
      l10nID: l10n("item-section-suggest-head-text"),
      icon: ICON,
    },
    sidenav: {
      l10nID: l10n("item-section-suggest-sidenav-tooltip"),
      icon: ICON,
    },
    onItemChange: ({ item, setEnabled }: any) => {
      setEnabled(!!item?.isRegularItem?.());
    },
    onRender: ({ doc, body, item, editable }: any) => {
      if (!item?.isRegularItem?.()) return;
      const v: View = { doc, body, item, editable };
      views.set(body, v);
      draw(v);
    },
    onDestroy: ({ body }: any) => {
      views.delete(body);
    },
  });
}

export function unregisterItemPaneSection(): void {
  if (sectionKey) (Zotero as any).ItemPaneManager.unregisterSection(sectionKey);
  sectionKey = false;
  states.clear();
}
