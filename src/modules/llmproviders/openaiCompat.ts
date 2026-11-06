import type { LLMProvider } from "./LLMProvider";
import {
  getApiKeyForProvider,
  getBaseUrlForProvider,
  getGenerationOptions,
  getModelForProvider,
} from "../autotagPrefs";
import { getProviderInfo } from "./providerInfo";
import { SYSTEM_JSON, httpJson, rejectsTemperature } from "./http";

export function makeOpenAICompatProvider(id: string): LLMProvider {
  const info = getProviderInfo(id);

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    const key = getApiKeyForProvider(id);
    if (key) h.Authorization = `Bearer ${key}`;
    if (id === "openrouter") {
      h["HTTP-Referer"] = "https://github.com/noahweidig/autotag";
      h["X-OpenRouter-Title"] = "Autotag Zotero Plugin";
    }
    return h;
  };

  return {
    name: id,

    async generateTags(prompt) {
      const base = getBaseUrlForProvider(id);
      if (!base) throw new Error(`${info.label}: Base URL not set`);
      const model = getModelForProvider(id);
      if (!model) throw new Error(`${info.label}: no model selected`);
      const g = getGenerationOptions();

      const body: any = {
        model,
        messages: [
          { role: "system", content: SYSTEM_JSON },
          { role: "user", content: prompt },
        ],
      };
      if (g.temperature !== null && !rejectsTemperature(model)) {
        body.temperature = g.temperature;
      }
      if (g.maxTokens > 0) body.max_tokens = g.maxTokens;
      if (g.jsonMode) body.response_format = { type: "json_object" };

      const data = await httpJson(
        "POST",
        `${base}/chat/completions`,
        headers(),
        body,
      );
      const content = data?.choices?.[0]?.message?.content;
      if (!content)
        throw new Error(`${info.label} response missing message content`);
      return String(content);
    },

    async listModels() {
      const base = getBaseUrlForProvider(id);
      if (!base) throw new Error("Base URL not set");
      const data = await httpJson(
        "GET",
        `${base}/models`,
        headers(),
        undefined,
        15000,
      );
      const list: any[] = data?.data || data?.models || [];
      return list
        .map((m) => String(m?.id ?? m?.name ?? ""))
        .filter(Boolean)
        .sort();
    },
  };
}
