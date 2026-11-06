import type { LLMProvider } from "./LLMProvider";
import { makeOpenAICompatProvider } from "./openaiCompat";
import { AnthropicProvider } from "./anthropicProvider";
import { GeminiProvider } from "./geminiProvider";
import { LocalProvider } from "./localProvider";
import { getSelectedProvider } from "../autotagPrefs";

export function getLLMProviderById(id: string): LLMProvider {
  switch (id) {
    case "anthropic":
      return AnthropicProvider;
    case "gemini":
      return GeminiProvider;
    case "local":
      return LocalProvider;
    case "deepseek":
    case "openrouter":
    case "custom":
    case "openai":
    default:
      return makeOpenAICompatProvider(
        id === "deepseek" || id === "openrouter" || id === "custom"
          ? id
          : "openai",
      );
  }
}

export function getLLMProvider(): LLMProvider {
  return getLLMProviderById(getSelectedProvider());
}
