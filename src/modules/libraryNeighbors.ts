// Suggest tags from the user's own library: TF-IDF nearest neighbours over
// title + abstract, then vote with the tags the neighbours carry.
// Pure: no Zotero access.

import { STOP } from "./keywordExtractor";

export type LibDoc = {
  key: string;
  title: string;
  abstract: string;
  tags: string[];
};

export type NeighborOptions = {
  /** Neighbours that vote. */
  k: number;
  /** Max tags returned. */
  maxTags: number;
  /** A tag needs at least this many voting neighbours. */
  minSupport: number;
  /** Neighbours below this cosine similarity are ignored. */
  minSim: number;
  /** Minimum share of the neighbours' similarity mass a tag must carry (0 to 1). */
  minScore: number;
};

export const DEFAULT_NEIGHBOR_OPTIONS: NeighborOptions = {
  k: 8,
  maxTags: 6,
  minSupport: 2,
  minSim: 0.08,
  minScore: 0.25,
};

export type NeighborSuggestion = {
  tag: string;
  score: number;
  support: number;
};

export type LibraryIndex = {
  size: number;
  idf: Map<string, number>;
  docs: { key: string; tags: string[]; norm: Map<string, number> }[];
  postings: Map<string, [number, number][]>;
};

function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss"))
    return w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  const words = String(text || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const out: string[] = [];
  let prev = "";
  for (const raw of words) {
    if (STOP.has(raw) || raw.length < 3 || /^\d+$/.test(raw)) {
      prev = "";
      continue;
    }
    const w = stem(raw);
    out.push(w);
    if (prev) out.push(`${prev} ${w}`);
    prev = w;
  }
  return out;
}

function termCounts(title: string, abstract: string): Map<string, number> {
  const counts = new Map<string, number>();
  // Title terms count twice: titles are denser than abstracts.
  for (const t of tokenize(title)) counts.set(t, (counts.get(t) || 0) + 2);
  for (const t of tokenize(abstract)) counts.set(t, (counts.get(t) || 0) + 1);
  return counts;
}

function weigh(
  counts: Map<string, number>,
  idf: Map<string, number>,
): Map<string, number> {
  const vec = new Map<string, number>();
  let sum = 0;
  for (const [t, c] of counts) {
    const i = idf.get(t);
    if (i === undefined) continue;
    const w = (1 + Math.log(c)) * i;
    vec.set(t, w);
    sum += w * w;
  }
  const n = Math.sqrt(sum) || 1;
  for (const [t, w] of vec) vec.set(t, w / n);
  return vec;
}

export function buildIndex(docs: LibDoc[]): LibraryIndex {
  const usable = docs.filter(
    (d) => d.tags.length && (d.title.trim() || d.abstract.trim()),
  );
  const counts = usable.map((d) => termCounts(d.title, d.abstract));
  const df = new Map<string, number>();
  for (const c of counts)
    for (const t of c.keys()) df.set(t, (df.get(t) || 0) + 1);
  const N = usable.length;
  const idf = new Map<string, number>();
  for (const [t, n] of df) {
    // Terms seen once cannot help find neighbours.
    if (n >= 2) idf.set(t, Math.log((N + 1) / (n + 1)) + 1);
  }
  const index: LibraryIndex = { size: N, idf, docs: [], postings: new Map() };
  usable.forEach((d, i) => {
    const norm = weigh(counts[i], idf);
    index.docs.push({ key: d.key, tags: d.tags, norm });
    for (const [t, w] of norm) {
      const list = index.postings.get(t) || [];
      list.push([index.docs.length - 1, w]);
      index.postings.set(t, list);
    }
  });
  return index;
}

export function suggestFromNeighbors(
  index: LibraryIndex,
  query: { key: string; title: string; abstract: string },
  opts: Partial<NeighborOptions> = {},
): NeighborSuggestion[] {
  const o = { ...DEFAULT_NEIGHBOR_OPTIONS, ...opts };
  const q = weigh(termCounts(query.title, query.abstract), index.idf);
  if (!q.size) return [];

  const sims = new Map<number, number>();
  for (const [t, qw] of q) {
    for (const [di, dw] of index.postings.get(t) || []) {
      if (index.docs[di].key === query.key) continue;
      sims.set(di, (sims.get(di) || 0) + qw * dw);
    }
  }
  const top = [...sims]
    .filter(([, s]) => s >= o.minSim)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, o.k);
  if (top.length < Math.min(o.minSupport, 2)) return [];

  const mass = top.reduce((a, [, s]) => a + s, 0);
  const votes = new Map<
    string,
    { label: string; score: number; support: number }
  >();
  for (const [di, s] of top) {
    const seen = new Set<string>();
    for (const tag of index.docs[di].tags) {
      const k = tag.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const v = votes.get(k) || { label: tag, score: 0, support: 0 };
      v.score += s;
      v.support++;
      votes.set(k, v);
    }
  }
  return [...votes.values()]
    .filter((v) => v.support >= o.minSupport && v.score / mass >= o.minScore)
    .map((v) => ({ tag: v.label, score: v.score / mass, support: v.support }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.support - a.support ||
        a.tag.localeCompare(b.tag),
    )
    .slice(0, o.maxTags);
}
