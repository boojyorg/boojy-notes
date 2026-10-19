/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({ theme: { BG: {}, TEXT: {}, ACCENT: "#A4CACE", overlay: () => "" } }),
}));
// On the phone `/` sits on the keyboard's second layer: the bar is the way in.
vi.mock("../../src/utils/platform", async (actual) => ({ ...(await actual()), isPhone: true }));

const { default: EditableBlock } = await import("../../src/components/EditableBlock.jsx");
const { paragraph } = await import("../mocks/blocks.js");

afterEach(cleanup);

describe("an empty note on the phone", () => {
  it("shows no Type / placeholder", () => {
    const { container } = render(
      <EditableBlock
        block={paragraph("")}
        blockIndex={0}
        noteId="note-1"
        syncGen={1}
        registerRef={() => {}}
        noteTitleSet={new Set()}
        noteDataRef={{ current: {} }}
      />,
    );
    const p = container.querySelector('[data-block-type="p"]');
    expect(p?.classList.contains("empty-block")).toBe(false);
    expect(p?.hasAttribute("data-empty")).toBe(false);
  });
});
