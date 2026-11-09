---
icon: lucide/life-buoy
tags:
  - Help
---

# Troubleshooting

**Nothing happens when I run Autotag.**
Check that a provider, key and model are set in Settings. Click **Test connection**.

**The model list is empty.**
**Test connection** loads it live. Confirm the key, and for custom or local servers confirm the base URL.

**Tagging is slow on a free Gemini key.**
Autotag sends 3 batches at once, retries rate limits (429) with backoff, and turns off extra "thinking" on Gemini Flash models. Raise **Items per request** (for example 15 to 20) to cut the number of calls; free tiers limit requests per minute more than tokens.

**Requests time out.**
Raise **Timeout** (120 seconds by default) or lower **Items per request** (5 by default). Local models are slower.

**Tags come back malformed.**
Turn on **JSON mode** if your provider supports it, or try a stronger model.

**Tags are not in my language or style.**
Set **Tag language**, letter case, separator, and a prompt that describes the tags you want.

**I want to undo tags Autotag added.**
Set a **Marker tag** before the next run; it lets you find and remove everything Autotag touched. Tag Manager merges can be undone one by one.

**Menu entries are missing.**
Check **Show Autotag in the Tools menu / item right-click menu** in Settings, then restart the Zotero window.

Still stuck? [Open an issue](https://github.com/noahweidig/autotag/issues).
