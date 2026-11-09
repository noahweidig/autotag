---
icon: lucide/tags
tags:
  - Tagging
  - Review
---

# Tag your items

1. Select one or more items (or a whole collection's worth).
2. Right-click → **Autotag**, or **Tools → Autotag: Tag Selected Items**.
3. Wait. Large selections take longer; items go to the model in batches (5 per request by default).
4. Check the tags in the [review window](#review-window) and approve.

Tags appear on your items when you approve.

## Review window { #review-window }

When **Review suggested tags before applying** is on (the default), a window lists the suggested tags for each paper. You can:

- edit a tag
- remove a tag
- add a tag
- approve the set for each item

Cleanup rules run on every tag before review and again after your edits.

Turn the review off in **Settings → Workflow** to apply tags directly.

## Steering the tags

- **Seed keywords**: a comma-separated list the model should prefer. Switch on **Only allow seed keywords** to drop everything else.
- **Show the model your most-used library tags**: the model sees your top tags (100 by default) and reuses them instead of inventing synonyms.
- **Tag language**: ask for tags in a specific language.
- **Prompt presets**: start from a preset and describe what good tags look like in your field. Output format, limits and vocabulary instructions are added for you.

## Keeping track of what Autotag did

- **Marker tag**: set a tag such as `autotagged` and Autotag adds it to every item it touches, so you can find or remove those tags later.
- **Add tags as automatic**: tags show gray in Zotero's tag selector.
- **Skip items that already have tags**: leaves hand-tagged items alone.

Next: [clean up the tags you already have](tag-manager.md).
