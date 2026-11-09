---
icon: lucide/plug
tags:
  - Providers
  - Getting started
---

# Set up a provider

Open **Zotero → Settings → Autotag** (or **Tools → Autotag: Settings…**). Every change saves instantly.

1. Pick a **Service**.
2. Paste your **API key** (use **Show** to check it).
3. Pick a **Model**, or click **Test connection** to load the live model list from your provider.

| Service | Key | Default base URL |
| --- | --- | --- |
| OpenAI | required | `https://api.openai.com/v1` |
| Anthropic (Claude) | required | `https://api.anthropic.com/v1` |
| Google Gemini | required | fixed (Google AI Studio) |
| DeepSeek | required | `https://api.deepseek.com/v1` |
| OpenRouter | required | `https://openrouter.ai/api/v1` |
| Custom (OpenAI-compatible) | optional | you enter it |
| Local (Ollama) | none | `http://127.0.0.1:11434` |

Each provider keeps its own key, model and base URL, so switching services does not erase the others.

!!! tip "Cheap and free options"

    The default models are small ones: `gpt-4o-mini`, `claude-haiku-5-5`, `gemini-3.6-flash`. Ollama and other local servers cost nothing per request.

## Custom endpoint

Choose **Custom (OpenAI-compatible)** for LM Studio, vLLM, Groq or any server that speaks the OpenAI chat API. Enter its base URL, a key if it needs one, and a model name.

## Keys are local

API keys live in Zotero's preferences on your computer. Autotag sends them only to the base URL of the provider you picked.
