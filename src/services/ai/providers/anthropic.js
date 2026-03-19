/**
 * Anthropic Messages API streaming provider.
 */

export async function* stream(messages, { apiKey, model, baseUrl, maxTokens, signal }) {
  const url = `${baseUrl || "https://api.anthropic.com"}/v1/messages`;

  const body = {
    model,
    max_tokens: maxTokens || 4096,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
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
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          yield parsed.delta.text;
        }
      } catch {
        // skip malformed JSON
      }
    }
  }
}
