/**
 * AI provider and model definitions.
 */

export const PROVIDERS = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    models: [
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
      { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
    ],
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com",
    models: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini" },
      { id: "o1", label: "o1" },
      { id: "o3-mini", label: "o3-mini" },
    ],
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ],
  },
  local: {
    id: "local",
    label: "Local / Custom",
    defaultBaseUrl: "http://localhost:11434/v1",
    models: [{ id: "custom", label: "Custom Model" }],
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

export function getDefaultModel(providerId) {
  const provider = PROVIDERS[providerId];
  return provider?.models[0]?.id || "";
}

export function getModelsForProvider(providerId) {
  return PROVIDERS[providerId]?.models || [];
}
