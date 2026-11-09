// Learning from review edits: suppress tags the user keeps removing and learn
// aliases from corrections ("ML" -> "machine learning"). Pure: the caller
// stores the JSON in a pref.

import { canonicalKey } from "./tagCleaner";

export type Learned = {
  v: 1;
  /** canonical key -> display form and number of times it was removed */
  rejected: Record<string, { tag: string; n: number }>;
  /** canonical key -> number of times it was kept */
  accepted: Record<string, number>;
  /** canonical key of the wrong tag -> replacement and times seen */
  aliases: Record<string, { to: string; n: number }>;
};

export type ItemFeedback = {
  /** Tags Autotag proposed for the item (after cleanup). */
  suggested: string[];
  /** Tags the user left in the review window. */
  final: string[];
};

/** Net removals needed before a tag is hidden. */
export const SUPPRESS_AFTER = 2;
/** Times a correction must repeat before it is applied automatically. */
export const ALIAS_AFTER = 2;
const MAX_ENTRIES = 3000;

export const emptyLearned = (): Learned => ({
  v: 1,
  rejected: {},
  accepted: {},
  aliases: {},
});

export function parseLearned(json: string): Learned {
  try {
    const o = JSON.parse(json);
    if (o && o.v === 1) {
      return {
        v: 1,
        rejected:
          o.rejected && typeof o.rejected === "object" ? o.rejected : {},
        accepted:
          o.accepted && typeof o.accepted === "object" ? o.accepted : {},
        aliases: o.aliases && typeof o.aliases === "object" ? o.aliases : {},
      };
    }
  } catch {
    // fall through
  }
  return emptyLearned();
}

function initials(phrase: string): string {
  return phrase
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("");
}

function related(a: string, b: string): boolean {
  const ka = canonicalKey(a);
  const kb = canonicalKey(b);
  if (!ka || !kb || ka === kb) return false;
  const [short, long] = ka.length <= kb.length ? [a, b] : [b, a];
  const ks = canonicalKey(short);
  const kl = canonicalKey(long);
  if (ks.length >= 2 && initials(long) === ks) return true; // ML <-> machine learning
  if (ks.length >= 4 && kl.includes(ks)) return true; // forest <-> forests cover
  const ta = new Set(a.toLowerCase().split(/[\s_-]+/));
  const tb = new Set(b.toLowerCase().split(/[\s_-]+/));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  return inter / (ta.size + tb.size - inter) >= 0.5;
}

/** Which removed tag was replaced by which added tag. */
export function pairCorrections(
  removed: string[],
  added: string[],
): [string, string][] {
  if (removed.length === 1 && added.length === 1)
    return [[removed[0], added[0]]];
  const pairs: [string, string][] = [];
  const used = new Set<number>();
  for (const r of removed) {
    const i = added.findIndex((a, idx) => !used.has(idx) && related(r, a));
    if (i >= 0) {
      used.add(i);
      pairs.push([r, added[i]]);
    }
  }
  return pairs;
}

function cap<T>(rec: Record<string, T>, score: (v: T) => number): void {
  const keys = Object.keys(rec);
  if (keys.length <= MAX_ENTRIES) return;
  keys
    .sort((a, b) => score(rec[a]) - score(rec[b]))
    .slice(0, keys.length - MAX_ENTRIES)
    .forEach((k) => delete rec[k]);
}

/** Returns a new Learned with the feedback folded in. */
export function recordFeedback(
  prev: Learned,
  feedback: ItemFeedback[],
): Learned {
  const l: Learned = JSON.parse(JSON.stringify(prev));
  for (const fb of feedback) {
    const final = new Set(fb.final.map(canonicalKey));
    const suggested = new Set(fb.suggested.map(canonicalKey));
    const removed = fb.suggested.filter((t) => !final.has(canonicalKey(t)));
    const added = fb.final.filter((t) => !suggested.has(canonicalKey(t)));
    for (const t of fb.suggested) {
      const k = canonicalKey(t);
      if (!k) continue;
      if (final.has(k)) l.accepted[k] = (l.accepted[k] || 0) + 1;
    }
    for (const t of removed) {
      const k = canonicalKey(t);
      if (!k) continue;
      const cur = l.rejected[k] || { tag: t, n: 0 };
      cur.n++;
      l.rejected[k] = cur;
    }
    for (const [from, to] of pairCorrections(removed, added)) {
      const k = canonicalKey(from);
      if (!k) continue;
      const cur = l.aliases[k];
      if (cur && canonicalKey(cur.to) === canonicalKey(to)) cur.n++;
      else l.aliases[k] = { to, n: 1 };
    }
  }
  cap(l.rejected, (v) => v.n);
  cap(l.accepted, (v) => v);
  cap(l.aliases, (v) => v.n);
  return l;
}

export function isSuppressed(l: Learned, tag: string): boolean {
  const k = canonicalKey(tag);
  const r = l.rejected[k];
  return !!r && r.n - (l.accepted[k] || 0) >= SUPPRESS_AFTER;
}

export function resolveAlias(l: Learned, tag: string): string {
  const a = l.aliases[canonicalKey(tag)];
  return a && a.n >= ALIAS_AFTER ? a.to : tag;
}

/** Aliases first, then drop suppressed tags and duplicates. */
export function applyLearning(tags: string[], l: Learned): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = resolveAlias(l, raw);
    const k = canonicalKey(t);
    if (!k || seen.has(k) || isSuppressed(l, t)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function summarize(l: Learned): {
  suppressed: string[];
  aliases: [string, string, number][];
} {
  const suppressed = Object.keys(l.rejected)
    .filter((k) => isSuppressed(l, l.rejected[k].tag))
    .map((k) => l.rejected[k].tag)
    .sort((a, b) => a.localeCompare(b));
  const aliases = Object.entries(l.aliases)
    .filter(([, a]) => a.n >= ALIAS_AFTER)
    .map(([k, a]) => [k, a.to, a.n] as [string, string, number])
    .sort((x, y) => x[0].localeCompare(y[0]));
  return { suppressed, aliases };
}
