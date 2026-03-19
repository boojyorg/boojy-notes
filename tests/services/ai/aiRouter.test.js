import { describe, it, expect, vi, beforeEach } from "vitest";

// Create mock stream functions for each provider
const mockAnthropicStream = vi.fn();
const mockOpenaiStream = vi.fn();
const mockGeminiStream = vi.fn();

vi.mock("../../../src/services/ai/providers/anthropic.js", () => ({
  stream: mockAnthropicStream,
}));
vi.mock("../../../src/services/ai/providers/openai.js", () => ({
  stream: mockOpenaiStream,
}));
vi.mock("../../../src/services/ai/providers/gemini.js", () => ({
  stream: mockGeminiStream,
}));

let createAIRouter;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("../../../src/services/ai/aiRouter.js");
  createAIRouter = mod.createAIRouter;
});

describe("createAIRouter", () => {
  it("returns an object with a chat method", () => {
    const router = createAIRouter({ provider: "openai", apiKey: "key", model: "gpt-4o" });
    expect(router).toHaveProperty("chat");
    expect(typeof router.chat).toBe("function");
  });

  it("throws for unknown provider", () => {
    const router = createAIRouter({ provider: "unknown", apiKey: "key", model: "m" });
    expect(() => router.chat([{ role: "user", content: "hi" }])).toThrow(
      "Unknown AI provider: unknown",
    );
  });
});

describe("provider routing", () => {
  it("routes to anthropic provider", () => {
    const router = createAIRouter({
      provider: "anthropic",
      apiKey: "sk-ant",
      model: "claude-sonnet-4-6",
    });
    const messages = [{ role: "user", content: "hello" }];
    router.chat(messages);

    expect(mockAnthropicStream).toHaveBeenCalledTimes(1);
    expect(mockOpenaiStream).not.toHaveBeenCalled();
    expect(mockGeminiStream).not.toHaveBeenCalled();
  });

  it("routes to openai provider", () => {
    const router = createAIRouter({ provider: "openai", apiKey: "sk-oai", model: "gpt-4o" });
    router.chat([{ role: "user", content: "test" }]);

    expect(mockOpenaiStream).toHaveBeenCalledTimes(1);
    expect(mockAnthropicStream).not.toHaveBeenCalled();
  });

  it("routes to gemini provider", () => {
    const router = createAIRouter({
      provider: "gemini",
      apiKey: "gem-key",
      model: "gemini-2.5-pro",
    });
    router.chat([{ role: "user", content: "test" }]);

    expect(mockGeminiStream).toHaveBeenCalledTimes(1);
    expect(mockAnthropicStream).not.toHaveBeenCalled();
  });

  it("routes local provider to openai stream (OpenAI-compatible)", () => {
    const router = createAIRouter({ provider: "local", apiKey: "", model: "custom" });
    router.chat([{ role: "user", content: "test" }]);

    expect(mockOpenaiStream).toHaveBeenCalledTimes(1);
  });
});

describe("config forwarding", () => {
  it("passes apiKey, model, baseUrl, maxTokens, and signal to the stream function", () => {
    const controller = new AbortController();
    const config = {
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-4o",
      baseUrl: "https://custom.api.com",
      maxTokens: 2048,
    };
    const router = createAIRouter(config);
    const messages = [{ role: "user", content: "hello" }];
    router.chat(messages, { signal: controller.signal });

    expect(mockOpenaiStream).toHaveBeenCalledWith(messages, {
      apiKey: "sk-test",
      model: "gpt-4o",
      baseUrl: "https://custom.api.com",
      maxTokens: 2048,
      signal: controller.signal,
    });
  });

  it("passes messages array through to the stream function", () => {
    const router = createAIRouter({
      provider: "anthropic",
      apiKey: "key",
      model: "claude-sonnet-4-6",
    });
    const messages = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "What is 2+2?" },
    ];
    router.chat(messages);

    expect(mockAnthropicStream).toHaveBeenCalledWith(
      messages,
      expect.objectContaining({ apiKey: "key", model: "claude-sonnet-4-6" }),
    );
  });

  it("defaults signal to undefined when no options provided", () => {
    const router = createAIRouter({ provider: "openai", apiKey: "k", model: "m" });
    router.chat([{ role: "user", content: "hi" }]);

    expect(mockOpenaiStream).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ signal: undefined }),
    );
  });
});
