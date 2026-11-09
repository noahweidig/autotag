# Tag without AI

Autotag can tag items with no AI model and no API key.

Pick **Settings > Autotag > General > Tagging method**, or use the item right-click menu: **Autotag > Suggest tags without AI**. Right-clicking a collection also offers **Autotag collection**.

## Sources

| Source | Needs | What you get |
| --- | --- | --- |
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
