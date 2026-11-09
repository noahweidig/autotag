---
icon: lucide/lock
tags:
  - Privacy
---

# Privacy

Autotag has no server, no account and no analytics. It talks only to the provider you pick.

## Tagging

Per item, Autotag sends the fields you leave checked under **What is sent to the model**. By default that is title, abstract, authors, publication, date and existing tags. DOI and extracted PDF text are off.

!!! warning "PDF text"

    **Extracted PDF text** sends the beginning of the paper's text (or all of it) to your provider. It is off by default. Leave it off for unpublished or confidential papers unless you use a local model.

If you share your most-used library tags with the model, those tag names go along in each request.

## Tag Manager

Duplicate and formatting scans run on your computer. The AI scan sends tag names only, in capped batches, after showing a token estimate.

## Keys

API keys are stored in Zotero's preferences on your computer and sent only to the provider's base URL.

## Fully offline

Choose **Local (Ollama)** and nothing leaves your machine.
