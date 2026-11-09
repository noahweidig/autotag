// src/modules/autotagCore.ts
// Orchestrates a tagging run: collect -> batch -> LLM -> clean -> review -> apply.

declare const Zotero: _ZoteroTypes.Zotero;

import {
  getFinalPrompt,
  getGenerationOptions,
  getModelForProvider,
  getProviderConfigError,
  getPromptContentOptions,
  getSeedKeywords,
  getSourceOptions,
  getTagOptions,
  isDebugEnabled,
  isReviewEnabled,
  openAutotagSettings,
  Services,
  type TagMode,
  type TagOptions,
} from "./autotagPrefs";
import {
  getItemMetadata,
  resolveRegularItems,
  type ItemMetadata,
} from "./autotagItems";
import { canonicalKey, cleanTagList } from "./tagCleaner";
import {
  SOURCE_LABELS,
  suggestFromSources,
  type SourceId,
} from "./metadataSources";
import { openReviewDialog, type ReviewRow } from "./autotagReview";
import { getLLMProvider } from "./llmproviders";
import { parseTagResponse, type LLMItemTags } from "./llmJson";
import { buildPrompt } from "./promptBuilder";

let running = false;
const ICON = "chrome://autotag/content/icons/autotag.png";
const debug = (msg: string) => (Zotero as any).debug?.(`[Autotag] ${msg}`);
const verbose = (msg: string) => {
  if (isDebugEnabled()) debug(msg);
};

/* ---------- progress UI ---------- */

class Progress {
  private pw: any;
  private line: any;
  constructor(headline: string, text: string) {
    this.pw = new (Zotero as any).ProgressWindow({ closeOnClick: true });
    this.pw.changeHeadline(headline);
    this.line = new this.pw.ItemProgress(ICON, text);
    this.pw.show();
  }
  update(text: string, percent?: number) {
    this.line.setText(text);
    if (percent !== undefined) this.line.setProgress(percent);
  }
  finish(text: string, ms = 5000, error = false) {
    this.line.setText(text);
    this.line.setProgress(100);
    if (error) this.line.setError?.();
    this.pw.startCloseTimer(ms);
  }
}

function notify(headline: string, text: string, ms = 5000, error = false) {
  const p = new Progress(headline, text);
  p.finish(text, ms, error);
}

/* ---------- LLM call ---------- */

async function tagBatch(
  prompt: string,
  batch: ItemMetadata[],
): Promise<LLMItemTags[]> {
  const provider = getLLMProvider();
  const model = getModelForProvider(provider.name);
  let content: string;
  try {
    content = await provider.generateTags(prompt);
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    debug(`provider error (${provider.name}/${model}): ${msg}`);
    if (/404/.test(msg) && /not found/i.test(msg)) {
      throw new Error(
        `Model "${model}" not found. Pick another in Autotag settings. (${msg})`,
      );
    }
    if (/401|403|invalid.*key|unauthorized/i.test(msg)) {
      throw new Error(
        `Authentication failed. Check your API key in Autotag settings. (${msg})`,
      );
    }
    if (/429/.test(msg)) {
      throw new Error(
        `Rate limited by ${provider.name}. Lower the batch size or retry later. (${msg})`,
      );
    }
    throw new Error(`${provider.name} (${model}): ${msg}`);
  }
  verbose(`raw response:\n${content}`);

  return parseTagResponse(
    content,
    batch.map((b) => b.key),
  );
}

const CONCURRENCY = 3;
const MAX_RETRIES = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries rate limits and transient server errors with backoff. */
async function tagBatchWithRetry(
  prompt: string,
  batch: ItemMetadata[],
): Promise<LLMItemTags[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await tagBatch(prompt, batch);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (attempt >= MAX_RETRIES || !/Rate limited|429|HTTP 5\d\d/.test(msg))
        throw e;
      const wait = 2000 * 2 ** attempt + Math.random() * 500;
      debug(`retry ${attempt + 1} in ${Math.round(wait)}ms: ${msg}`);
      await sleep(wait);
    }
  }
}

/* ---------- library vocabulary ---------- */

async function getLibraryTags(libraryID: number, topN: number) {
  let all: string[] = [];
  let top: string[] = [];
  try {
    all = ((await (Zotero as any).Tags.getAll(libraryID)) || []).map((t: any) =>
      String(t.tag),
    );
  } catch (e) {
    debug(`Tags.getAll failed: ${String(e)}`);
  }
  try {
    const rows = await (Zotero as any).DB.queryAsync(
      `SELECT t.name AS name, COUNT(*) AS c FROM itemTags it
       JOIN tags t USING (tagID) JOIN items i USING (itemID)
       WHERE i.libraryID = ? GROUP BY t.tagID ORDER BY c DESC LIMIT ?`,
      [libraryID, topN],
    );
    top = (rows || []).map((r: any) => String(r.name));
  } catch {
    top = all.slice(0, topN);
  }
  return { all, top };
}

/* ---------- apply ---------- */

async function applyTags(
  itemsByKey: Map<string, any>,
  finalTags: Map<string, string[]>,
  t: TagOptions,
): Promise<{ items: number; tags: number }> {
  let itemCount = 0;
  let tagCount = 0;
  const type = t.asAutomatic ? 1 : 0;
  for (const [key, tags] of finalTags) {
    const item = itemsByKey.get(key);
    if (!item || !tags.length) continue;
    const existing = new Set(
      (item.getTags?.() || []).map((x: any) => String(x.tag).toLowerCase()),
    );
    let changed = false;
    const toAdd = t.marker ? [...tags, t.marker] : tags;
    for (const tag of toAdd) {
      if (existing.has(tag.toLowerCase())) continue;
      item.addTag(tag, type);
      existing.add(tag.toLowerCase());
      tagCount++;
      changed = true;
    }
    if (changed) {
      await item.saveTx();
      itemCount++;
    }
  }
  return { items: itemCount, tags: tagCount };
}

/* ---------- AI step ---------- */

async function runAi(
  metas: ItemMetadata[],
  t: TagOptions,
  lib: { all: string[]; top: string[] },
  progress: Progress,
): Promise<{ tags: Map<string, string[]>; errors: string[] }> {
  const provider = getLLMProvider();
  const g = getGenerationOptions();
  const vocab = t.reuseLibraryTags ? lib.top : [];
  const tags = new Map<string, string[]>();
  const errors: string[] = [];
  const batches: ItemMetadata[][] = [];
  for (let i = 0; i < metas.length; i += g.batchSize)
    batches.push(metas.slice(i, i + g.batchSize));

  const outputs: (LLMItemTags[] | null)[] = batches.map(() => null);
  let completed = 0;
  let fatal = false;
  let next = 0;
  const label = `${provider.name} (${getModelForProvider(provider.name)})`;
  const worker = async () => {
    while (!fatal && next < batches.length) {
      const b = next++;
      const prompt = buildPrompt({
        items: batches[b],
        basePrompt: getFinalPrompt(),
        seeds: getSeedKeywords(),
        vocab,
        content: getPromptContentOptions(),
        tags: t,
      });
      verbose(`prompt:\n${prompt}`);
      try {
        outputs[b] = await tagBatchWithRetry(prompt, batches[b]);
      } catch (e: any) {
        errors.push(`Batch ${b + 1}: ${e?.message || e}`);
        debug(`batch ${b + 1} failed: ${e?.message || e}`);
        if (/Authentication failed|not found/i.test(String(e?.message)))
          fatal = true;
      }
      completed++;
      progress.update(
        `Asking ${label} - batch ${completed}/${batches.length}`,
        Math.round((completed / batches.length) * 100),
      );
    }
  };
  progress.update(`Asking ${label} - ${batches.length} batch(es)`, 0);
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker),
  );
  for (const out of outputs)
    for (const r of out || [])
      tags.set(r.key, [...(tags.get(r.key) || []), ...r.tags]);
  return { tags, errors };
}

/* ---------- entry points ---------- */

export type RunOptions = {
  /** Overrides the "Tagging method" setting for this run. */
  mode?: TagMode;
  /** Items to tag; defaults to the current selection. */
  items?: any[];
};

const SOURCE_ORDER: (SourceId | "ai")[] = [
  "ai",
  "pubmed",
  "openalex",
  "crossref",
  "local",
];

export async function runAutotagForSelection(
  win: _ZoteroTypes.MainWindow,
  run: RunOptions = {},
): Promise<void> {
  if (running) {
    notify("Autotag", "A run is already in progress.", 3000);
    return;
  }

  const pane = (Zotero as any).getActiveZoteroPane?.();
  const selected = resolveRegularItems(
    run.items || pane?.getSelectedItems?.() || [],
  );
  if (!selected.length) {
    notify("Autotag", "Select one or more regular items first.", 4000, true);
    return;
  }

  const src = getSourceOptions();
  const mode: TagMode = run.mode || src.mode;
  const useAi = mode === "ai" || mode === "both";
  const useFree = mode === "free" || mode === "both";

  if (useFree && !src.openalex && !src.crossref && !src.pubmed && !src.local) {
    const open = Services?.prompt?.confirm?.(
      win,
      "Autotag",
      "No free tag source is enabled.\n\nOpen Autotag settings now?",
    );
    if (open) openAutotagSettings(win);
    return;
  }

  const provider = getLLMProvider();
  const cfgError = useAi ? getProviderConfigError(provider.name) : null;
  if (cfgError) {
    const open = Services?.prompt?.confirm?.(
      win,
      "Autotag",
      `${cfgError}\n\nOpen Autotag settings now?`,
    );
    if (open) openAutotagSettings(win);
    return;
  }

  running = true;
  const t = getTagOptions();
  let progress: Progress | null = null;
  try {
    let targets = selected;
    let skipped = 0;
    if (t.skipTagged) {
      targets = selected.filter((it) => !(it.getTags?.() || []).length);
      skipped = selected.length - targets.length;
    }
    if (!targets.length) {
      notify("Autotag", "All selected items already have tags.", 4000);
      return;
    }

    progress = new Progress("Autotag", `Reading ${targets.length} item(s)...`);
    const metas: ItemMetadata[] = [];
    for (const it of targets) metas.push(await getItemMetadata(it));
    const itemsByKey = new Map<string, any>(targets.map((it) => [it.key, it]));

    const libraryID = targets[0].libraryID;
    const lib =
      t.reuseLibraryTags || t.mergeWithLibrary
        ? await getLibraryTags(libraryID, t.libraryVocabLimit)
        : { all: [], top: [] };
    const seeds = getSeedKeywords()
      .split(/[,\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    // raw suggestions per item, tagged with where they came from
    const raw = new Map<string, { tag: string; source: SourceId | "ai" }[]>();
    const errors: string[] = [];
    const push = (key: string, tag: string, source: SourceId | "ai") => {
      const l = raw.get(key) || [];
      l.push({ tag, source });
      raw.set(key, l);
    };

    if (useAi) {
      const ai = await runAi(metas, t, lib, progress);
      errors.push(...ai.errors);
      for (const [k, tags] of ai.tags) for (const x of tags) push(k, x, "ai");
    }
    if (useFree) {
      const free = await suggestFromSources(metas, src, (text, pct) =>
        progress!.update(text, pct),
      );
      errors.push(...free.errors);
      for (const [k, l] of free.suggestions)
        for (const s of l) push(k, s.tag, s.source);
    }

    const results = new Map<string, string[]>();
    const provenance = new Map<string, Map<string, string>>();
    const ctx = { libraryTags: lib.all, seeds };
    for (const [key, list] of raw) {
      list.sort(
        (a, b) =>
          SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source),
      );
      const cleaned = cleanTagList(
        list.map((x) => x.tag),
        t,
        ctx,
      );
      if (!cleaned.length) continue;
      const byKey = new Map<string, string>();
      for (const x of list) {
        const one = cleanTagList([x.tag], { ...t, maxPerItem: 0 }, ctx)[0];
        const k = one ? canonicalKey(one) : "";
        if (k && !byKey.has(k))
          byKey.set(k, x.source === "ai" ? "AI" : SOURCE_LABELS[x.source]);
      }
      results.set(key, cleaned);
      provenance.set(key, byKey);
    }
    const sourcesFor = (key: string, tags: string[]) => {
      const m = provenance.get(key);
      const out: Record<string, string> = {};
      for (const tag of tags) {
        const label = m?.get(canonicalKey(tag));
        if (label) out[tag.toLowerCase()] = label;
      }
      return out;
    };

    let final = results;
    if (results.size && isReviewEnabled()) {
      progress.update("Waiting for your review...", 100);
      const rows: ReviewRow[] = metas
        .filter((m) => results.has(m.key))
        .map((m) => ({
          key: m.key,
          title: m.title || "[untitled]",
          existing: m.tags,
          tags: results.get(m.key) || [],
          sources: sourcesFor(m.key, results.get(m.key) || []),
          apply: true,
        }));
      const reviewed = openReviewDialog(win, rows, t);
      if (!reviewed) {
        progress.finish("Cancelled. No tags were changed.", 3000);
        return;
      }
      final = new Map(
        reviewed.map((r) => [r.key, cleanTagList(r.tags, t, ctx)]),
      );
    }

    const done = await applyTags(itemsByKey, final, t);
    const parts = [`Added ${done.tags} tag(s) to ${done.items} item(s).`];
    const empty = targets.length - results.size;
    if (empty > 0 && useFree && !useAi)
      parts.push(`${empty} item(s) had no suggestions.`);
    if (skipped) parts.push(`${skipped} already tagged, skipped.`);
    if (errors.length) parts.push(`${errors.length} problem(s).`);
    progress.finish(
      parts.join(" "),
      errors.length ? 8000 : 5000,
      !!errors.length && !done.items,
    );

    if (errors.length) {
      Services?.prompt?.alert?.(
        win,
        "Autotag: some lookups failed",
        errors.join("\n\n"),
      );
    }
  } catch (e: any) {
    debug(`run failed: ${e?.stack || e}`);
    progress?.finish("Failed.", 2000, true);
    Services?.prompt?.alert?.(win, "Autotag failed", String(e?.message || e));
  } finally {
    running = false;
  }
}

export async function runAutotagForCollection(
  win: _ZoteroTypes.MainWindow,
  run: Omit<RunOptions, "items"> = {},
): Promise<void> {
  const pane = (Zotero as any).getActiveZoteroPane?.();
  const col = pane?.getSelectedCollection?.();
  if (!col) {
    notify("Autotag", "Select a collection first.", 4000, true);
    return;
  }
  const items = col.getChildItems?.(false) || [];
  await runAutotagForSelection(win, { ...run, items });
}
