// src/modules/autotagPrefs.ts
// All preference access. Every key lives under extensions.zotero.autotag.*
// and is read/written with global=true. Defaults are declared in addon/prefs.js.

declare const Zotero: _ZoteroTypes.Zotero;
declare const ChromeUtils: any;

import { getProviderInfo } from "./llmproviders/providerInfo";
import { parseLearned, type Learned } from "./learning";

let ServicesAny: any = (Zotero as any)?.Services;
if (!ServicesAny) {
  try {
    const mod = ChromeUtils.importESModule(
      "resource://gre/modules/Services.sys.mjs",
    );
    ServicesAny = mod.Services || mod.default || mod;
  } catch {
    // leave undefined
  }
}
export const Services: any = ServicesAny;

export const PREF_BRANCH = "extensions.zotero.autotag.";

export type PdfTextMode = "first_n_chars" | "full_text";
export type TagCase = "keep" | "lower" | "snake" | "kebab" | "title";

export type PromptContentOptions = {
  includeTitle: boolean;
  includeCreators: boolean;
  includePublicationTitle: boolean;
  includeDate: boolean;
  includeDOI: boolean;
  includeExistingTags: boolean;
  includeAbstract: boolean;
  includePdfText: boolean;
  pdfTextMode: PdfTextMode;
  pdfTextCharLimit: number;
};

export type GenerationOptions = {
  temperature: number | null;
  maxTokens: number;
  timeoutMs: number;
  batchSize: number;
  jsonMode: boolean;
};

export type TagSeparator = "keep" | "space" | "underscore" | "hyphen";

export type TagOptions = {
  separator: TagSeparator;
  stripSlashes: boolean;
  stripSpecial: boolean;
  dedupe: boolean;
  mergeWithLibrary: boolean;
  maxWords: number;
  maxLength: number;
  blacklist: string[];
  replacements: [string, string][];
  maxPerItem: number;
  tagCase: TagCase;
  prefix: string;
  language: string;
  asAutomatic: boolean;
  skipTagged: boolean;
  restrictToSeeds: boolean;
  reuseLibraryTags: boolean;
  libraryVocabLimit: number;
  marker: string;
};

export type TagMode = "ai" | "free" | "both";

export type SourceOptions = {
  mode: TagMode;
  openalex: boolean;
  openalexKey: string;
  openalexMinScore: number;
  openalexSubfield: boolean;
  crossref: boolean;
  pubmed: boolean;
  local: boolean;
  localMax: number;
  localOnlyFallback: boolean;
  contact: string;
  library: boolean;
  libraryK: number;
  libraryMax: number;
  libraryMinItems: number;
};

/* ---------- raw helpers ---------- */

export function getPrefRaw(name: string): unknown {
  try {
    return Zotero.Prefs.get(PREF_BRANCH + name, true);
  } catch {
    return undefined;
  }
}

export function setPrefRaw(name: string, value: string | number | boolean) {
  Zotero.Prefs.set(PREF_BRANCH + name, value, true);
}

export function clearPrefRaw(name: string) {
  try {
    Zotero.Prefs.clear(PREF_BRANCH + name, true);
  } catch {
    // ignore
  }
}

export function getStr(name: string, fallback = ""): string {
  const raw = getPrefRaw(name);
  return raw == null ? fallback : String(raw);
}

export function getBool(name: string, fallback: boolean): boolean {
  const raw = getPrefRaw(name);
  if (raw === true || raw === false) return raw;
  if (raw == null || raw === "") return fallback;
  const s = String(raw).trim().toLowerCase();
  if (["true", "1", "yes"].includes(s)) return true;
  if (["false", "0", "no"].includes(s)) return false;
  return fallback;
}

export function getInt(name: string, fallback: number, min = 0): number {
  const n = Number(getPrefRaw(name));
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}

/* ---------- provider ---------- */

export function getSelectedProvider(): string {
  return getStr("llmProvider", "openai") || "openai";
}

export function setSelectedProvider(id: string): void {
  setPrefRaw("llmProvider", id);
}

export function getApiKeyForProvider(provider: string): string {
  if (!getProviderInfo(provider).needsKey) return "";
  return getStr(`apiKey.${provider}`).trim();
}

export function getBaseUrlForProvider(provider: string): string {
  const info = getProviderInfo(provider);
  if (!info.baseUrlEditable) return info.baseUrlDefault;
  const custom = getStr(`baseURL.${provider}`).trim().replace(/\/+$/, "");
  return custom || info.baseUrlDefault;
}

export function getModelForProvider(provider: string): string {
  const info = getProviderInfo(provider);
  return getStr(`model.${provider}`).trim() || info.defaultModel;
}

export function getProviderConfigError(provider: string): string | null {
  const info = getProviderInfo(provider);
  if (info.needsKey && !info.keyOptional && !getApiKeyForProvider(provider)) {
    return `No API key set for ${info.label}.`;
  }
  if (provider === "custom" && !getBaseUrlForProvider(provider)) {
    return "Custom provider needs a Base URL.";
  }
  if (!getModelForProvider(provider)) {
    return `No model set for ${info.label}.`;
  }
  return null;
}

/* ---------- prompt & seeds ---------- */

export const PROMPT_PRESETS: { id: string; label: string; text: string }[] = [
  {
    id: "default",
    label: "Balanced (default)",
    text: `
You are an assistant that reads scientific papers and assigns concise, reusable tags.

Rules:
- Tags are one to three words
- Use simple ASCII, no punctuation except underscores or hyphens
- Avoid overly generic terms like "study" or "research"
- Reuse identical tags across papers for the same concept

For each paper generate three to eight tags covering:
- Topic
- Method or technique
- Material system, dataset, or model organism
`.trim(),
  },
  {
    id: "broad",
    label: "Broad topics (3-5 tags)",
    text: `
You assign a few broad, high-level subject tags to papers so a large library can be browsed by theme.

Rules:
- Three to five tags per paper
- Each tag is one or two words
- Prefer field or sub-field names over specific techniques
- Reuse identical tags across papers
`.trim(),
  },
  {
    id: "methods",
    label: "Methods and materials",
    text: `
You assign tags that capture how a paper was done and what it studied.

For each paper include, when stated:
- Experimental or computational method
- Instruments, algorithms, or models used
- Material system, organism, dataset, or population
- Application domain

Tags are one to three words, lowercase, reused consistently across papers.
`.trim(),
  },
  {
    id: "humanities",
    label: "Humanities / social science",
    text: `
You assign tags to scholarly works in the humanities and social sciences.

For each work include, when relevant:
- Subject or theme
- Theoretical framework or school of thought
- Method (e.g. ethnography, discourse analysis, survey)
- Period, region, or population

Tags are one to three words and reused consistently across works.
`.trim(),
  },
];

export function getDefaultPrompt(): string {
  return PROMPT_PRESETS[0].text;
}

export function getFinalPrompt(): string {
  const raw = getStr("finalPrompt");
  return raw.trim() ? raw : getDefaultPrompt();
}

export function getSeedKeywords(): string {
  return getStr("seedKeywords").trim();
}

/* ---------- grouped options ---------- */

export function getPromptContentOptions(): PromptContentOptions {
  const mode = getStr("content.pdfTextMode").toLowerCase();
  return {
    includeTitle: getBool("content.includeTitle", true),
    includeCreators: getBool("content.includeCreators", true),
    includePublicationTitle: getBool("content.includePublicationTitle", true),
    includeDate: getBool("content.includeDate", true),
    includeDOI: getBool("content.includeDOI", false),
    includeExistingTags: getBool("content.includeExistingTags", true),
    includeAbstract: getBool("content.includeAbstract", true),
    includePdfText: getBool("content.includePdfText", false),
    pdfTextMode: mode === "full_text" ? "full_text" : "first_n_chars",
    pdfTextCharLimit: getInt("content.pdfTextCharLimit", 4000, 1),
  };
}

export function getGenerationOptions(): GenerationOptions {
  const raw = getStr("gen.temperature").trim();
  const t = raw === "" ? null : Number(raw);
  return {
    temperature: t !== null && Number.isFinite(t) ? t : null,
    maxTokens: getInt("gen.maxTokens", 0, 0),
    timeoutMs: getInt("gen.timeoutSec", 120, 5) * 1000,
    batchSize: getInt("gen.batchSize", 5, 1),
    jsonMode: getBool("gen.jsonMode", false),
  };
}

export function getTagOptions(): TagOptions {
  const c = getStr("tags.case", "keep");
  const tagCase: TagCase = [
    "keep",
    "lower",
    "snake",
    "kebab",
    "title",
  ].includes(c)
    ? (c as TagCase)
    : "keep";
  const sep = getStr("tags.separator", "keep");
  const splitList = (v: string) =>
    v
      .split(/[\n,;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  const replacements: [string, string][] = [];
  for (const line of getStr("tags.replacements").split(/\n+/)) {
    const i = line.indexOf("=");
    if (i < 1) continue;
    const from = line.slice(0, i).trim();
    const to = line.slice(i + 1).trim();
    if (from) replacements.push([from, to]);
  }
  return {
    separator: ["keep", "space", "underscore", "hyphen"].includes(sep)
      ? (sep as TagSeparator)
      : "keep",
    stripSlashes: getBool("tags.stripSlashes", true),
    stripSpecial: getBool("tags.stripSpecial", true),
    dedupe: getBool("tags.dedupe", true),
    mergeWithLibrary: getBool("tags.mergeWithLibrary", true),
    maxWords: getInt("tags.maxWords", 4, 0),
    maxLength: getInt("tags.maxLength", 40, 0),
    blacklist: splitList(getStr("tags.blacklist")),
    replacements,
    maxPerItem: getInt("tags.maxPerItem", 8, 0),
    tagCase,
    prefix: getStr("tags.prefix"),
    language: getStr("tags.language").trim(),
    asAutomatic: getBool("tags.asAutomatic", false),
    skipTagged: getBool("tags.skipTagged", false),
    restrictToSeeds: getBool("tags.restrictToSeeds", false),
    reuseLibraryTags: getBool("tags.reuseLibraryTags", false),
    libraryVocabLimit: getInt("tags.libraryVocabLimit", 100, 1),
    marker: getStr("tags.marker").trim(),
  };
}

export function getSourceOptions(): SourceOptions {
  const m = getStr("source.mode", "ai");
  const score = Number(getStr("source.openalexMinScore", "0.5"));
  return {
    mode: m === "free" || m === "both" ? m : "ai",
    openalex: getBool("source.openalex", true),
    openalexKey: getStr("source.openalexKey").trim(),
    openalexMinScore:
      Number.isFinite(score) && score >= 0 && score <= 1 ? score : 0.5,
    openalexSubfield: getBool("source.openalexSubfield", true),
    crossref: getBool("source.crossref", false),
    pubmed: getBool("source.pubmed", false),
    local: getBool("source.local", true),
    localMax: getInt("source.localMax", 5, 1),
    localOnlyFallback: getBool("source.localOnlyFallback", true),
    contact: getStr("source.contact").trim(),
    library: getBool("source.library", true),
    libraryK: getInt("source.libraryK", 8, 2),
    libraryMax: getInt("source.libraryMax", 6, 1),
    libraryMinItems: getInt("source.libraryMinItems", 30, 5),
  };
}

/* ---------- learning ---------- */

export function isLearningEnabled(): boolean {
  return getBool("learn.enabled", true);
}

export function getLearned(): Learned {
  return parseLearned(getStr("learn.data"));
}

export function saveLearned(l: Learned): void {
  setPrefRaw("learn.data", JSON.stringify(l));
}

export function clearLearned(): void {
  setPrefRaw("learn.data", "");
}

export function isReviewEnabled(): boolean {
  return getBool("workflow.review", true);
}

export function isDebugEnabled(): boolean {
  return getBool("workflow.debug", false);
}

/* ---------- opening the pane ---------- */

export const PREF_PANE_ID = "zotero-prefpane-autotag";

export function openAutotagSettings(_win?: unknown): void {
  try {
    (Zotero as any).Utilities.Internal.openPreferences(PREF_PANE_ID);
  } catch (e) {
    (Zotero as any).debug?.(`Autotag: could not open settings: ${String(e)}`);
  }
}
