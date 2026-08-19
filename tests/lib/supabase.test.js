import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The client must never be constructed on desktop: supabase-js starts session
// recovery + token auto-refresh on construction, and local-only means zero
// cloud traffic. These tests import the module fresh per case with the
// platform and env varied.

// tests/setup.js globally mocks src/lib/supabase to { supabase: null };
// this suite tests the real module, so lift that mock for the whole file.
vi.unmock("../../src/lib/supabase");

const createClient = vi.fn(() => ({ mock: "client" }));

async function importSupabase({ electron, keys }) {
  vi.resetModules();
  vi.doMock("@supabase/supabase-js", () => ({ createClient }));
  vi.doMock("../../src/utils/platform", () => ({
    isElectron: electron,
    isNative: electron,
    isWeb: !electron,
    platform: electron ? "electron" : "web",
  }));
  // Stub explicitly in both directions — a developer's .env.local may set real
  // keys, so "no keys" must be forced rather than assumed.
  vi.stubEnv("VITE_SUPABASE_URL", keys ? "https://example.supabase.co" : "");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", keys ? "anon-key" : "");
  return import("../../src/lib/supabase.js");
}

describe("lib/supabase", () => {
  beforeEach(() => createClient.mockClear());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@supabase/supabase-js");
    vi.doUnmock("../../src/utils/platform");
  });

  it("never creates a client on desktop, even with env keys present", async () => {
    const { supabase } = await importSupabase({ electron: true, keys: true });
    expect(supabase).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("creates the client on web when env keys are present", async () => {
    const { supabase } = await importSupabase({ electron: false, keys: true });
    expect(supabase).not.toBeNull();
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("stays null on web without env keys", async () => {
    const { supabase } = await importSupabase({ electron: false, keys: false });
    expect(supabase).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });
});
