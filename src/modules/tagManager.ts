// src/modules/tagManager.ts
// Zotero side of the tag manager window (addon/content/tagmanager.*): reads
// tags, runs the local and AI scans, applies merges/renames/deletes with undo.

declare const Zotero: _ZoteroTypes.Zotero;

import {
  getInt,
  getModelForProvider,
  getProviderConfigError,
  getStr,
  getTagOptions,
  openAutotagSettings,
  setPrefRaw,
} from "./autotagPrefs";
import {
  buildCleanupPrompt,
  clampBudget,
  mergeCapped,
  parseCleanupResponse,
  parseList,
  planScan,
  type ScanBudget,
} from "./cleanupAI";
import { getLLMProvider } from "./llmproviders";
import { canonicalKey } from "./tagCleaner";
import {
  findFormatFixes,
  findLocalGroups,
  groupSignature,
  type GroupReason,
  type TagGroup,
  type TagInfo,
} from "./tagDedupe";
import { isWindowAlive } from "../utils/window";

const debug = (msg: string) => (Zotero as any).debug?.(`[Autotag] ${msg}`);
const sleep = (ms: number) => (Zotero as any).Promise.delay(ms);

const REVIEWED_MAX = 6000;
const IGNORED_MAX = 2000;
const UNDO_MAX = 10;
const REQUEST_GAP_MS = 1200;
const RATE_LIMIT_WAIT_MS = 8000;

export type Suggestion = {
  id: string;
  target: string;
  members: TagInfo[];
  reason: GroupReason;
  sig: string;
  selected: boolean;
};

export type MergeRequest = { target: string; sources: string[] };

export type AIPlanInfo = {
  ready: boolean;
  error: string;
  provider: string;
  model: string;
  sent: number;
  requests: number;
  pending: number;
  tokens: number;
};

type UndoOp = {
  itemID: number;
  add: { tag: string; type: number }[];
  remove: string[];
};
type UndoEntry = { label: string; libraryID: number; ops: UndoOp[] };

/* ---------- persisted state ---------- */

const loadReviewed = () => new Set(parseList(getStr("cleanup.reviewed")));
const loadIgnored = () => new Set(parseList(getStr("cleanup.ignored")));

function saveList(pref: string, list: string[], add: string[], max: number) {
  setPrefRaw(pref, JSON.stringify(mergeCapped(list, add, max)));
}

export function getScanBudget(): ScanBudget {
  return clampBudget({
    maxTagsPerRequest: getInt("cleanup.maxTagsPerRequest", 150, 1),
    maxRequests: getInt("cleanup.maxRequests", 3, 1),
    anchorCount: getInt("cleanup.anchorCount", 20, 0),
  });
}

/* ---------- Zotero reads ---------- */

async function loadTags(libraryID: number): Promise<TagInfo[]> {
  const rows = await (Zotero as any).DB.queryAsync(
    `SELECT t.name AS name, COUNT(DISTINCT it.itemID) AS c
     FROM itemTags it JOIN tags t USING (tagID) JOIN items i USING (itemID)
     WHERE i.libraryID = ?
       AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
     GROUP BY t.tagID`,
    [libraryID],
  );
  return (rows || []).map((r: any) => ({
    name: String(r.name),
    count: Number(r.c) || 0,
  }));
}

async function tagItems(
  name: string,
): Promise<{ itemID: number; type: number }[]> {
  const tagID = (Zotero as any).Tags.getID(name);
  if (!tagID) return [];
  const rows = await (Zotero as any).DB.queryAsync(
    "SELECT itemID, type FROM itemTags WHERE tagID = ?",
    [tagID],
  );
  return (rows || []).map((r: any) => ({
    itemID: Number(r.itemID),
    type: Number(r.type) || 0,
  }));
}

/* ---------- suggestions ---------- */

let nextId = 1;

function toSuggestion(g: TagGroup): Suggestion {
  return {
    id: `s${nextId++}`,
    target: g.target,
    members: g.members,
    reason: g.reason,
    sig: groupSignature(g.members),
    selected: g.reason !== "abbreviation",
  };
}

function withoutIgnored(groups: TagGroup[]): Suggestion[] {
  const ignored = loadIgnored();
  return groups
    .map(toSuggestion)
    .filter((s) => !ignored.has(s.sig))
    .slice(0, 500);
}

/* ---------- undo journal ---------- */

const undoStack: UndoEntry[] = [];

function pushUndo(entry: UndoEntry) {
  if (!entry.ops.length) return;
  undoStack.push(entry);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
}

async function runUndo(entry: UndoEntry): Promise<number> {
  const ids = [...new Set(entry.ops.map((o) => o.itemID))];
  const items = new Map<number, any>();
  for (const it of (await (Zotero as any).Items.getAsync(ids)) || []) {
    if (it) items.set(it.id, it);
  }
  const changed = new Set<any>();
  for (const op of entry.ops) {
    const item = items.get(op.itemID);
    if (!item) continue;
    for (const a of op.add) item.addTag(a.tag, a.type);
    for (const r of op.remove) item.removeTag(r);
    changed.add(item);
  }
  await (Zotero as any).DB.executeTransaction(async () => {
    for (const item of changed) await item.save();
  });
  return changed.size;
}

/* ---------- apply ---------- */

async function mergeInto(
  libraryID: number,
  target: string,
  sources: string[],
  ops: UndoOp[],
): Promise<number> {
  const hadTarget = new Set((await tagItems(target)).map((r) => r.itemID));
  let moved = 0;
  for (const src of sources) {
    if (!src || src === target) continue;
    for (const row of await tagItems(src)) {
      ops.push({
        itemID: row.itemID,
        add: [{ tag: src, type: row.type }],
        remove: hadTarget.has(row.itemID) ? [] : [target],
      });
      moved++;
    }
    await (Zotero as any).Tags.rename(libraryID, src, target);
  }
  return moved;
}

/* ---------- API for the window ---------- */

function currentLibraryID(): number {
  const pane = (Zotero as any).getActiveZoteroPane?.();
  return (
    pane?.getSelectedLibraryID?.() ?? (Zotero as any).Libraries.userLibraryID
  );
}

function makeAPI(win: any) {
  const libraryID = currentLibraryID();
  let managerWin: any = null;

  const planAI = async (): Promise<AIPlanInfo> => {
    const provider = getLLMProvider();
    const tags = await loadTags(libraryID);
    const skip = loadReviewed();
    for (const g of findLocalGroups(tags)) {
      for (const m of g.members) {
        if (m.name !== g.target) skip.add(canonicalKey(m.name));
      }
    }
    const plan = planScan(
      tags,
      skip,
      getScanBudget(),
      getTagOptions().language,
    );
    const error = getProviderConfigError(provider.name) || "";
    return {
      ready: !error,
      error,
      provider: provider.name,
      model: getModelForProvider(provider.name),
      sent: plan.sent,
      requests: plan.chunks.length,
      pending: plan.pending,
      tokens: plan.estimatedTokens,
    };
  };

  return {
    libraryName: String(
      (Zotero as any).Libraries.getName?.(libraryID) || "My Library",
    ),
    setWindow(w: any) {
      managerWin = w;
    },
    getWindow: () => managerWin,

    loadTags: () => loadTags(libraryID),

    async scanDuplicates(): Promise<Suggestion[]> {
      return withoutIgnored(findLocalGroups(await loadTags(libraryID)));
    },

    async scanFormat(): Promise<Suggestion[]> {
      return withoutIgnored(
        findFormatFixes(await loadTags(libraryID), getTagOptions()),
      );
    },

    planAI,

    async scanAI(
      progress: (text: string, pct: number) => void,
      cancel: { value: boolean },
    ): Promise<{ suggestions: Suggestion[]; errors: string[] }> {
      const provider = getLLMProvider();
      const cfg = getProviderConfigError(provider.name);
      if (cfg) throw new Error(cfg);

      const tags = await loadTags(libraryID);
      const counts = new Map(tags.map((t) => [t.name, t.count]));
      const skip = loadReviewed();
      for (const g of findLocalGroups(tags)) {
        for (const m of g.members) {
          if (m.name !== g.target) skip.add(canonicalKey(m.name));
        }
      }
      const language = getTagOptions().language;
      const plan = planScan(tags, skip, getScanBudget(), language);
      const found: TagGroup[] = [];
      const errors: string[] = [];

      for (let i = 0; i < plan.chunks.length; i++) {
        if (cancel.value) break;
        const chunk = plan.chunks[i];
        progress(
          `Asking ${provider.name} (${getModelForProvider(provider.name)}): request ${i + 1} of ${plan.chunks.length}, ${chunk.candidates.length} tags`,
          Math.round((i / plan.chunks.length) * 100),
        );
        const prompt = buildCleanupPrompt(chunk, language);
        let content = "";
        try {
          try {
            content = await provider.generateJson(prompt);
          } catch (e: any) {
            if (!/429|rate.?limit|quota/i.test(String(e?.message || e)))
              throw e;
            progress("Rate limited. Waiting a few seconds...", 0);
            await sleep(RATE_LIMIT_WAIT_MS);
            content = await provider.generateJson(prompt);
          }
        } catch (e: any) {
          const msg = String(e?.message || e);
          debug(`cleanup request failed: ${msg}`);
          errors.push(
            /429|rate.?limit|quota/i.test(msg)
              ? `Rate limited by ${provider.name}. Partial results shown; scan again later or lower the budget.`
              : msg,
          );
          break;
        }
        try {
          for (const names of parseCleanupResponse(content, chunk)) {
            const members = names.map((n) => ({
              name: n,
              count: counts.get(n) ?? 0,
            }));
            const first = members[0];
            const best = members.reduce(
              (a, m) => (m.count > a.count ? m : a),
              first,
            );
            found.push({
              target: best.count > first.count ? best.name : first.name,
              members: [...members].sort(
                (a, b) => b.count - a.count || a.name.localeCompare(b.name),
              ),
              reason: "ai",
            });
          }
          saveList(
            "cleanup.reviewed",
            parseList(getStr("cleanup.reviewed")),
            chunk.candidates.map(canonicalKey),
            REVIEWED_MAX,
          );
        } catch (e: any) {
          errors.push(String(e?.message || e));
        }
        if (i < plan.chunks.length - 1) await sleep(REQUEST_GAP_MS);
      }
      progress("Done", 100);
      return { suggestions: withoutIgnored(found), errors };
    },

    async apply(requests: MergeRequest[]) {
      const ops: UndoOp[] = [];
      const errors: string[] = [];
      let tagsMerged = 0;
      let itemsMoved = 0;
      for (const r of requests) {
        try {
          itemsMoved += await mergeInto(libraryID, r.target, r.sources, ops);
          tagsMerged += r.sources.length;
        } catch (e: any) {
          errors.push(`${r.target}: ${e?.message || e}`);
          debug(`merge failed for ${r.target}: ${e?.stack || e}`);
        }
      }
      pushUndo({
        label: `Merged ${tagsMerged} tag${tagsMerged === 1 ? "" : "s"}`,
        libraryID,
        ops,
      });
      return { tagsMerged, itemsMoved, errors };
    },

    async rename(oldName: string, newName: string) {
      const to = String(newName || "").trim();
      if (!to || to === oldName) return { itemsMoved: 0, errors: [] };
      const ops: UndoOp[] = [];
      const errors: string[] = [];
      let itemsMoved = 0;
      try {
        itemsMoved = await mergeInto(libraryID, to, [oldName], ops);
      } catch (e: any) {
        errors.push(String(e?.message || e));
      }
      pushUndo({ label: `Renamed "${oldName}"`, libraryID, ops });
      return { itemsMoved, errors };
    },

    async deleteTags(names: string[]) {
      const ops: UndoOp[] = [];
      const errors: string[] = [];
      const ids: number[] = [];
      for (const name of names) {
        const tagID = (Zotero as any).Tags.getID(name);
        if (!tagID) continue;
        for (const row of await tagItems(name)) {
          ops.push({
            itemID: row.itemID,
            add: [{ tag: name, type: row.type }],
            remove: [],
          });
        }
        ids.push(tagID);
      }
      try {
        if (ids.length)
          await (Zotero as any).Tags.removeFromLibrary(libraryID, ids);
      } catch (e: any) {
        errors.push(String(e?.message || e));
        return { deleted: 0, errors };
      }
      pushUndo({
        label: `Deleted ${ids.length} tag${ids.length === 1 ? "" : "s"}`,
        libraryID,
        ops,
      });
      return { deleted: ids.length, errors };
    },

    undoLabel: (): string => undoStack[undoStack.length - 1]?.label || "",

    async undo(): Promise<{ label: string; items: number }> {
      const entry = undoStack.pop();
      if (!entry) return { label: "", items: 0 };
      return { label: entry.label, items: await runUndo(entry) };
    },

    ignore(sigs: string[]) {
      saveList(
        "cleanup.ignored",
        parseList(getStr("cleanup.ignored")),
        sigs,
        IGNORED_MAX,
      );
    },

    forgetReviewed() {
      setPrefRaw("cleanup.reviewed", "[]");
    },

    getBudget: getScanBudget,
    setBudget(b: Partial<ScanBudget>) {
      const c = clampBudget({ ...getScanBudget(), ...b });
      setPrefRaw("cleanup.maxTagsPerRequest", c.maxTagsPerRequest);
      setPrefRaw("cleanup.maxRequests", c.maxRequests);
      return c;
    },

    openSettings: () => openAutotagSettings(win),
  };
}

let current: any = null;

export function openTagManager(win: any): void {
  const existing = current?.getWindow?.();
  if (existing && isWindowAlive(existing)) {
    existing.focus();
    return;
  }
  const api = makeAPI(win);
  current = api;
  try {
    const w = win.openDialog(
      "chrome://autotag/content/tagmanager.xhtml",
      "autotag-tagmanager",
      "chrome,centerscreen,resizable,width=1000,height=720",
      api,
    );
    api.setWindow(w);
  } catch (e) {
    current = null;
    throw e;
  }
}
