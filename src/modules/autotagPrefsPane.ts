// src/modules/autotagPrefsPane.ts
// Wires the Autotag preference pane (addon/content/preferences.xhtml) to prefs.

declare const Zotero: _ZoteroTypes.Zotero;

import {
  PROMPT_PRESETS,
  getBool,
  getFinalPrompt,
  getPrefRaw,
  getSelectedProvider,
  getStr,
  getTagOptions,
  setPrefRaw,
  setSelectedProvider,
} from "./autotagPrefs";
import { PROVIDERS, getProviderInfo } from "./llmproviders/providerInfo";
import { getLLMProviderById } from "./llmproviders";
import { cleanTagList } from "./tagCleaner";

const CUSTOM = "__custom__";

export function initPrefsPane(win: any): void {
  const doc: Document = win.document;
  const $ = (id: string) => doc.getElementById(id) as any;
  const root = $("autotag-pane");
  if (!root || root.dataset.atInit) return;
  root.dataset.atInit = "1";

  const xul = (tag: string, attrs: Record<string, string>) => {
    const el = (doc as any).createXULElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  const fill = (menulist: any, entries: [string, string][], value: string) => {
    const popup = menulist.querySelector("menupopup");
    popup.textContent = "";
    for (const [label, val] of entries)
      popup.appendChild(xul("menuitem", { label, value: val }));
    menulist.value = value;
    if (menulist.value !== value && entries.length) menulist.selectedIndex = 0;
  };
  const on = (el: any, events: string[], fn: () => void) =>
    events.forEach((e) => el.addEventListener(e, fn));

  /* ---------- generic data-pref bindings ---------- */
  root.querySelectorAll("[data-pref]").forEach((el: any) => {
    const name = el.dataset.pref as string;
    const isInt = el.dataset.type === "int";
    const tag = el.localName;

    if (tag === "checkbox") {
      el.checked = getBool(name, false);
      on(el, ["command"], () => {
        setPrefRaw(name, !!el.checked);
        refresh();
      });
    } else if (tag === "menulist") {
      el.value = getStr(name);
      on(el, ["command", "change"], () => {
        setPrefRaw(name, String(el.value));
        refresh();
      });
    } else {
      el.value = getStr(name);
      on(el, ["input", "change"], () => {
        if (isInt) {
          const n = Math.floor(Number(el.value));
          if (el.value === "" || !Number.isFinite(n)) return;
          setPrefRaw(name, n);
        } else {
          setPrefRaw(name, String(el.value));
        }
        refresh();
      });
    }
  });

  /* ---------- provider block ---------- */
  const providerMenu = $("at-provider");
  fill(
    providerMenu,
    PROVIDERS.map((p) => [p.label, p.id]),
    getSelectedProvider(),
  );

  const keyInput = $("at-key");
  const baseInput = $("at-base");
  const modelMenu = $("at-model");
  const modelCustom = $("at-model-custom");
  const status = $("at-status");
  let liveModels: string[] = [];

  const setStatus = (text: string, kind: "" | "ok" | "err" = "") => {
    status.textContent = text;
    status.className = "at-status " + kind;
  };

  const currentProvider = () =>
    getProviderInfo(String(providerMenu.value || getSelectedProvider()));

  function renderModelList() {
    const p = currentProvider();
    const saved = getStr(`model.${p.id}`).trim() || p.defaultModel;
    const names = Array.from(new Set([...p.presets, ...liveModels]));
    const known = names.includes(saved);
    const entries: [string, string][] = names.map((n) => [n, n]);
    entries.push(["Custom model ID...", CUSTOM]);
    fill(modelMenu, entries, known || !saved ? saved : CUSTOM);
    const isCustom = modelMenu.value === CUSTOM || (!known && !!saved);
    if (isCustom) modelMenu.value = CUSTOM;
    modelCustom.hidden = !isCustom;
    modelCustom.value = isCustom ? saved : "";
  }

  function renderProvider() {
    const p = currentProvider();
    liveModels = [];
    setStatus("");
    $("at-provider-hint").textContent = p.hint;
    root
      .querySelectorAll('[data-needs="key"]')
      .forEach((e: any) => (e.hidden = !p.needsKey));
    root
      .querySelectorAll('[data-needs="base"]')
      .forEach((e: any) => (e.hidden = !p.baseUrlEditable));
    $("at-key-link").hidden = !p.keyHelpURL;
    keyInput.value = getStr(`apiKey.${p.id}`);
    baseInput.value = getStr(`baseURL.${p.id}`);
    baseInput.placeholder = p.baseUrlDefault || "https://host/v1";
    renderModelList();
  }

  on(providerMenu, ["command", "change"], () => {
    setSelectedProvider(String(providerMenu.value));
    renderProvider();
  });
  on(keyInput, ["input", "change"], () => {
    setPrefRaw(`apiKey.${currentProvider().id}`, keyInput.value.trim());
  });
  on(baseInput, ["input", "change"], () => {
    setPrefRaw(`baseURL.${currentProvider().id}`, baseInput.value.trim());
  });
  on(modelMenu, ["command", "change"], () => {
    const p = currentProvider();
    if (modelMenu.value === CUSTOM) {
      modelCustom.hidden = false;
      modelCustom.focus();
    } else {
      modelCustom.hidden = true;
      setPrefRaw(`model.${p.id}`, String(modelMenu.value));
    }
  });
  on(modelCustom, ["input", "change"], () => {
    setPrefRaw(`model.${currentProvider().id}`, modelCustom.value.trim());
  });

  $("at-key-toggle").addEventListener("click", () => {
    const show = keyInput.type === "password";
    keyInput.type = show ? "text" : "password";
    $("at-key-toggle").textContent = show ? "Hide" : "Show";
  });
  $("at-key-link").addEventListener("click", (e: Event) => {
    e.preventDefault();
    const url = currentProvider().keyHelpURL;
    if (url) (Zotero as any).launchURL(url);
  });

  $("at-test").addEventListener("click", async () => {
    const p = currentProvider();
    setStatus("Testing...");
    try {
      const models = await getLLMProviderById(p.id).listModels();
      liveModels = models;
      renderModelList();
      setStatus(`Connected. ${models.length} model(s) available.`, "ok");
    } catch (e: any) {
      setStatus(String(e?.message || e), "err");
    }
  });

  /* ---------- prompt ---------- */
  const promptBox = $("at-prompt");
  const presetMenu = $("at-preset");
  fill(
    presetMenu,
    PROMPT_PRESETS.map((p) => [p.label, p.id]),
    "default",
  );
  promptBox.value = getFinalPrompt();
  on(promptBox, ["input", "change"], () => {
    const v = String(promptBox.value);
    setPrefRaw("finalPrompt", v.trim() === PROMPT_PRESETS[0].text ? "" : v);
  });
  on(presetMenu, ["command"], () => {
    const preset = PROMPT_PRESETS.find((p) => p.id === presetMenu.value);
    if (!preset) return;
    promptBox.value = preset.text;
    setPrefRaw("finalPrompt", preset.id === "default" ? "" : preset.text);
  });
  $("at-prompt-reset").addEventListener("click", () => {
    promptBox.value = PROMPT_PRESETS[0].text;
    presetMenu.value = "default";
    setPrefRaw("finalPrompt", "");
  });

  /* ---------- conditional rows + live cleanup preview ---------- */
  const sample = $("at-sample");
  const preview = $("at-preview");

  function refresh() {
    const show = (sel: string, visible: boolean) =>
      root.querySelectorAll(sel).forEach((e: any) => (e.hidden = !visible));
    show('[data-needs="pdf"]', getBool("content.includePdfText", false));
    show('[data-needs="vocab"]', getBool("tags.reuseLibraryTags", false));
    $("at-pdflimit").hidden = getStr("content.pdfTextMode") === "full_text";

    try {
      const out = cleanTagList(
        String(sample.value).split(","),
        getTagOptions(),
        {
          seeds: getStr("seedKeywords")
            .split(/[,\n;]+/)
            .map((s) => s.trim())
            .filter(Boolean),
        },
      );
      preview.textContent = out.length ? out.join(" | ") : "(all tags removed)";
    } catch (e) {
      preview.textContent = String(e);
    }
  }
  on(sample, ["input"], refresh);

  renderProvider();
  refresh();
  void getPrefRaw;
}
