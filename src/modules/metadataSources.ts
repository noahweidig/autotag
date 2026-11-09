// Non-AI tag suggestions: OpenAlex, Crossref, PubMed (via DOI) and offline
// keyword extraction. Parsers are pure so they can be unit tested.

import { httpText } from "./llmproviders/http";
import { extractKeywords } from "./keywordExtractor";
import {
  encodeDOI,
  normalizeDOI,
  parseCrossrefWork,
  parseOpenAlexWork,
  parsePubmedXml,
} from "./sourceParsers";
import type { SourceOptions } from "./autotagPrefs";

export type SourceId = "library" | "openalex" | "crossref" | "pubmed" | "local";

export const SOURCE_LABELS: Record<SourceId, string> = {
  library: "Library",
  openalex: "OpenAlex",
  crossref: "Crossref",
  pubmed: "PubMed",
  local: "Keywords",
};

export type SourceItem = {
  key: string;
  title: string;
  abstract: string;
  doi: string;
};

export type Suggestion = { tag: string; source: SourceId };

export type SourceResult = {
  suggestions: Map<string, Suggestion[]>;
  errors: string[];
};

const TIMEOUT = 20000;

/* ---------- network ---------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pool<T>(
  n: number,
  list: T[],
  fn: (x: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, list.length) }, async () => {
      while (i < list.length) await fn(list[i++]);
    }),
  );
}

const isNotFound = (e: any) => /HTTP 404/.test(String(e?.message || e));
const isLimit = (e: any) =>
  /HTTP (429|403)|rate limit/i.test(String(e?.message));

function add(
  res: SourceResult,
  key: string,
  tags: string[],
  source: SourceId,
): void {
  if (!tags.length) return;
  const list = res.suggestions.get(key) || [];
  for (const tag of tags) list.push({ tag, source });
  res.suggestions.set(key, list);
}

async function fetchOpenAlex(
  items: SourceItem[],
  o: SourceOptions,
  res: SourceResult,
  tick: () => void,
): Promise<void> {
  let stop = "";
  await pool(3, items, async (it) => {
    tick();
    if (stop) return;
    const q = new URLSearchParams({ select: "title,keywords,topics" });
    if (o.openalexKey) q.set("api_key", o.openalexKey);
    if (o.contact) q.set("mailto", o.contact);
    try {
      const raw = await httpText(
        "GET",
        `https://api.openalex.org/works/doi:${encodeDOI(it.doi)}?${q}`,
        {},
        undefined,
        TIMEOUT,
      );
      add(
        res,
        it.key,
        parseOpenAlexWork(
          JSON.parse(raw),
          o.openalexMinScore,
          o.openalexSubfield,
        ),
        "openalex",
      );
    } catch (e: any) {
      if (isNotFound(e)) return;
      if (isLimit(e)) {
        stop =
          "OpenAlex rate limit reached. Add a free API key in Autotag settings.";
        res.errors.push(stop);
      } else if (!stop) {
        stop = `OpenAlex: ${e?.message || e}`;
        res.errors.push(stop);
      }
    }
  });
}

async function fetchCrossref(
  items: SourceItem[],
  o: SourceOptions,
  res: SourceResult,
  tick: () => void,
): Promise<void> {
  let stop = "";
  await pool(3, items, async (it) => {
    tick();
    if (stop) return;
    const q = o.contact ? `?mailto=${encodeURIComponent(o.contact)}` : "";
    try {
      const raw = await httpText(
        "GET",
        `https://api.crossref.org/works/${encodeDOI(it.doi)}${q}`,
        {},
        undefined,
        TIMEOUT,
      );
      add(res, it.key, parseCrossrefWork(JSON.parse(raw)), "crossref");
    } catch (e: any) {
      if (isNotFound(e)) return;
      stop = `Crossref: ${e?.message || e}`;
      res.errors.push(stop);
    }
  });
}

async function fetchPubmed(
  items: SourceItem[],
  o: SourceOptions,
  res: SourceResult,
  tick: () => void,
): Promise<void> {
  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
  const common = `tool=autotag${o.contact ? `&email=${encodeURIComponent(o.contact)}` : ""}`;
  const pmidToKey = new Map<string, string>();
  try {
    for (const it of items) {
      tick();
      try {
        const raw = await httpText(
          "GET",
          `${base}esearch.fcgi?db=pubmed&retmode=json&${common}&term=${encodeURIComponent(`${it.doi}[AID]`)}`,
          {},
          undefined,
          TIMEOUT,
        );
        const id = JSON.parse(raw)?.esearchresult?.idlist?.[0];
        if (id) pmidToKey.set(String(id), it.key);
      } catch (e: any) {
        if (isLimit(e)) throw e;
      }
      await sleep(350); // NCBI allows 3 requests/s without an API key
    }
    const pmids = [...pmidToKey.keys()];
    for (let i = 0; i < pmids.length; i += 100) {
      const xml = await httpText(
        "GET",
        `${base}efetch.fcgi?db=pubmed&retmode=xml&${common}&id=${pmids.slice(i, i + 100).join(",")}`,
        {},
        undefined,
        TIMEOUT,
        "application/xml",
      );
      for (const [pmid, tags] of parsePubmedXml(xml)) {
        const key = pmidToKey.get(pmid);
        if (key) add(res, key, tags, "pubmed");
      }
    }
  } catch (e: any) {
    res.errors.push(`PubMed: ${e?.message || e}`);
  }
}

/* ---------- orchestration ---------- */

export function enabledSources(o: SourceOptions): SourceId[] {
  const out: SourceId[] = [];
  if (o.library) out.push("library");
  if (o.openalex) out.push("openalex");
  if (o.crossref) out.push("crossref");
  if (o.pubmed) out.push("pubmed");
  if (o.local) out.push("local");
  return out;
}

export async function suggestFromSources(
  items: SourceItem[],
  o: SourceOptions,
  onProgress?: (text: string, percent: number) => void,
  /** Item keys that already have suggestions (skips the local fallback for them). */
  prior: Set<string> = new Set(),
): Promise<SourceResult> {
  const res: SourceResult = { suggestions: new Map(), errors: [] };
  const withDoi = items
    .map((it) => ({ ...it, doi: normalizeDOI(it.doi) }))
    .filter((it) => it.doi);

  const remote: [SourceId, typeof fetchOpenAlex][] = [];
  if (o.openalex) remote.push(["openalex", fetchOpenAlex]);
  if (o.crossref) remote.push(["crossref", fetchCrossref]);
  if (o.pubmed) remote.push(["pubmed", fetchPubmed]);

  const total = Math.max(remote.length * withDoi.length, 1);
  let done = 0;
  for (const [id, fn] of remote) {
    if (!withDoi.length) break;
    onProgress?.(
      `Looking up ${withDoi.length} DOI(s) in ${SOURCE_LABELS[id]}`,
      Math.round((done / total) * 100),
    );
    await fn(withDoi, o, res, () => {
      done++;
      onProgress?.(
        `${SOURCE_LABELS[id]}: ${done}/${total}`,
        Math.round((done / total) * 100),
      );
    });
  }

  if (o.local) {
    for (const it of items) {
      if (
        o.localOnlyFallback &&
        (prior.has(it.key) || res.suggestions.get(it.key)?.length)
      )
        continue;
      add(
        res,
        it.key,
        extractKeywords(it.title, it.abstract, { max: o.localMax }),
        "local",
      );
    }
  }
  return res;
}
