/**
 * AI provider router — dispatches to the correct provider's streaming function.
 */
import { stream as anthropicStream } from "./providers/anthropic.js";
import { stream as openaiStream } from "./providers/openai.js";
import { stream as geminiStream } from "./providers/gemini.js";

const providers = {
  anthropic: anthropicStream,
  openai: openaiStream,
  gemini: geminiStream,
  local: openaiStream, // Ollama/LM Studio are OpenAI-compatible
};

/**
 * Create a chat function bound to the given config.
 * Returns an async generator that yields text deltas.
 */
export function createAIRouter(config) {
  return {
    /**
     * @param {Array<{role: string, content: string}>} messages
     * @param {{ signal?: AbortSignal }} options
     * @returns {AsyncGenerator<string>}
     */
    chat(messages, options = {}) {
      const streamFn = providers[config.provider];
      if (!streamFn) throw new Error(`Unknown AI provider: ${config.provider}`);
      return streamFn(messages, {
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        maxTokens: config.maxTokens,
        signal: options.signal,
      });
    },
  };
}
