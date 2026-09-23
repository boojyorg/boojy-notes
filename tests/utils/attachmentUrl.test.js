import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/platform", () => ({ isElectron: true }));

import { attachmentName, resolveAttachmentUrl } from "../../src/utils/attachmentUrl";

/** How the `boojy-att` handler in electron/main.js reads a name back. */
const nameFromUrl = (url) => decodeURIComponent(new URL(url).pathname.slice(1));

describe("resolveAttachmentUrl on the desktop", () => {
  it.each([
    "plain.png",
    "Screenshot 2026-09-23 at 10.12.33.png",
    "a[1].png",
    "100% done.png",
    "plan #2.png",
    "what?.png",
    "Café menu.png",
    "photos/Beach day.jpg",
  ])("carries %j in the URL's path, where the handler reads it back unchanged", (name) => {
    const url = resolveAttachmentUrl(name);
    expect(new URL(url).host).toBe("vault");
    expect(nameFromUrl(url)).toBe(name);
  });

  it("leaves a data URL and an empty name alone", () => {
    expect(resolveAttachmentUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(resolveAttachmentUrl("")).toBe("");
  });
});

describe("attachmentName: the name the full-size view shows", () => {
  it("is the file's name as Finder shows it, decoded, from a path or an address", () => {
    expect(attachmentName("attachments/Captura de pantalla 2026-09-23 a las 10.12.33.png")).toBe(
      "Captura de pantalla 2026-09-23 a las 10.12.33.png",
    );
    expect(attachmentName("Shot%20(2).png")).toBe("Shot (2).png");
    expect(attachmentName("https://example.com/img/chart.png?v=2#x")).toBe("chart.png");
    expect(attachmentName("100%.png")).toBe("100%.png");
  });

  it("is empty for inline data and nothing", () => {
    expect(attachmentName("data:image/png;base64,AAAA")).toBe("");
    expect(attachmentName("")).toBe("");
  });
});
