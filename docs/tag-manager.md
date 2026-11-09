---
icon: lucide/merge
tags:
  - Tag Manager
---

# Tag Manager

**Tools → Autotag: Tag Manager…** works on every tag in the library. Nothing changes until you press **Merge**, and each change can be undone.

## Scans

| Scan | What it finds | Where it runs |
| --- | --- | --- |
| Duplicates | Case, plurals, typos, word order, abbreviations | Your computer. Nothing is sent. |
| Formatting | Tags that break your Autotag cleanup settings (case, separators, replacement rules) | Your computer. |
| Similar meaning (AI) | Synonyms and other tags that mean the same thing | Your LLM provider. Tag names only. |

For each group of duplicates, the most-used tag is the default target. Ties go to the shorter name, then alphabetical order. Pick which groups to merge, then press **Merge**.

## AI scan budget

The AI scan is built to work on free API tiers.

- Sends tag names only: no items, abstracts or counts.
- Default cap: 150 tags per request, 3 requests per scan.
- Shows the estimated token count before you run it.
- Remembers tags it already checked, so the next scan covers new ones. **Forget checked tags** resets that.
- Adds your most-used tags (20 by default) to each batch as merge targets.

Change the caps under **Budget** in the manager (20 to 500 tags per request, 1 to 10 requests).

## All tags

The **All tags** pane lists every tag. Search, sort (most used, A to Z, least used), filter (used once, used more than once), then rename, merge or delete in bulk. Select tags, enter the target, and merge.
