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
  getTagOptions,
  isDebugEnabled,
  isReviewEnabled,
  openAutotagSettings,
  Services,
  type TagOptions,
} from "./autotagPrefs";
import {
  getItemMetadata,
  resolveRegularItems,
  type ItemMetadata,
} from "./autotagItems";
import { cleanTagList } from "./tagCleaner";
import { openReviewDialog, type ReviewRow } from "./autotagReview";
import { getLLMProvider } from "./llmproviders";

type LLMItemTags = { key: string; tags: string[] };

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

/* ---------- prompt ---------- */

function listField(v: string[]): string {
  return v.length ? v.join(", ") : "(none)";
}

function buildPrompt(
  items: ItemMetadata[],
  vocab: string[],
  t: TagOptions,
): string {
  const c = getPromptContentOptions();
  const seeds = getSeedKeywords();
  const rules: string[] = [];
  if (t.maxPerItem > 0)
    rules.push(`Return at most ${t.maxPerItem} tags per paper.`);
  if (t.language) rules.push(`Write all tags in ${t.language}.`);
  if (t.tagCase === "lower") rules.push("Use lowercase tags.");
  if (t.tagCase === "snake") rules.push("Use lowercase snake_case tags.");
  if (t.tagCase === "kebab") rules.push("Use lowercase kebab-case tags.");
  if (t.tagCase === "title") rules.push("Use Title Case tags.");
  rules.push("Never use slashes, quotes, or special characters inside a tag.");
  rules.push("Return one entry per paper, using the exact key given.");

  const blocks: string[] = [];
  if (seeds) {
    blocks.push(
      `Preferred tag vocabulary:\nseed_keywords = [${seeds}]\n` +
        (t.restrictToSeeds
          ? "- Use ONLY tags from this list. Omit a tag if none apply."
          : "- Prefer these tags when they clearly apply; do not force them."),
    );
  }
  if (vocab.length) {
    blocks.push(
      `Tags already used in this library (reuse them when they fit instead of inventing near-duplicates):\n${vocab.join(", ")}`,
    );
  }

  const papers = items
    .map((it, i) => {
      const L: string[] = [`Paper ${i + 1}:`, `key: ${it.key}`];
      const add = (label: string, v: string) =>
        v.trim() && L.push(`${label}: ${v.trim()}`);
      add("itemType", it.itemType);
      if (c.includeTitle) add("title", it.title);
      if (c.includeCreators) add("creators", it.creators.join("; "));
      if (c.includePublicationTitle) add("journal", it.publicationTitle);
      if (c.includeDate) add("date", it.date);
      if (c.includeDOI) add("doi", it.doi);
      if (c.includeExistingTags) L.push(`existing_tags: ${listField(it.tags)}`);
      if (c.includeAbstract)
        L.push("abstract:", it.abstract.trim() || "[no abstract available]");
      if (c.includePdfText)
        L.push(
          "pdf_text:",
          it.pdfText?.trim() || "[no extracted PDF text available]",
        );
      return L.join("\n");
    })
    .join("\n\n---\n\n");

  return [
    getFinalPrompt(),
    "",
    "Additional rules:",
    ...rules.map((r) => `- ${r}`),
    "",
    "Output format: return only raw JSON (no Markdown, no code fences, no commentary):",
    '{"items":[{"key":"<Zotero item key>","tags":["tag1","tag2"]}]}',
    ...(blocks.length ? ["", ...blocks] : []),
    "",
    "=== PAPERS ===",
    "",
    papers,
  ].join("\n");
}

/* ---------- LLM call ---------- */

function sanitizeJson(content: string): string {
  let text = String(content || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) text = fenced[1].trim();
  text = text.replace(/^json\s*\n/i, "").trim();
  if (!text.startsWith("{") && !text.startsWith("[")) {
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a >= 0 && b > a) text = text.slice(a, b + 1);
  }
  return text;
}

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

  let parsed: any;
  try {
    parsed = JSON.parse(sanitizeJson(content));
  } catch {
    throw new Error(
      `Model returned invalid JSON. Start of response:\n${content.slice(0, 500)}`,
    );
  }
  if (Array.isArray(parsed)) parsed = { items: parsed };
  if (!Array.isArray(parsed?.items)) {
    throw new Error(
      `Model JSON had no "items" array:\n${JSON.stringify(parsed).slice(0, 500)}`,
    );
  }

  const valid = new Set(batch.map((b) => b.key));
  const out: LLMItemTags[] = [];
  parsed.items.forEach((x: any, i: number) => {
    let key = String(x?.key || "").trim();
    if (!valid.has(key))
      key = batch.length === parsed.items.length ? batch[i].key : "";
    const raw = x?.tags;
    const tags = Array.isArray(raw)
      ? raw.map((t: any) => String(t))
      : typeof raw === "string"
        ? raw.split(",")
        : [];
    if (key) out.push({ key, tags });
  });
  return out;
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

/* ---------- entry point ---------- */

export async function runAutotagForSelection(
  win: _ZoteroTypes.MainWindow,
): Promise<void> {
  if (running) {
    notify("Autotag", "A run is already in progress.", 3000);
    return;
  }

  const pane = (Zotero as any).getActiveZoteroPane?.();
  const selected = resolveRegularItems(pane?.getSelectedItems?.() || []);
  if (!selected.length) {
    notify("Autotag", "Select one or more regular items first.", 4000, true);
    return;
  }

  const provider = getLLMProvider();
  const cfgError = getProviderConfigError(provider.name);
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
  const g = getGenerationOptions();
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
    const vocab = t.reuseLibraryTags ? lib.top : [];
    const seeds = getSeedKeywords()
      .split(/[,\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const results = new Map<string, string[]>();
    const errors: string[] = [];
    const batches: ItemMetadata[][] = [];
    for (let i = 0; i < metas.length; i += g.batchSize)
      batches.push(metas.slice(i, i + g.batchSize));

    for (let b = 0; b < batches.length; b++) {
      progress.update(
        `Asking ${provider.name} (${getModelForProvider(provider.name)}) - batch ${b + 1}/${batches.length}`,
        Math.round((b / batches.length) * 100),
      );
      const prompt = buildPrompt(batches[b], vocab, t);
      verbose(`prompt:\n${prompt}`);
      try {
        for (const r of await tagBatch(prompt, batches[b])) {
          const cleaned = cleanTagList(r.tags, t, {
            libraryTags: lib.all,
            seeds,
          });
          results.set(r.key, [...(results.get(r.key) || []), ...cleaned]);
        }
      } catch (e: any) {
        errors.push(`Batch ${b + 1}: ${e?.message || e}`);
        debug(`batch ${b + 1} failed: ${e?.message || e}`);
        if (/Authentication failed|not found/i.test(String(e?.message))) break;
      }
    }

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
          apply: true,
        }));
      const reviewed = openReviewDialog(win, rows, t);
      if (!reviewed) {
        progress.finish("Cancelled. No tags were changed.", 3000);
        return;
      }
      final = new Map(
        reviewed.map((r) => [
          r.key,
          cleanTagList(r.tags, t, { libraryTags: lib.all, seeds }),
        ]),
      );
    }

    const done = await applyTags(itemsByKey, final, t);
    const parts = [`Added ${done.tags} tag(s) to ${done.items} item(s).`];
    if (skipped) parts.push(`${skipped} already tagged, skipped.`);
    if (errors.length) parts.push(`${errors.length} batch(es) failed.`);
    progress.finish(
      parts.join(" "),
      errors.length ? 8000 : 5000,
      !!errors.length && !done.items,
    );

    if (errors.length) {
      Services?.prompt?.alert?.(
        win,
        "Autotag: some batches failed",
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
