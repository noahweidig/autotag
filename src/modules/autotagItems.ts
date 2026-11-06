// src/modules/autotagItems.ts
// Resolving selected Zotero items and extracting prompt metadata.

declare const Zotero: _ZoteroTypes.Zotero;

import { getPromptContentOptions } from "./autotagPrefs";

export type ItemMetadata = {
  key: string;
  itemType: string;
  title: string;
  abstract: string;
  publicationTitle: string;
  date: string;
  doi: string;
  creators: string[];
  tags: string[];
  pdfText?: string;
};

const debug = (msg: string) => (Zotero as any).debug?.(msg);

/** Turn a raw selection into unique regular items (attachments/notes map to their parent). */
export function resolveRegularItems(selected: any[]): any[] {
  const seen = new Set<number>();
  const out: any[] = [];
  for (const it of selected || []) {
    let item = it;
    if ((item?.isAttachment?.() || item?.isNote?.()) && item.parentItemID) {
      item = Zotero.Items.get(item.parentItemID);
    }
    if (!item?.isRegularItem?.() || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function normalizeExtractedText(text: string): string {
  return String(text || "")
    .split("\x00")
    .join(" ")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function truncatePdfText(text: string): string {
  const o = getPromptContentOptions();
  const cleaned = normalizeExtractedText(text);
  if (!cleaned || o.pdfTextMode === "full_text") return cleaned;
  return cleaned.length <= o.pdfTextCharLimit
    ? cleaned
    : cleaned.slice(0, o.pdfTextCharLimit).trim();
}

async function getAttachmentText(item: any): Promise<string> {
  try {
    const atts = (item.getAttachments?.() || [])
      .map((id: number) => Zotero.Items.get(id))
      .filter(Boolean);
    const ct = (a: any) => String(a?.attachmentContentType || "").toLowerCase();
    const chosen =
      atts.find(
        (a: any) => ct(a) === "application/pdf" && a.isImportedAttachment?.(),
      ) ||
      atts.find((a: any) => ct(a) === "application/pdf") ||
      atts.find((a: any) => ct(a) === "text/html");
    if (!chosen) return "";
    return truncatePdfText(String((await chosen.attachmentText) || ""));
  } catch (e) {
    debug(`Autotag: attachment text failed for ${item?.key}: ${String(e)}`);
    return "";
  }
}

export async function getItemMetadata(item: any): Promise<ItemMetadata> {
  const creators = (item.getCreators?.() || []).map((c: any) =>
    c.lastName && c.firstName
      ? `${c.lastName}, ${c.firstName}`
      : c.name || c.lastName || "[unknown creator]",
  );
  const options = getPromptContentOptions();
  return {
    key: item.key,
    itemType: item.itemType,
    title: item.getField?.("title") || "",
    abstract: item.getField?.("abstractNote") || "",
    publicationTitle: item.getField?.("publicationTitle") || "",
    date: item.getField?.("date") || "",
    doi: item.getField?.("DOI") || "",
    creators,
    tags: (item.getTags?.() || []).map((t: any) => t.tag),
    pdfText: options.includePdfText ? await getAttachmentText(item) : "",
  };
}
