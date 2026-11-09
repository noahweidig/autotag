// Pure parsers for metadata API responses. No Zotero access.

/* ---------- pure helpers ---------- */

export function normalizeDOI(raw: string): string {
  const s = String(raw || "")
    .trim()
    .replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim()
    .toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(s) ? s : "";
}

export const encodeDOI = (doi: string) =>
  encodeURIComponent(doi).replace(/%2F/gi, "/");

export function parseOpenAlexWork(
  work: any,
  minScore: number,
  includeSubfield: boolean,
): string[] {
  const out: string[] = [];
  const kws: any[] = Array.isArray(work?.keywords) ? work.keywords : [];
  kws
    .filter((k) => typeof k?.display_name === "string")
    .filter((k) => (typeof k.score === "number" ? k.score >= minScore : true))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .forEach((k) => out.push(k.display_name));
  if (includeSubfield) {
    const topics: any[] = Array.isArray(work?.topics) ? work.topics : [];
    const top = [...topics].sort(
      (a, b) => (b?.score ?? 0) - (a?.score ?? 0),
    )[0];
    const sub = top?.subfield?.display_name;
    if (typeof sub === "string" && sub) out.push(sub);
  }
  return out;
}

export function parseCrossrefWork(json: any): string[] {
  const subj = json?.message?.subject;
  return Array.isArray(subj) ? subj.filter((s) => typeof s === "string") : [];
}

function decodeXml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** pmid -> tags. Major MeSH headings first, then author keywords, then other MeSH. */
export function parsePubmedXml(xml: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const articles = String(xml)
    .split(/<PubmedArticle[ >]/)
    .slice(1);
  for (const a of articles) {
    const pmid = /<PMID[^>]*>(\d+)<\/PMID>/.exec(a)?.[1];
    if (!pmid) continue;
    const major: string[] = [];
    const minor: string[] = [];
    for (const m of a.matchAll(
      /<DescriptorName[^>]*MajorTopicYN="([YN])"[^>]*>([\s\S]*?)<\/DescriptorName>/g,
    )) {
      (m[1] === "Y" ? major : minor).push(decodeXml(m[2]));
    }
    const author: string[] = [];
    for (const m of a.matchAll(/<Keyword[^>]*>([\s\S]*?)<\/Keyword>/g)) {
      author.push(decodeXml(m[1]));
    }
    out.set(pmid, [...major, ...author, ...minor].filter(Boolean).slice(0, 12));
  }
  return out;
}
