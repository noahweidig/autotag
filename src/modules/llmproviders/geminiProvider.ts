import type { LLMProvider } from "./LLMProvider";
import {
  getApiKeyForProvider,
  getBaseUrlForProvider,
  getGenerationOptions,
  getModelForProvider,
} from "../autotagPrefs";
import { httpJson } from "./http";

export const GeminiProvider: LLMProvider = {
  name: "gemini",

  async generateTags(prompt) {
    const model = getModelForProvider("gemini").replace(/^models\//, "");
    if (!model) throw new Error("Gemini: no model selected");
    const g = getGenerationOptions();
    const generationConfig: any = {};
    if (g.temperature !== null) generationConfig.temperature = g.temperature;
    if (g.maxTokens > 0) generationConfig.maxOutputTokens = g.maxTokens;
    // Thinking models spend most of the latency on reasoning; tagging doesn't need it.
    if (/^gemini-3.*(flash|lite)/i.test(model))
      generationConfig.thinkingConfig = { thinkingLevel: "minimal" };
    else if (/^gemini-2\.5.*(flash|lite)/i.test(model))
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    if (g.jsonMode) generationConfig.responseMimeType = "application/json";

    const data = await httpJson(
      "POST",
      `${getBaseUrlForProvider("gemini")}/models/${encodeURIComponent(model)}:generateContent`,
      {
        "Content-Type": "application/json",
        "x-goog-api-key": getApiKeyForProvider("gemini"),
      },
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      },
    );
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map((p: any) => p?.text || "")
      .join("");
    if (!text) throw new Error("Gemini response missing text content");
    return text;
  },

  generateJson(prompt) {
    return this.generateTags(prompt);
  },

  async listModels() {
    const data = await httpJson(
      "GET",
      `${getBaseUrlForProvider("gemini")}/models?pageSize=200`,
      { "x-goog-api-key": getApiKeyForProvider("gemini") },
      undefined,
      15000,
    );
    return (data?.models || [])
      .filter((m: any) =>
        (m?.supportedGenerationMethods || []).includes("generateContent"),
      )
      .map((m: any) => String(m?.name || "").replace(/^models\//, ""))
      .filter(Boolean);
  },
};
