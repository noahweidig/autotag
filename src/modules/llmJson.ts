// Pure helpers for turning raw model output into per-item tag lists.

export type LLMItemTags = { key: string; tags: string[] };

export function sanitizeJson(content: string): string {
  let text = String(content || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) text = fenced[1].trim();
  text = text.replace(/^json\s*\n/i, "").trim();
  if (!text.startsWith("{") && !text.startsWith("[")) {
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a >= 0 && b > a) text = text.slice(a, b + 1);
  }
  return text;
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
    throw new Error(
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
    const raw = x?.tags;
    const tags = Array.isArray(raw)
      ? raw.map((t: any) => String(t))
      : typeof raw === "string"
        ? raw.split(",")
        : [];
    if (key) out.push({ key, tags });
  });
  return out;
}
