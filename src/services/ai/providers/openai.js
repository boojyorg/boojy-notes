/**
 * OpenAI-compatible streaming provider.
 * Also handles Local/Custom models (Ollama, LM Studio) which use the same API format.
 */

export async function* stream(messages, { apiKey, model, baseUrl, maxTokens, signal }) {
  const url = `${baseUrl || "https://api.openai.com"}/v1/chat/completions`;

  const body = {
    model,
    max_tokens: maxTokens || 4096,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  };

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // skip malformed JSON
      }
    }
  }
}
