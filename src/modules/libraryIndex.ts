// Reads the user's tagged items from the Zotero database and keeps a cached
// TF-IDF index per library for libraryNeighbors.

declare const Zotero: _ZoteroTypes.Zotero;

import {
  buildIndex,
  suggestFromNeighbors,
  type LibDoc,
  type LibraryIndex,
} from "./libraryNeighbors";
import type { SourceOptions } from "./autotagPrefs";

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<
  number,
  { at: number; marker: string; index: LibraryIndex }
>();

const debug = (msg: string) => (Zotero as any).debug?.(`[Autotag] ${msg}`);

async function loadDocs(libraryID: number, marker: string): Promise<LibDoc[]> {
  const DB = (Zotero as any).DB;
  const rows =
    (await DB.queryAsync(
      `SELECT i.key AS key,
        (SELECT v.value FROM itemData d JOIN itemDataValues v USING (valueID)
          WHERE d.itemID = i.itemID
            AND d.fieldID = (SELECT fieldID FROM fields WHERE fieldName = 'title')) AS title,
        (SELECT v.value FROM itemData d JOIN itemDataValues v USING (valueID)
          WHERE d.itemID = i.itemID
            AND d.fieldID = (SELECT fieldID FROM fields WHERE fieldName = 'abstractNote')) AS abstract
       FROM items i
       WHERE i.libraryID = ?
         AND i.itemTypeID NOT IN
           (SELECT itemTypeID FROM itemTypes
             WHERE typeName IN ('attachment', 'note', 'annotation'))
         AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
         AND i.itemID IN (SELECT itemID FROM itemTags)`,
      [libraryID],
    )) || [];
  const tagRows =
    (await DB.queryAsync(
      `SELECT i.key AS key, t.name AS tag
       FROM itemTags it JOIN tags t USING (tagID) JOIN items i USING (itemID)
       WHERE i.libraryID = ?`,
      [libraryID],
    )) || [];

  const tagsByKey = new Map<string, string[]>();
  const markerKey = marker.trim().toLowerCase();
  for (const r of tagRows) {
    const tag = String(r.tag);
    if (markerKey && tag.toLowerCase() === markerKey) continue;
    const list = tagsByKey.get(String(r.key)) || [];
    list.push(tag);
    tagsByKey.set(String(r.key), list);
  }
  return rows.map((r: any) => ({
    key: String(r.key),
    title: String(r.title || ""),
    abstract: String(r.abstract || ""),
    tags: tagsByKey.get(String(r.key)) || [],
  }));
}

export async function getLibraryIndex(
  libraryID: number,
  marker: string,
): Promise<LibraryIndex> {
  const hit = cache.get(libraryID);
  if (hit && hit.marker === marker && Date.now() - hit.at < TTL_MS)
    return hit.index;
  const index = buildIndex(await loadDocs(libraryID, marker));
  cache.set(libraryID, { at: Date.now(), marker, index });
  debug(`library index: ${index.size} tagged item(s) in library ${libraryID}`);
  return index;
}

export function dropLibraryIndex(): void {
  cache.clear();
}

export type LibraryResult = {
  suggestions: Map<string, string[]>;
  /** Tagged items available as a reference; 0 when the library is too small. */
  indexed: number;
  tooSmall: boolean;
};

export async function suggestFromLibrary(
  items: { key: string; title: string; abstract: string }[],
  libraryID: number,
  o: SourceOptions,
  marker: string,
): Promise<LibraryResult> {
  const index = await getLibraryIndex(libraryID, marker);
  const out = new Map<string, string[]>();
  if (index.size < o.libraryMinItems)
    return { suggestions: out, indexed: index.size, tooSmall: true };
  for (const it of items) {
    const found = suggestFromNeighbors(index, it, {
      k: o.libraryK,
      maxTags: o.libraryMax,
    });
    if (found.length)
      out.set(
        it.key,
        found.map((f) => f.tag),
      );
  }
  return { suggestions: out, indexed: index.size, tooSmall: false };
}
