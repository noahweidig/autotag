# Autotag for Zotero

Your Zotero library keeps growing.
Your mental map of it quietly collapses.

**Autotag** is a Zotero plugin that helps researchers recover structure and meaning in large literature collections by automatically generating useful, content aware tags directly inside Zotero.

It is built for people who rely on Zotero every day and have reached the point where folders, memory, and manual tagging no longer scale.

---

## What's NEW

### v0.0.1

- **Settings live in Zotero's preferences** (Zotero > Settings > Autotag). The chain of popup dialogs is gone and every change saves instantly.
- New providers: **Anthropic (Claude)** and **Custom OpenAI-compatible** (LM Studio, vLLM, Groq, etc.). Ollama URL is configurable.
- **Test connection** button loads the live model list for your provider.
- **Review window** to edit, remove, and approve tags per item before they are applied.
- **Tag cleanup**: strips slashes and weird characters, merges duplicates (case, spacing, plurals), reuses the spelling of existing library tags, case/separator styles, word and length limits, blacklist, and replacement rules, with a live preview.
- More options: items per request, temperature, max tokens, timeout, JSON mode, tag language, max tags, prefix, marker tag, automatic tag type, skip already-tagged items, seed-only mode, share top library tags with the model, DOI as input, prompt presets.
- Item right-click menu entry and progress notifications.
- **Tag Manager** (Tools > Autotag: Tag Manager): find and merge duplicate tags across the whole library, fix formatting with your tag settings, search/rename/merge/delete tags in bulk, and undo each change. Duplicate detection (case, plurals, typos, word order, abbreviations) runs locally. An optional AI scan finds tags with the same meaning. It sends tag names only, in capped batches (default 150 tags per request, 3 requests per scan), remembers tags it already checked, and shows the estimated tokens before you run it, so it works on free API tiers.

## Why this exists

Manual tagging in Zotero has two persistent problems.

**First, it does not scale.**
As the number of items grows, keeping tags consistent becomes increasingly time consuming.

**Second, it drifts.**
Tags created months or years apart stop meaning the same thing. Similar papers end up with different tags, and the tag system slowly loses structure.

This plugin exists because maintaining tags by hand is both exhausting and unreliable over time.

Autotag does not try to invent a new organizational system.
It exists to **remove the burden of manual tagging** while keeping everything inside Zotero.

---

## How to Install

1. Download the .xpi file from the Releases page.

2. In Zotero, go to Tools → Add-ons.

3. Click the gear icon → Install Add-on from File…

4. Choose the downloaded .xpi

5. Restart Zotero.

**Compatibility:** Works with Zotero 6.999 through 9.0.x

## Setting Up

Before using Autotag, you must enter your API key.

1. Open Zotero.

2. Go to Tools → Autotag: settings…

3. Paste your API key (OpenAI or compatible).

4. Click Save.

## Using Autotag

1. Select one or more items in your Zotero library.

2. Go to Tools → Autotag: tag selected items.

3. Autotag will analyze the items and automatically add tags.

That’s it — the tags will appear directly on your items. Sometimes it might take longer depending on how many papers you selected. Be patient.

Once the auto-tagging process is done, a window will pop up to show you tags selected for each paper. You can verify/add/delete/edit tags as you want before adding them to your item.

## Demo

https://github.com/noahweidig/autotag/blob/main/assets/Autotag.mp4

## What Autotag Uses

Autotag sends only item metadata such as:

- title

- abstract

- authors

- publication

- date

- PDFs or full text are not uploaded.

---

## What this plugin does

Autotag adds an automatic tagging layer on top of your existing Zotero library.

It allows you to:

• Generate tags automatically based on item metadata and content  
• Apply tags at the collection level instead of one item at a time  
• Keep working fully inside Zotero without exporting data  
• Reduce the cognitive load of maintaining large libraries

The goal is not to replace your thinking.  
The goal is to remove repetitive and fragile manual work.

---

## What this plugin does NOT do

To avoid confusion, Autotag does not:

• Replace Zotero’s native tagging system  
• Change or delete your existing tags unless you confirm it in the Tag Manager  
• Claim perfect or authoritative tagging  
• Act as a recommendation engine or writing assistant

Think of it as a **supporting tool**, not an oracle.

---

## Current status

Project status:

• Core functionality implemented  
• Interfaces and behavior still evolving  
• Expect rough edges and frequent updates

This is an active research driven project.  
User feedback directly influences future changes.

---

## Roadmap

Planned directions include:

• Improving tag quality and transparency  
• Better controls over tag generation  
• Clearer previews before applying tags  
• Documentation with real research examples

Details may change as real usage patterns emerge.

---

## Feedback and contributions

Feedback is highly encouraged.

Especially useful feedback includes:

• Where tagging feels inaccurate or unhelpful  
• What kinds of tags you actually want in practice  
• How this fits or fails in your existing workflow

Bug reports and feature requests are welcome via issues.

---

## Motivation

Autotag was built by a researcher for researchers.

It comes from the experience of managing large literature collections where manual organization quietly becomes the bottleneck.

If that resonates with you, you are exactly the audience this plugin was built for.
