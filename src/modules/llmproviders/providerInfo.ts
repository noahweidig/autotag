// Static provider metadata (no pref imports; safe to import anywhere).

export type ProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "openrouter"
  | "custom"
  | "local";

export type ProviderInfo = {
  id: ProviderId;
  label: string;
  needsKey: boolean;
  keyOptional?: boolean;
  baseUrlEditable: boolean;
  baseUrlDefault: string;
  keyHelpURL?: string;
  defaultModel: string;
  presets: string[];
  hint: string;
};

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    needsKey: true,
    baseUrlEditable: true,
    baseUrlDefault: "https://api.openai.com/v1",
    keyHelpURL: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-4o-mini",
    presets: [
      "gpt-4o-mini",
      "gpt-4o",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-3.5-turbo",
      "o3",
    ],
    hint: "Cloud models from OpenAI. Base URL can point to any OpenAI-compatible endpoint.",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    needsKey: true,
    baseUrlEditable: true,
    baseUrlDefault: "https://api.anthropic.com/v1",
    keyHelpURL: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-haiku-5-5",
    presets: [
      "claude-haiku-5-5",
      "claude-sonnet-5-5",
      "claude-opus-5-5",
      "claude-fable-5-1",
    ],
    hint: "Claude models through the Anthropic Messages API.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    needsKey: true,
    baseUrlEditable: false,
    baseUrlDefault: "https://generativelanguage.googleapis.com/v1beta",
    keyHelpURL: "https://aistudio.google.com/app/apikey",
    defaultModel: "gemini-3.6-flash",
    presets: [
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-3.1-pro-preview",
    ],
    hint: "Gemini models through Google AI Studio.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    needsKey: true,
    baseUrlEditable: true,
    baseUrlDefault: "https://api.deepseek.com/v1",
    keyHelpURL: "https://platform.deepseek.com/api_keys",
    defaultModel: "deepseek-chat",
    presets: ["deepseek-chat", "deepseek-reasoner"],
    hint: "Low-cost models from DeepSeek.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    needsKey: true,
    baseUrlEditable: true,
    baseUrlDefault: "https://openrouter.ai/api/v1",
    keyHelpURL: "https://openrouter.ai/keys",
    defaultModel: "anthropic/claude-4.6-sonnet-20260217",
    presets: [
      "anthropic/claude-4.6-sonnet-20260217",
      "anthropic/claude-4.7-opus-20260416",
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "google/gemini-3-flash-preview-20251217",
      "deepseek/deepseek-v4-flash-20260423",
      "deepseek/deepseek-v4-pro-20260423",
      "moonshotai/kimi-k2.6-20260420",
      "tencent/hy3-preview-20260421",
    ],
    hint: "One key for models from many vendors.",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    needsKey: true,
    keyOptional: true,
    baseUrlEditable: true,
    baseUrlDefault: "",
    defaultModel: "",
    presets: [],
    hint: "Any server that implements /chat/completions: LM Studio, vLLM, Groq, Together, Azure proxies, etc. Base URL is required.",
  },
  {
    id: "local",
    label: "Local (Ollama)",
    needsKey: false,
    baseUrlEditable: true,
    baseUrlDefault: "http://127.0.0.1:11434",
    defaultModel: "",
    presets: [],
    hint: "Runs fully offline through Ollama. Use Test connection to list installed models.",
  },
];

export function getProviderInfo(id: string): ProviderInfo {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}

export function isOpenAICompat(id: string): boolean {
  return (
    id === "openai" ||
    id === "deepseek" ||
    id === "openrouter" ||
    id === "custom"
  );
}
