import { describe, expect, it } from "vitest";
import { highlightCode } from "../../src/utils/codeHighlight";

describe("highlightCode", () => {
  it("never names a span `code-block`, the app's own code block class", () => {
    const html = highlightCode("```mermaid\nflowchart LR\n    A --> B\n```\n", "markdown");
    expect(html).not.toMatch(/\bcode-block\b/);
    expect(html).toContain("fence-body");
  });
});
