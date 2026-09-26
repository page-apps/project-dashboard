import { describe, expect, it } from "vitest";

import {
  createDefaultSettings,
  loadSettings,
  saveSettings,
  SETTINGS_STORAGE_KEY,
  updateSettings,
} from "./settings.ts";

describe("settings helpers", () => {
  it("loads defaults when nothing is persisted", () => {
    expect(loadSettings()).toEqual(createDefaultSettings());
  });

  it("round-trips settings through localStorage", () => {
    const nextSettings = updateSettings(createDefaultSettings(), {
      theme: "dark",
      repositorySearch: "frontend",
    });

    saveSettings(nextSettings);

    expect(loadSettings()).toEqual(nextSettings);
  });

  it("falls back gracefully on invalid JSON", () => {
    globalThis.localStorage.setItem(SETTINGS_STORAGE_KEY, "nope");

    expect(loadSettings()).toEqual(createDefaultSettings());
  });
});
