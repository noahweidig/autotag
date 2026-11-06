/* eslint-disable no-control-regex, no-useless-escape */
// src/modules/tagCleaner.ts
// Pure tag normalisation. No Zotero access, so it is easy to reason about.

import type { TagOptions } from "./autotagPrefs";

const SLASHES = /[/\\|]+/g;
// Anything that is not a letter, number, space, underscore, hyphen, or plus/hash (c++, c#)
const SPECIAL = /[^\p{L}\p{N}\s_\-+#.]/gu;
const ZERO_WIDTH = new RegExp(
  "[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202f\\u2060\\ufeff]",
  "g",
);

/** Key used to decide two tags are "the same": case, separators, accents, trailing plural. */
export function canonicalKey(tag: string): string {
  let k = tag
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_\-.]+/g, "");
  if (k.length > 3 && k.endsWith("ies")) k = k.slice(0, -3) + "y";
  else if (k.length > 3 && /[^s]s$/.test(k) && !k.endsWith("ss"))
    k = k.slice(0, -1);
  return k;
}

function titleCase(words: string[]): string {
  return words
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function applyFormat(words: string[], o: TagOptions): string {
  let ws = words;
  switch (o.tagCase) {
    case "lower":
      ws = ws.map((w) => w.toLowerCase());
      break;
    case "snake":
    case "kebab":
      ws = ws.map((w) => w.toLowerCase());
      break;
    case "title":
      return joinWith(titleCase(ws).split(" "), o);
  }
  return joinWith(ws, o);
}

function joinWith(words: string[], o: TagOptions): string {
  let sep = " ";
  if (o.tagCase === "snake") sep = "_";
  else if (o.tagCase === "kebab") sep = "-";
  if (o.separator === "underscore") sep = "_";
  else if (o.separator === "hyphen") sep = "-";
  else if (o.separator === "space") sep = " ";
  else if (
    o.separator === "keep" &&
    o.tagCase !== "snake" &&
    o.tagCase !== "kebab"
  ) {
    return words.join(" ");
  }
  return words.join(sep);
}

export function cleanTag(raw: string, o: TagOptions): string {
  let t = String(raw ?? "").replace(ZERO_WIDTH, "");
  t = t.replace(/<[^>]*>/g, " ").replace(/^[#@*\-•\d.)\s]+(?=\p{L})/u, "");
  t = t.replace(/^["'`“”‘’\[\]()]+|["'`“”‘’\[\]()]+$/g, "");

  if (o.stripSlashes) t = t.replace(SLASHES, " ");
  if (o.stripSpecial) t = t.replace(SPECIAL, " ");

  // Split camelCase / separators into words, then re-join per format.
  let words = t.split(/[\s_]+/).filter(Boolean);
  if (
    o.separator !== "keep" ||
    o.tagCase === "snake" ||
    o.tagCase === "kebab"
  ) {
    words = words.flatMap((w) => w.split(/-(?=\p{L})/u)).filter(Boolean);
  }
  words = words.map((w) => w.replace(/^[-.]+|[-.]+$/g, "")).filter(Boolean);

  if (o.maxWords > 0 && words.length > o.maxWords)
    words = words.slice(0, o.maxWords);

  let out = applyFormat(words, o).trim();
  if (o.maxLength > 0 && out.length > o.maxLength) {
    out =
      out
        .slice(0, o.maxLength)
        .replace(/[\s_-]+\S*$/, "")
        .trim() || out.slice(0, o.maxLength);
  }

  for (const [from, to] of o.replacements) {
    if (canonicalKey(out) === canonicalKey(from)) {
      out = to;
      break;
    }
  }
  return out.trim();
}

export type CleanContext = {
  /** Existing library tags; matching ones win over new spellings. */
  libraryTags?: string[];
  /** Seed vocabulary (for restrictToSeeds). */
  seeds?: string[];
};

/** Full pipeline for one item's tag list. */
export function cleanTagList(
  tags: string[],
  o: TagOptions,
  ctx: CleanContext = {},
): string[] {
  const lib = new Map<string, string>();
  if (o.mergeWithLibrary) {
    for (const t of ctx.libraryTags || []) {
      const k = canonicalKey(t);
      if (k && !lib.has(k)) lib.set(k, t);
    }
  }
  for (const s of ctx.seeds || []) {
    const k = canonicalKey(s);
    if (k) lib.set(k, s.trim());
  }
  const seedKeys = new Set((ctx.seeds || []).map(canonicalKey));
  const black = new Set(o.blacklist.map(canonicalKey));

  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    // A single "tag" holding several comma/semicolon separated tags is common in sloppy output.
    for (const piece of String(raw ?? "").split(/[;\n]+/)) {
      let t = cleanTag(piece, o);
      if (!t) continue;
      const k = canonicalKey(t);
      if (!k || black.has(k)) continue;
      if (o.restrictToSeeds && seedKeys.size && !seedKeys.has(k)) continue;
      if (o.mergeWithLibrary && lib.has(k)) t = lib.get(k)!;
      if (o.dedupe) {
        if (seen.has(k)) continue;
        seen.add(k);
      }
      if (o.prefix && !t.startsWith(o.prefix)) t = o.prefix + t;
      out.push(t);
    }
  }
  return o.maxPerItem > 0 ? out.slice(0, o.maxPerItem) : out;
}
