import type { LLMProvider } from "./LLMProvider";
import {
  getApiKeyForProvider,
  getBaseUrlForProvider,
  getGenerationOptions,
  getModelForProvider,
} from "../autotagPrefs";
import { SYSTEM_JSON, httpJson } from "./http";

const headers = (): Record<string, string> => ({
  "Content-Type": "application/json",
  "x-api-key": getApiKeyForProvider("anthropic"),
  "anthropic-version": "2023-06-01",
});

export const AnthropicProvider: LLMProvider = {
  name: "anthropic",

  async generateTags(prompt) {
    const model = getModelForProvider("anthropic");
    if (!model) throw new Error("Anthropic: no model selected");
    const g = getGenerationOptions();
    const body: any = {
      model,
      max_tokens: g.maxTokens > 0 ? g.maxTokens : 4096,
      system: SYSTEM_JSON,
      messages: [{ role: "user", content: prompt }],
    };
    if (g.temperature !== null)
      body.temperature = Math.min(1, Math.max(0, g.temperature));
    const data = await httpJson(
      "POST",
      `${getBaseUrlForProvider("anthropic")}/messages`,
      headers(),
      body,
    );
    const text = (data?.content || [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("");
    if (!text) throw new Error("Anthropic response missing text content");
    return text;
  },

  async listModels() {
    const data = await httpJson(
      "GET",
      `${getBaseUrlForProvider("anthropic")}/models?limit=100`,
      headers(),
      undefined,
      15000,
    );
    return (data?.data || []).map((m: any) => String(m?.id)).filter(Boolean);
  },
};
