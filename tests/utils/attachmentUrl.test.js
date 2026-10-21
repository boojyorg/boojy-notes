/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ isElectron: true, isPhone: false }));
vi.mock("../../src/utils/platform", () => platform);

import {
  attachmentName,
  attachmentUrls,
  resolveAttachmentUrl,
} from "../../src/utils/attachmentUrl";

describe("attachmentUrls on the phone", () => {
  const base = "https://localhost/_capacitor_file_/data/user/0/org.boojy.notes/files/vault";
  beforeEach(() => {
    platform.isElectron = false;
    platform.isPhone = true;
    window.boojyPhoneAPI = { vaultAddress: base };
  });
  afterEach(() => {
    platform.isElectron = true;
    platform.isPhone = false;
    delete window.boojyPhoneAPI;
  });

  it("tries the desktop's order, as written then under attachments/, each encoded in the path", () => {
    expect(attachmentUrls("Captura de pantalla #2.png")).toEqual([
      `${base}/Captura%20de%20pantalla%20%232.png`,
      `${base}/attachments/Captura%20de%20pantalla%20%232.png`,
    ]);
    expect(attachmentUrls("photos/Beach day.jpg")).toEqual([
      `${base}/photos/Beach%20day.jpg`,
      `${base}/attachments/photos/Beach%20day.jpg`,
    ]);
  });

  it("leaves a web address and inline data alone", () => {
    expect(attachmentUrls("https://example.com/a.png")).toEqual(["https://example.com/a.png"]);
    expect(attachmentUrls("//example.com/a.png")).toEqual(["//example.com/a.png"]);
    expect(attachmentUrls("data:image/png;base64,AAAA")).toEqual(["data:image/png;base64,AAAA"]);
  });
});

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
