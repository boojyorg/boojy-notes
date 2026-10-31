/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// Real Prism, unlike CodeBlock.test: a grammar that fails to load (C++ needs C
// first) still shows its label and tick, so only the colours can tell.
vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      BG: { elevated: "#FFFFFF", divider: "#E9E9E9", hover: "#ECECEC", surface: "#F4F4F5" },
      ACCENT: { primary: "#8FC1C6", text: "#2A737D", onAccent: "#FFFFFF" },
      SEMANTIC: { error: "#B3261E" },
      modalShadow: "none",
    },
    isDark: false,
  }),
}));

import CodeBlock from "../../src/components/CodeBlock";

afterEach(cleanup);

/** Each new language by its full name and its short one, with a line it colours. */
const SAMPLES = [
  ["markdown", "# Heading **bold**"],
  ["md", "# Heading **bold**"],
  ["latex", "\\section{Intro} $x^2$"],
  ["tex", "\\section{Intro} $x^2$"],
  ["csharp", "public class A { int x = 1; }"],
  ["cs", "public class A { int x = 1; }"],
  ["c#", "public class A { int x = 1; }"],
  ["cpp", "#include <vector>\nint main() { return 0; }"],
  ["c++", "#include <vector>\nint main() { return 0; }"],
  ["java", "public class A { int x = 1; }"],
  ["r", "x <- c(1, 2, 3) # comment"],
];

describe("code block colours", () => {
  it.each(SAMPLES)("colours %s", (lang, text) => {
    const { container } = render(
      <CodeBlock
        block={{ id: "b1", type: "code", text, lang }}
        noteId="n"
        blockIndex={0}
        syncGen={1}
        onUpdateCode={vi.fn()}
        onUpdateBlock={vi.fn()}
        onBlockNav={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".code-overlay .token").length).toBeGreaterThan(0);
  });
});
