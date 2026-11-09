// src/modules/cleanupAI.ts
// Pure helpers for the AI tag scan: budgeted chunking, prompt, response parsing.
// The scan sends tag NAMES only (no items, abstracts, or counts) and is capped
// by a per-request tag limit and a per-scan request limit.

import { sanitizeJson } from "./llmJson";
import { canonicalKey } from "./tagCleaner";
import type { TagInfo } from "./tagDedupe";

export type ScanBudget = {
  maxTagsPerRequest: number;
  maxRequests: number;
  /** Most-used tags added to every chunk as merge targets. */
  anchorCount: number;
};

export type ScanChunk = { anchors: string[]; candidates: string[] };

export type ScanPlan = {
  chunks: ScanChunk[];
  /** Tags sent in this scan. */
  sent: number;
  /** Tags eligible but left for a later scan because of the budget. */
  pending: number;
  estimatedTokens: number;
};

export const DEFAULT_BUDGET: ScanBudget = {
  maxTagsPerRequest: 150,
  maxRequests: 3,
  anchorCount: 20,
};

export function clampBudget(b: Partial<ScanBudget>): ScanBudget {
  const n = (v: unknown, d: number, lo: number, hi: number) => {
    const x = Math.floor(Number(v));
    return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
  };
  return {
    maxTagsPerRequest: n(
      b.maxTagsPerRequest,
      DEFAULT_BUDGET.maxTagsPerRequest,
      20,
      500,
    ),
    maxRequests: n(b.maxRequests, DEFAULT_BUDGET.maxRequests, 1, 10),
    anchorCount: n(b.anchorCount, DEFAULT_BUDGET.anchorCount, 0, 50),
  };
}

export function buildCleanupPrompt(chunk: ScanChunk, language = ""): string {
  const lines = [
    "You merge duplicate tags in a reference manager. Find tags that mean the same thing: synonyms, abbreviations and their full forms, spelling variants, singular and plural, word order" +
      (language ? ", translations" : "") +
      '. Do NOT merge related but different concepts (for example "neural network" and "deep learning").',
    "",
    "Candidates (one per line):",
    ...chunk.candidates,
  ];
  if (chunk.anchors.length) {
    lines.push(
      "",
      "Established tags (reference only, one per line):",
      ...chunk.anchors,
    );
  }
  lines.push(
    "",
    'Return only JSON: {"groups":[["best tag","duplicate","duplicate"]]}',
    "- Copy tags exactly as written above. Put the best tag to keep first.",
    "- Every group has 2 or more tags and at least 1 candidate.",
    '- Leave out tags with no duplicate. If there are none, return {"groups":[]}.',
    ...(language ? [`- Prefer tags written in ${language}.`] : []),
  );
  return lines.join("\n");
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Chooses which tags to send. Most-used tags first (they matter most), tags
 * already reviewed or already grouped locally are skipped, and the total is
 * capped at maxRequests * maxTagsPerRequest.
 */
export function planScan(
  tags: TagInfo[],
  skipKeys: Set<string>,
  b: ScanBudget,
  language = "",
): ScanPlan {
  const ranked = [...tags].sort(
    (a, c) => c.count - a.count || a.name.localeCompare(c.name),
  );
  const anchorNames = ranked.slice(0, b.anchorCount).map((t) => t.name);
  const pool = ranked.filter((t) => {
    const k = canonicalKey(t.name);
    return k && !skipKeys.has(k);
  });
  const perChunk = Math.max(10, b.maxTagsPerRequest - anchorNames.length);

  const chunks: ScanChunk[] = [];
  let sent = 0;
  for (let i = 0; i < b.maxRequests; i++) {
    const slice = pool.slice(i * perChunk, (i + 1) * perChunk);
    if (!slice.length) break;
    const candidates = slice
      .map((t) => t.name)
      .sort((x, y) => x.localeCompare(y));
    const inChunk = new Set(candidates);
    const anchors = anchorNames.filter((a) => !inChunk.has(a));
    if (candidates.length + anchors.length < 2) break;
    chunks.push({ anchors, candidates });
    sent += candidates.length;
  }
  const estimatedTokens = chunks.reduce(
    (s, c) => s + estimateTokens(buildCleanupPrompt(c, language)),
    0,
  );
  return { chunks, sent, pending: pool.length - sent, estimatedTokens };
}

function namesOf(g: any): unknown[] {
  if (Array.isArray(g)) return g;
  if (Array.isArray(g?.tags)) return g.tags;
  if (Array.isArray(g?.merge)) return [g.keep ?? g.target, ...g.merge];
  return [];
}

/**
 * Parses the model reply into groups of real tag names. Names the model made
 * up are dropped, case-insensitive matches are repaired, tags are used once,
 * and groups need 2+ tags with at least one candidate.
 */
export function parseCleanupResponse(
  content: string,
  chunk: ScanChunk,
): string[][] {
  let parsed: any;
  try {
    parsed = JSON.parse(sanitizeJson(content));
  } catch {
    throw new Error(
      `Model returned invalid JSON. Start of response:\n${String(content).slice(0, 300)}`,
    );
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.groups;
  if (!Array.isArray(list)) {
    throw new TypeError(
      `Model JSON had no "groups" array:\n${JSON.stringify(parsed).slice(0, 300)}`,
    );
  }

  const candidates = new Set(chunk.candidates);
  const exact = new Set([...chunk.candidates, ...chunk.anchors]);
  const loose = new Map<string, string>();
  for (const n of exact) {
    const k = n.trim().toLowerCase();
    if (!loose.has(k)) loose.set(k, n);
  }

  const used = new Set<string>();
  const out: string[][] = [];
  for (const g of list) {
    const group: string[] = [];
    for (const raw of namesOf(g)) {
      const s = String(raw ?? "");
      const name = exact.has(s) ? s : loose.get(s.trim().toLowerCase());
      if (name && !used.has(name) && !group.includes(name)) group.push(name);
    }
    if (group.length < 2 || !group.some((n) => candidates.has(n))) continue;
    group.forEach((n) => used.add(n));
    out.push(group);
  }
  return out;
}

/* ---------- small persisted lists (reviewed tags, ignored groups) ---------- */

export function parseList(raw: string): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** Appends new entries, drops duplicates, keeps only the newest `max`. */
export function mergeCapped(
  existing: string[],
  add: string[],
  max: number,
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const v of [...existing, ...add]) {
    if (v && !seen.has(v)) {
      seen.add(v);
      merged.push(v);
    }
  }
  return merged.slice(-max);
}
