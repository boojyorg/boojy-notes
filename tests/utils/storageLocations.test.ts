import { describe, expect, it } from "vitest";
import {
  locationPath,
  removeLocationPrompt,
  splitLocation,
} from "../../src/utils/storageLocations";

const loc = (name: string, path: string, current = false) => ({
  name,
  path,
  current,
  exists: true,
  cloud: false,
});

describe("locationPath and splitLocation", () => {
  it("names home and the cloud providers, and splits off the folder's name", () => {
    expect(locationPath("/Users/tyr/Library/Mobile Documents/com~apple~CloudDocs/Journal")).toBe(
      "iCloud Drive/Journal",
    );
    expect(
      locationPath("/Users/tyr/Library/CloudStorage/GoogleDrive-tyr@x.com/My Drive/Notes"),
    ).toBe("Google Drive/My Drive/Notes");
    expect(locationPath("/Users/tyr/Library/CloudStorage/Dropbox/Notes")).toBe("Dropbox/Notes");
    expect(splitLocation("/Users/tyr/Documents/Boojy/Notes")).toEqual({
      parent: "~/Documents/Boojy",
      name: "Notes",
    });
    expect(splitLocation("/Notes")).toEqual({ parent: "/", name: "Notes" });
  });
});

describe("removeLocationPrompt", () => {
  it("says the folder stays, and never in the danger colour", () => {
    const p = removeLocationPrompt(loc("Uni", "/Users/tyr/Uni"));
    expect(p.title).toBe('Remove "Uni" from Boojy Notes?');
    expect(p.message).toContain("stay in ~/Uni");
    expect(p.confirmLabel).toBe("Remove");
    expect(p.danger).toBe(false);
  });

  it("says where the app goes when the open location is removed", () => {
    const p = removeLocationPrompt(
      loc("Notes", "/Users/tyr/Notes", true),
      loc("Uni", "/Users/tyr/Uni"),
    );
    expect(p.message).toContain('switch to "Uni"');
    expect(p.confirmLabel).toBe("Remove and switch");
  });
});
