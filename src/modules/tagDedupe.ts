// src/modules/tagDedupe.ts
// Local (no network, no Zotero) duplicate detection for the tag manager.

import type { TagOptions } from "./autotagPrefs";
import { canonicalKey, cleanTag } from "./tagCleaner";

export type TagInfo = { name: string; count: number };
export type GroupReason = "format" | "similar" | "abbreviation" | "ai";
export type TagGroup = {
  target: string;
  members: TagInfo[];
  reason: GroupReason;
};

/** Most-used member wins; ties go to the shorter, then alphabetical name. */
export function pickTarget(members: TagInfo[]): TagInfo {
  return [...members].sort(
    (a, b) =>
      b.count - a.count ||
      a.name.length - b.name.length ||
      a.name.localeCompare(b.name),
  )[0];
}

/** Order-independent signature, used to remember ignored groups. */
export function groupSignature(members: { name: string }[]): string {
  return members
    .map((m) => canonicalKey(m.name))
    .sort()
    .join("|");
}

function words(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function acronym(name: string): string {
  const w = words(name);
  return w.length >= 2 ? w.map((x) => x[0]).join("") : "";
}

function sortedKey(name: string): string {
  const w = words(name);
  return w.length >= 2 ? [...w].sort().join("") : "";
}

function maxEdits(len: number): number {
  if (len >= 14) return 2;
  if (len >= 6) return 1;
  return 0;
}

function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** Typo-level similarity on canonical keys. Short keys never match fuzzily. */
function isNearKey(a: string, b: string): boolean {
  const max = maxEdits(Math.min(a.length, b.length));
  if (!max) return false;
  if (a.replace(/\D+/g, "") !== b.replace(/\D+/g, "")) return false;
  return withinEdits(a, b, max);
}

type Bucket = { key: string; members: TagInfo[]; total: number };
type Cluster = { head: Bucket; buckets: Bucket[]; reason: GroupReason };

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}

/**
 * Groups tags that are the same thing written differently. Exact variants
 * (case, separators, accents, plurals) always group. With `fuzzy`, typos, word
 * order and abbreviations (ML / machine learning) group too. Greedy by usage and
 * compared against each group's head only, so groups cannot chain together.
 */
export function findLocalGroups(
  tags: TagInfo[],
  opts: { fuzzy?: boolean } = {},
): TagGroup[] {
  const byKey = new Map<string, TagInfo[]>();
  for (const t of tags) {
    const k = canonicalKey(t.name);
    if (k) push(byKey, k, t);
  }
  const buckets: Bucket[] = [...byKey].map(([key, members]) => ({
    key,
    members,
    total: members.reduce((s, m) => s + m.count, 0),
  }));
  buckets.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));

  const clusters: Cluster[] = [];
  const byPrefix = new Map<string, Cluster[]>();
  const bySuffix = new Map<string, Cluster[]>();
  const bySorted = new Map<string, Cluster>();
  const byAcronym = new Map<string, Cluster>();
  const byShort = new Map<string, Cluster>();
  const fuzzy = opts.fuzzy !== false;

  for (const b of buckets) {
    const rep = pickTarget(b.members).name;
    let hit: Cluster | undefined;
    let reason: GroupReason = "similar";

    if (fuzzy) {
      const sorted = sortedKey(rep);
      if (sorted) hit = bySorted.get(sorted);
      if (!hit && b.key.length >= 6) {
        const pool = [
          ...(byPrefix.get(b.key.slice(0, 3)) || []),
          ...(bySuffix.get(b.key.slice(-3)) || []),
        ];
        hit = pool.find((c) => isNearKey(c.head.key, b.key));
      }
      if (!hit) {
        const acr = acronym(rep);
        const isShort = b.key.length >= 2 && b.key.length <= 6;
        if (acr.length >= 2) hit = byShort.get(acr);
        if (!hit && isShort && /^\p{L}+$/u.test(b.key)) {
          hit = byAcronym.get(b.key);
        }
        if (hit) reason = "abbreviation";
      }
    }

    if (hit) {
      hit.buckets.push(b);
      if (hit.reason === "format") hit.reason = reason;
      continue;
    }

    const c: Cluster = { head: b, buckets: [b], reason: "format" };
    clusters.push(c);
    if (!fuzzy) continue;
    if (b.key.length >= 6) {
      push(byPrefix, b.key.slice(0, 3), c);
      push(bySuffix, b.key.slice(-3), c);
    }
    const sorted = sortedKey(rep);
    if (sorted && !bySorted.has(sorted)) bySorted.set(sorted, c);
    const acr = acronym(rep);
    if (acr.length >= 2 && !byAcronym.has(acr)) byAcronym.set(acr, c);
    if (/^\p{L}{2,6}$/u.test(b.key) && !byShort.has(b.key))
      byShort.set(b.key, c);
  }

  const out: TagGroup[] = [];
  for (const c of clusters) {
    const members = c.buckets
      .flatMap((b) => b.members)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    if (members.length < 2) continue;
    out.push({
      target: pickTarget(members).name,
      members,
      reason: c.buckets.length === 1 ? "format" : c.reason,
    });
  }
  return out.sort(
    (a, b) =>
      b.members.reduce((s, m) => s + m.count, 0) -
      a.members.reduce((s, m) => s + m.count, 0),
  );
}

/**
 * Tags that would change if the user's tag settings (case, separators,
 * special characters, replacement rules) were applied to them. Length and word
 * limits are skipped so existing long tags are not truncated.
 */
export function findFormatFixes(tags: TagInfo[], o: TagOptions): TagGroup[] {
  const base: TagOptions = { ...o, maxWords: 0, maxLength: 0, blacklist: [] };
  const existing = new Map(tags.map((t) => [t.name, t.count]));
  const byTarget = new Map<string, TagInfo[]>();
  for (const t of tags) {
    if (o.prefix && t.name.startsWith(o.prefix)) continue;
    const fixed = cleanTag(t.name, base);
    if (!fixed || fixed === t.name) continue;
    push(byTarget, fixed, t);
  }
  const out: TagGroup[] = [];
  for (const [target, sources] of byTarget) {
    const members = [...sources];
    const have = existing.get(target);
    if (have !== undefined) members.push({ name: target, count: have });
    members.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    out.push({ target, members, reason: "format" });
  }
  return out.sort(
    (a, b) =>
      b.members.reduce((s, m) => s + m.count, 0) -
      a.members.reduce((s, m) => s + m.count, 0),
  );
}
