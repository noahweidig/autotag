---
icon: lucide/settings
tags:
  - Settings
---

# Settings

**Zotero → Settings → Autotag.** Every control saves instantly.

## Workflow

| Setting | Default |
| --- | --- |
| Review suggested tags before applying | on |
| Skip items that already have tags | off |
| Add tags as automatic | off |
| Show Autotag in the Tools menu | on |
| Show Autotag in the item right-click menu | on |
| Marker tag | empty |

Menu changes need a window restart.

## What is sent to the model

Each field is a checkbox.

| Field | Default |
| --- | --- |
| Title | on |
| Abstract | on |
| Authors | on |
| Journal / publication | on |
| Date | on |
| Existing tags | on |
| DOI | off |
| Extracted PDF text | off |

With PDF text on, choose **First N characters** (4000 by default) or **Full text**.

## Tag vocabulary

Seed keywords, **Only allow seed keywords**, **Show the model your most-used library tags** (100 by default, 10 to 1000), and **Tag language**.

## Tag cleanup { #tag-cleanup }

Applied to every tag before review and again after your edits. A live **Try it** box previews the result.

- Remove slashes (`a/b` becomes `a b`): on
- Remove weird characters and symbols: on
- Merge duplicates (case, spacing, plurals): on
- Reuse the spelling of matching library tags: on
- **Letter case**: keep as returned, lowercase, snake_case, kebab-case, Title Case
- **Word separator**: keep, space, underscore, hyphen
- **Max tags per item**: 8 (0 = no limit)
- **Max words per tag**: 4 (0 = no limit)
- **Max tag length**: 40 characters (0 = no limit)
- **Prefix**: added to every tag
- **Blacklist**: tags to drop
- **Replacement rules**: rewrite one tag as another

## Prompt

Pick a preset or write your own. Autotag adds the output format, tag limits, language and vocabulary instructions itself. **Reset to default** restores the original.

## Advanced

| Setting | Default |
| --- | --- |
| Items per request | 5 |
| Temperature | 0.2 (blank = provider default) |
| Max tokens | 0 (provider default) |
| Timeout | 120 seconds |
| JSON mode | off |
