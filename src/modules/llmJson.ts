// Pure helpers for turning raw model output into per-item tag lists.

export type LLMItemTags = { key: string; tags: string[] };

function stripFence(text: string): string {
  const open = text.indexOf("```");
  if (open < 0) return text;
  let start = open + 3;
  if (text.slice(start, start + 4).toLowerCase() === "json") start += 4;
  const close = text.indexOf("```", start);
  if (close < 0) return text;
  return text.slice(start, close).trim();
}

export function sanitizeJson(content: string): string {
  let text = stripFence(String(content || "").trim());
  text = text.replace(/^json\s*\n/i, "").trim();
  if (!text.startsWith("{") && !text.startsWith("[")) {
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a >= 0 && b > a) text = text.slice(a, b + 1);
  }
  return text;
}

function toTagList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return raw.split(",");
  return [];
}

/** Parses model output. Throws a user-readable Error on malformed output. */
export function parseTagResponse(
  content: string,
  batchKeys: string[],
): LLMItemTags[] {
  let parsed: any;
  try {
    parsed = JSON.parse(sanitizeJson(content));
  } catch {
    throw new Error(
      `Model returned invalid JSON. Start of response:\n${String(content).slice(0, 500)}`,
    );
  }
  if (Array.isArray(parsed)) parsed = { items: parsed };
  if (!Array.isArray(parsed?.items)) {
    throw new TypeError(
      `Model JSON had no "items" array:\n${JSON.stringify(parsed).slice(0, 500)}`,
    );
  }

  const valid = new Set(batchKeys);
  const out: LLMItemTags[] = [];
  parsed.items.forEach((x: any, i: number) => {
    let key = String(x?.key || "").trim();
    if (!valid.has(key)) {
      key = batchKeys.length === parsed.items.length ? batchKeys[i] : "";
    }
    const tags = toTagList(x?.tags);
    if (key) out.push({ key, tags });
  });
  return out;
}
