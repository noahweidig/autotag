// Offline keyword extraction (RAKE-style phrase scoring with title boost).
// Pure: no Zotero access. English text only.

export const STOP = new Set(
  `a about above across after afterwards again against all almost alone along already also although always am among amongst an and another any anyhow anyone anything anyway anywhere are around as at be became because become becomes becoming been before beforehand behind being below beside besides between beyond both but by can cannot could did do does doing done down due during each either else elsewhere enough etc even ever every everyone everything everywhere except few first for former formerly from further had has have having he hence her here hereafter hereby herein hereupon hers herself him himself his how however i if in indeed into is it its itself just last latter latterly least less many may me meanwhile might mine more moreover most mostly much must my myself namely neither never nevertheless next no nobody none noone nor not nothing now nowhere of off often on once one only onto or other others otherwise our ours ourselves out over own per perhaps rather same second several she should since so some somehow someone something sometimes somewhere still such than that the their theirs them themselves then thence there thereafter thereby therefore therein thereupon these they third this those though through throughout thus to together too toward towards under unless until up upon us used using very via was we well were what whatever when whence whenever where whereafter whereas whereby wherein whereupon wherever whether which while whither who whoever whole whom whose why will with within without would yet you your yours yourself yourselves
 abstract article paper papers study studies studied results result show shows showed shown found find finds propose proposed proposes present presents presented describe describes described demonstrate demonstrates demonstrated investigate investigates investigated examine examines examined report reports reported discuss discusses discussed provide provides provided obtain obtained based use uses novel new various several different including include includes included given among suggest suggests suggested compared compare approach approaches however thus overall significantly significant respectively furthermore et al`
    .split(/\s+/)
    .filter(Boolean),
);

/** Too vague to be a tag on their own (still fine inside a longer phrase). */
const GENERIC_SINGLE = new Set(
  `analysis analyses data effect effects model models method methods system systems process processes problem problems performance application applications development research work role case cases level levels time rate rates type types set sets number change changes factor factors measure measures evidence information control structure function`
    .split(/\s+/)
    .filter(Boolean),
);

export type ExtractOptions = {
  /** Max tags returned. */
  max: number;
  /** Max words per phrase (1-4). */
  maxWords: number;
};

type Candidate = { words: string[]; count: number; inTitle: boolean };

function splitPhrases(text: string): string[][] {
  const phrases: string[][] = [];
  // Hard breaks at punctuation; keep inner hyphens and apostrophes.
  for (const chunk of text
    .toLowerCase()
    .split(/[.,;:!?()[\]{}"“”‘’<>/\\|=+*&%$#@^~`\n\r\t]+| - | – | — /)) {
    let cur: string[] = [];
    for (const raw of chunk.split(/\s+/)) {
      const w = raw.replace(/^[-']+|[-']+$/g, "");
      if (!w) continue;
      const bad =
        STOP.has(w) ||
        /^\d+([-.]\d+)*$/.test(w) ||
        w.length < 2 ||
        /^\d/.test(w);
      if (bad) {
        if (cur.length) phrases.push(cur);
        cur = [];
      } else cur.push(w);
    }
    if (cur.length) phrases.push(cur);
  }
  return phrases;
}

export function extractKeywords(
  title: string,
  abstract: string,
  opts: Partial<ExtractOptions> = {},
): string[] {
  const max = opts.max ?? 5;
  const maxWords = Math.min(Math.max(opts.maxWords ?? 3, 1), 4);
  const titleText = String(title || "");
  const body = String(abstract || "");
  if (!titleText.trim() && !body.trim()) return [];

  const titlePhrases = splitPhrases(titleText);
  const titleWords = new Set(titlePhrases.flat());
  const all = [...titlePhrases, ...splitPhrases(body)];

  // Word-level RAKE stats over unsplit candidate phrases.
  const freq = new Map<string, number>();
  const deg = new Map<string, number>();
  for (const p of all) {
    for (const w of p) {
      freq.set(w, (freq.get(w) || 0) + 1);
      deg.set(w, (deg.get(w) || 0) + p.length);
    }
  }

  // Sub-phrases of long runs (e.g. "deep neural network training") up to maxWords.
  const cands = new Map<string, Candidate>();
  const titleKeys = new Set(titlePhrases.map((p) => p.join(" ")));
  const addCand = (words: string[]) => {
    const key = words.join(" ");
    const c = cands.get(key) || { words, count: 0, inTitle: false };
    c.count++;
    if ([...titleKeys].some((t) => t.includes(key))) c.inTitle = true;
    cands.set(key, c);
  };
  for (const p of all) {
    if (p.length <= maxWords) addCand(p);
    else
      for (let n = 1; n <= maxWords; n++)
        for (let i = 0; i + n <= p.length; i++) addCand(p.slice(i, i + n));
  }

  const wordScore = (w: string) => (deg.get(w) || 1) / (freq.get(w) || 1);
  const scored: { key: string; score: number; words: string[] }[] = [];
  for (const [key, c] of cands) {
    const single = c.words.length === 1;
    const w0 = c.words[0];
    if (single) {
      if (w0.length < 4 || GENERIC_SINGLE.has(w0)) continue;
      if (c.count < 2 && !titleWords.has(w0)) continue;
    } else {
      // Phrases must repeat or appear in the title; verb-like edges are noise.
      if (c.count < 2 && !c.inTitle) continue;
      const last = c.words[c.words.length - 1];
      if (/ed$/.test(last)) continue;
    }
    let s = c.words.reduce((a, w) => a + wordScore(w), 0);
    s *= 1 + 0.6 * Math.log(c.count);
    if (c.inTitle) s *= 1.5;
    // Mild preference for 2-word phrases over long ones and single words.
    s *= c.words.length === 2 ? 1.15 : c.words.length === 3 ? 1.0 : 0.9;
    scored.push({ key, score: s, words: c.words });
  }
  scored.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  const picked: { key: string; words: string[] }[] = [];
  for (const c of scored) {
    if (picked.length >= max) break;
    const overlaps = picked.some((p) => {
      const a = ` ${p.key} `;
      const b = ` ${c.key} `;
      return a.includes(b) || b.includes(a);
    });
    if (!overlaps) picked.push(c);
  }
  return picked.map((p) => p.key);
}
