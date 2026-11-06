declare const Zotero: _ZoteroTypes.Zotero;

import { getGenerationOptions } from "../autotagPrefs";

export const SYSTEM_JSON =
  "You are a careful assistant that ALWAYS returns ONLY valid JSON and no other text.";

export async function httpJson(
  method: "GET" | "POST",
  url: string,
  headers: Record<string, string>,
  body?: unknown,
  timeoutMs?: number,
): Promise<any> {
  let response: any;
  try {
    response = await Zotero.HTTP.request(method, url, {
      headers: { Accept: "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      timeout: timeoutMs ?? getGenerationOptions().timeoutMs,
    });
  } catch (e: any) {
    const status = e?.status ?? e?.xmlhttp?.status;
    const text = String(e?.xmlhttp?.responseText || "").slice(0, 500);
    let detail = "";
    try {
      const j = JSON.parse(text);
      detail = j?.error?.message || j?.error || j?.message || "";
      if (typeof detail !== "string") detail = JSON.stringify(detail);
    } catch {
      detail = text;
    }
    throw new Error(
      `HTTP ${status ?? "error"}${detail ? `: ${detail}` : ` ${e?.message || ""}`}`.trim(),
    );
  }
  const raw = response?.responseText;
  if (!raw) throw new Error("Empty response from server");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Server returned non-JSON response");
  }
}

/** Models that reject a custom temperature (reasoning families). */
export function rejectsTemperature(model: string): boolean {
  return /^(o\d|gpt-5)/i.test(model.split("/").pop() || model);
}
