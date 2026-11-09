// src/modules/autotagReview.ts
// Opens the review window (addon/content/review.xhtml) and returns the edited rows.

import type { TagOptions } from "./autotagPrefs";

export type ReviewRow = {
  key: string;
  title: string;
  existing: string[];
  tags: string[];
  /** lowercase tag -> where it came from ("AI", "OpenAlex", ...) */
  sources?: Record<string, string>;
  apply: boolean;
};

export function openReviewDialog(
  win: any,
  rows: ReviewRow[],
  _t: TagOptions,
): ReviewRow[] | null {
  const io: { rows: ReviewRow[]; accepted: boolean } = {
    rows: rows.map((r) => ({
      ...r,
      tags: [...r.tags],
      existing: [...r.existing],
      sources: { ...(r.sources || {}) },
    })),
    accepted: false,
  };
  try {
    win.openDialog(
      "chrome://autotag/content/review.xhtml",
      "autotag-review",
      "chrome,centerscreen,resizable,modal,width=780,height=640",
      io,
    );
  } catch (e) {
    (Zotero as any).debug?.(
      `Autotag: review dialog failed, applying directly: ${String(e)}`,
    );
    return rows;
  }
  return io.accepted ? io.rows.filter((r) => r.apply) : null;
}

declare const Zotero: any;
