# Tag without AI

Autotag can tag items with no AI model and no API key.

Pick **Settings > Autotag > General > Tagging method**, or use the item right-click menu: **Autotag > Suggest tags without AI**. Right-clicking a collection also offers **Autotag collection**.

## Sources

| Source | Needs | What you get |
| --- | --- | --- |
| Your library | Title or abstract, and a tagged library | The tags carried by your most similar tagged items. Uses your own vocabulary. |
| OpenAlex | DOI | Keywords (filtered by score) and the broad research subfield. All disciplines. |
| PubMed | DOI | MeSH headings and author keywords. Biomedical papers only. |
| Crossref | DOI | Journal subject categories. Often empty. Off by default. |
| Offline extraction | Title or abstract | Repeated phrases from the text (English). Runs locally. |

Only the DOI is sent to OpenAlex, PubMed and Crossref. Offline extraction sends nothing.

By default, offline extraction runs only for items where the lookups found nothing.

## Limits

- OpenAlex limits anonymous use per network IP address. If you see rate limit errors, add a free API key under Free sources.
- OpenAlex keywords are machine-assigned, not chosen by the authors. Raise the minimum score for fewer, safer tags.
- Offline extraction is plain phrase scoring. Expect weaker results than an AI model, especially with short abstracts.

Results go through the same tag cleanup, library spelling reuse, seed keywords and review window as AI tags. Each tag in the review window shows where it came from.

## Item pane

The item pane has an **Autotag suggestions** section for regular items. Click **Suggest (free)** or **Suggest (AI)**, then click a tag to add it, or **Add all**. Nothing is looked up until you click. Turn the section off under Settings > General (restart Zotero).

## Your library

Autotag compares an item's title and abstract with every tagged item in the same library (TF-IDF cosine similarity), takes the closest 8 by default, and proposes tags that at least 2 of them carry. It runs on your computer and sends nothing.

- It needs at least 30 tagged items by default (Settings > Free sources). Below that it is skipped and the run says so.
- Results are only as good as your existing tags. If your library is inconsistently tagged, the suggestions will be too.
- Library suggestions come first, then PubMed, OpenAlex, Crossref and offline extraction.

## Learning from your edits

When learning is on (Settings > Tag rules), Autotag remembers what you do:

- **Removed tags.** A tag you remove in the review window, or reject with the x in the item pane, is hidden once you have removed it twice, minus the times you kept it.
- **Replacements.** If you remove a tag and add a related one (ML for machine learning), that pair is applied automatically after you have made it twice. A one-for-one swap on a single item counts as a replacement.
- Deselecting a whole item in the review window, or clicking Dismiss in the item pane, teaches nothing.

The learned data is stored in your Zotero profile preferences, not synced. Settings > Tag rules shows what is active and has a button to forget it all.
