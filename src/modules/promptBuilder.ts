// Pure prompt construction (no Zotero or pref access) so it can be unit tested.

import type { ItemMetadata } from "./autotagItems";
import type { PromptContentOptions, TagOptions } from "./autotagPrefs";

export type PromptInput = {
  items: ItemMetadata[];
  basePrompt: string;
  seeds: string;
  vocab: string[];
  content: PromptContentOptions;
  tags: TagOptions;
};

export function buildPrompt(input: PromptInput): string {
  const { items, basePrompt, seeds, vocab, content: c, tags: t } = input;

  const rules: string[] = [];
  if (t.maxPerItem > 0)
    rules.push(`Return at most ${t.maxPerItem} tags per paper.`);
  if (t.language) rules.push(`Write all tags in ${t.language}.`);
  if (t.tagCase === "lower") rules.push("Use lowercase tags.");
  if (t.tagCase === "snake") rules.push("Use lowercase snake_case tags.");
  if (t.tagCase === "kebab") rules.push("Use lowercase kebab-case tags.");
  if (t.tagCase === "title") rules.push("Use Title Case tags.");
  rules.push(
    "Never use slashes, quotes, or special characters inside a tag.",
    "Return one entry per paper, using the exact key given.",
  );

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
      if (c.includeExistingTags) {
        L.push(
          `existing_tags: ${it.tags.length ? it.tags.join(", ") : "(none)"}`,
        );
      }
      if (c.includeAbstract) {
        L.push("abstract:", it.abstract.trim() || "[no abstract available]");
      }
      if (c.includePdfText) {
        L.push(
          "pdf_text:",
          it.pdfText?.trim() || "[no extracted PDF text available]",
        );
      }
      return L.join("\n");
    })
    .join("\n\n---\n\n");

  return [
    basePrompt,
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
